import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { dailyWindow, readingResult, readingFingerprint, verifyImageArchive, nextObjective, decision, fingerprint, novelties, supervise } from './supervisor.mjs';

const limits = { rounds: 6, seconds: 60, stalls: 2 };
function fixture(count = 3) {
  let completed = 0, calls = 0, clock = 0;
  const ids = Array.from({ length: count }, (_, i) => String(i + 1));
  const io = {
    now: () => clock, busy: async () => false,
    snapshot: async () => ({ pending: ids.slice(completed).map(id => ({ id })), blocked: 0,
      fingerprints: Object.fromEntries(ids.map((id, i) => [id, i < completed ? 'done' : 'todo'])) }),
    review: async s => JSON.stringify({ action: 'continue', target_id: s.pending[0].id, reason: 'Next pending item' }),
    work: async () => { calls++; completed++; return 'Finished'; }, record: async () => {},
  };
  return { io, calls: () => calls, setClock: x => { clock = x; } };
}
test('three distinct items finish without operator continuation', async () => {
  const f = fixture();
  assert.deepEqual(await supervise(f.io, limits), { reason: 'complete', rounds: 3 });
  assert.equal(f.calls(), 3);
});
test('unchanged objectives are deferred individually, not the whole queue', async () => {
  const f = fixture(); let work = 0;
  f.io.work = async () => { work++; return 'Checkpoint only'; };
  const result = await supervise(f.io, limits);
  assert.equal(result.reason, 'no_progress'); assert.equal(work, 6);
  assert.deepEqual(result.deferred, ['1', '2', '3']);
});
test('an approval defers only that objective and other readings continue', async () => {
  const f = fixture(), done = new Set(), selected = [], records = [];
  f.io.snapshot = async () => ({ pending: ['1','2','3'].filter(id => !done.has(id)).map(id => ({id})), blocked: 0, fingerprints: Object.fromEntries(['1','2','3'].map(id => [id, done.has(id) ? 'done' : 'todo'])) });
  f.io.work = async id => { selected.push(id); if (id === '1') return {text:'human_intervention_required',accepted:false,defer:true}; done.add(id); return {text:'Read and saved',accepted:true}; };
  f.io.record = async r => records.push(r);
  assert.equal((await supervise(f.io, limits)).reason,'no_progress');
  assert.deepEqual(selected,['1','2','3']); assert.deepEqual(records.at(-1).deferred,['1']); assert.equal(records[0].advanced,false);
});
test('invalid output cannot count cosmetic ficha changes as accepted progress', async () => {
  const f = fixture(1); let changed = 0, attempts = 0;
  f.io.snapshot = async () => ({pending:[{id:'1'}],blocked:0,fingerprints:{'1':String(changed++)}});
  f.io.work = async () => { attempts++; return {text:'Invalid result',accepted:false}; };
  assert.equal((await supervise(f.io,limits)).reason,'no_progress'); assert.equal(attempts,2);
});
test('round budget cannot be increased by the reviewer', async () => {
  const f = fixture(8); assert.equal((await supervise(f.io, { ...limits, rounds: 2 })).reason, 'round_limit'); assert.equal(f.calls(), 2);
});
test('deadline is checked again after reviewing', async () => {
  const f = fixture(); const review = f.io.review;
  f.io.review = async s => { f.setClock(61000); return review(s); };
  assert.equal((await supervise(f.io, limits)).reason, 'time_limit'); assert.equal(f.calls(), 0);
});
test('active user work prevents dispatch', async () => {
  const f = fixture(); f.io.busy = async () => true;
  assert.equal((await supervise(f.io, limits)).reason, 'other_run_active'); assert.equal(f.calls(), 0);
});
test('blocked-only queue is not reported as complete', async () => {
  const f = fixture(0); f.io.snapshot = async () => ({ pending: [], blocked: 1 });
  assert.equal((await supervise(f.io, limits)).reason, 'blocked_only');
});
test('reviewer cannot inject a new task or run arbitrary instructions', async () => {
  assert.throws(() => decision('{"action":"continue","target_id":"new","reason":"go"}', ['known']));
  assert.throws(() => decision('{"action":"shell","reason":"go"}', []));
  assert.throws(() => decision('not JSON', []));
  assert.equal(decision('```json\n{"action":"stop","reason":"blocked"}\n```', []).action, 'stop');
});
test('timestamp-only changes do not count as progress', () => {
  assert.equal(fingerprint('PARCIAL', 'Updated 2026-11-09T10:00:00Z'), fingerprint('PARCIAL', 'Updated 2026-11-09T11:00:00Z'));
  assert.notEqual(fingerprint('PARCIAL', 'offset 4000'), fingerprint('PARCIAL', 'offset 8000'));
});
test('busy discovery is awaited without duplicate dispatch', async () => {
  const f = fixture(1); let busy = true;
  f.io.busy = async () => busy; f.io.pause = async () => { busy = false; };
  assert.equal((await supervise(f.io, limits)).reason, 'complete'); assert.equal(f.calls(), 1);
});
test('waiting for another run is bounded by the same deadline', async () => {
  const f = fixture(); f.io.busy = async () => true; f.io.pause = async () => f.setClock(61000);
  assert.equal((await supervise(f.io, limits)).reason, 'time_limit'); assert.equal(f.calls(), 0);
});
test('bookmark recovery admits only the prefix before a known frontier', () => {
  const response = ids => ({content:[{text:JSON.stringify({successful:true,data:{data:ids.map(id=>({id,text:'post'})),includes:{users:[]}}})}]});
  const known = '2111111111111111111', a = '2111111111111111112', b = '2111111111111111113';
  assert.deepEqual(novelties([response([b,a,known,'2111111111111111110'])],[known]).map(x=>x.post.id),[b,a]);
  assert.deepEqual(novelties([response([known,a])],[known]),[]);
  assert.deepEqual(novelties([response([])],[known]),[]);
  assert.deepEqual(novelties([response([b]),response([a,known])],[known]).map(x=>x.post.id),[b,a]);
  assert.throws(()=>novelties([response([a])],[known]),/frontier unavailable/);
  assert.throws(()=>novelties([response([a,a,known])],[known]),/Repeated bookmark/);
  assert.throws(()=>novelties([response(['..\/invalid',known])],[known]),/Invalid bookmark/);
  assert.throws(()=>novelties([{isError:true}],[known]),/failed/);
  assert.throws(()=>novelties([{content:[{text:'truncated JSON'}]}],[known]));
});
test('reviewer receives only queue metadata, never source text or worker output', async () => {
  const f = fixture(), snapshot = f.io.snapshot, review = f.io.review;
  f.io.snapshot = async () => { const s = await snapshot(); s.pending = s.pending.map(x => ({ ...x, title: 'Untrusted title', evidence: 'Untrusted source text' })); return s; };
  f.io.review = async (queue, previous) => {
    assert.equal('fingerprints' in queue, false);
    for (const item of queue.pending) { assert.equal('title' in item, false); assert.equal('evidence' in item, false); }
    if (previous) assert.equal('worker' in previous, false);
    return review(queue);
  };
  assert.equal((await supervise(f.io, limits)).reason, 'complete');
});
test('human intervention propagates instead of auto-approving or retrying', async () => {
  const f = fixture(); f.io.work = async () => { throw Error('human_intervention_required'); };
  await assert.rejects(supervise(f.io, limits), /human_intervention_required/);
});
test('daily windows are Madrid-local, bounded at midnight including DST', () => {
  for (const [start, end] of [
    ['2026-03-28T23:00:00Z', '2026-03-29T22:00:00Z'],
    ['2026-10-24T22:00:00Z', '2026-10-25T23:00:00Z'],
    ['2026-11-10T22:50:00Z', '2026-11-10T23:00:00Z'],
  ]) assert.equal(dailyWindow(Date.parse(start), 172800).deadline, Date.parse(end));
  const now = Date.parse('2026-11-10T10:00:00Z');
  assert.equal(dailyWindow(now, 21600).deadline, now + 21600000);
});
test('persisted budget and per-objective deferrals survive a new process', async () => {
  const f = fixture(3); f.io.review = async queue => { assert.equal(queue.pending[0].id, '2'); return JSON.stringify({action:'continue',target_id:'2',reason:'Remaining'}); };
  f.io.work = async () => 'No changes';
  const r = await supervise(f.io, {...limits,rounds:1,deferred:['1'],stallsById:{'2':1}});
  assert.equal(r.reason,'round_limit');
  const empty = fixture(); assert.equal((await supervise(empty.io,{...limits,rounds:0})).reason,'round_limit'); assert.equal(empty.calls(),0);
});
test('untouched objectives precede retries without losing original priority order', () => {
  const pending=[{id:'new-1'},{id:'new-2'},{id:'old'}];
  assert.equal(nextObjective(pending,{}),'new-1');
  assert.equal(nextObjective(pending,{'new-1':0}),'new-2');
  assert.equal(nextObjective(pending,{'new-1':0,'new-2':1}),'old');
  assert.equal(nextObjective(pending,{'new-1':0,'new-2':1,old:0}),'new-1');
});
test('paraphrasing evidence does not reset the stall counter', () => {
  const a={estado:'PARCIAL',fuentes:[{url:'https://example.org/paper',cobertura:'parcial',evidencia:'Original wording'}]};
  const b={...a,motivo:'Another summary',fuentes:[{...a.fuentes[0],evidencia:'Rephrased without reading anything new'}]};
  assert.equal(readingFingerprint(a),readingFingerprint(b));
  assert.notEqual(readingFingerprint(a),readingFingerprint({...a,fuentes:[{...a.fuentes[0],cobertura:'completa'}]}));
  assert.notEqual(readingFingerprint(a),readingFingerprint({...a,estado:'BLOQUEADA'}));
});
test('completion needs matching identity, saved state, source coverage and no unresolved work', () => {
  const good = {id:'known',assignment:'nonce',estado:'COMPLETA',motivo:'A sufficiently explained documentary conclusion with limits.',pendiente:[],fuentes:[{url:'https://example.org',cobertura:'completa',evidencia:'The actual source supports this precise documented conclusion.'}],original:{tipo:'articulo',url:'https://example.org',cobertura:'completa'},imagenes:{estado:'no_aplica',archivos:[]}};
  assert.equal(readingResult(good,'known','nonce','Estado actual: COMPLETA').estado,'COMPLETA');
  assert.throws(()=>readingResult(good,'other','nonce','Estado actual: COMPLETA'));
  assert.throws(()=>readingResult(good,'known','other','Estado actual: COMPLETA'));
  assert.throws(()=>readingResult(good,'known','nonce','Estado actual: PARCIAL'));
  assert.throws(()=>readingResult({...good,pendiente:['Missing body']},'known','nonce','Estado actual: COMPLETA'));
  assert.throws(()=>readingResult({...good,fuentes:[{...good.fuentes[0],cobertura:'parcial'}]},'known','nonce','Estado actual: COMPLETA'));
  assert.throws(()=>readingResult({...good,fuentes:[]},'known','nonce','Estado actual: COMPLETA'));
  assert.equal(readingResult({...good,estado:'BLOQUEADA',pendiente:['Source body inaccessible']},'known','nonce','Estado actual: BLOQUEADA').estado,'BLOQUEADA');
  assert.throws(()=>readingResult({...good,original:undefined},'known','nonce','Estado actual: COMPLETA'),/original/);
  assert.throws(()=>readingResult({...good,original:{...good.original,cobertura:'parcial'}},'known','nonce','Estado actual: COMPLETA'),/Original content/);
  assert.throws(()=>readingResult({...good,imagenes:{estado:'faltan',archivos:[]}},'known','nonce','Estado actual: COMPLETA'),/essential images/);
  assert.throws(()=>readingResult({...good,imagenes:{estado:'archivadas',archivos:[]}},'known','nonce','Estado actual: COMPLETA'),/not an archive/);
  const thread={...good,original:{...good.original,tipo:'hilo',autor_id:'author'}};
  assert.throws(()=>readingResult(thread,'known','nonce','Estado actual: COMPLETA','someone-else'),/Thread author/);
  assert.equal(readingResult(thread,'known','nonce','Estado actual: COMPLETA','author'),thread);
});
test('image archives require saved binary bytes, correct hash and objective confinement', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'reading-archive-'));
  const directory=path.join(root,'fuentes','known');
  try {
    await fs.mkdir(directory,{recursive:true});
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5N8AAAAASUVORK5CYII=','base64');
    const entry={ruta:'fuentes/known/image.png',url:'https://example.org/image.png',sha256:createHash('sha256').update(png).digest('hex')};
    await fs.writeFile(path.join(root,entry.ruta),png);
    await verifyImageArchive(root,'known',{archivos:[entry]});
    await assert.rejects(verifyImageArchive(root,'known',{archivos:[{...entry,sha256:'0'.repeat(64)}]}),/hash/);
    await assert.rejects(verifyImageArchive(root,'known',{archivos:[entry,entry]}),/Invalid/);
    await assert.rejects(verifyImageArchive(root,'known',{archivos:[{...entry,ruta:'fuentes/known/../../outside.png'}]}));
    await fs.writeFile(path.join(root,'outside.png'),png);
    await fs.symlink(path.join(root,'outside.png'),path.join(directory,'escape.png'));
    await assert.rejects(verifyImageArchive(root,'known',{archivos:[{...entry,ruta:'fuentes/known/escape.png'}]}),/escaped/);
    const html=Buffer.from('<html>This is a login page, not the promised image</html>');
    await fs.writeFile(path.join(directory,'login.png'),html);
    await assert.rejects(verifyImageArchive(root,'known',{archivos:[{...entry,ruta:'fuentes/known/login.png',sha256:createHash('sha256').update(html).digest('hex')}]}),/bytes/);
    await assert.rejects(verifyImageArchive(root,'known',{archivos:[{...entry,ruta:'fuentes/known/missing.png'}]}),{code:'ENOENT'});
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});
test('archiving essential images counts as structural progress without paraphrase', () => {
  const reading={estado:'PARCIAL',fuentes:[],original:{tipo:'articulo',url:'https://example.org',cobertura:'parcial'},imagenes:{estado:'faltan',archivos:[]}};
  assert.notEqual(readingFingerprint(reading),readingFingerprint({...reading,imagenes:{estado:'archivadas',archivos:[{sha256:'abc'}]}}));
});
