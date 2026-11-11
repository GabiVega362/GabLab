import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { researchTeam, copyResearchTree, teamReview, preserveFicha } from './team.mjs';

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
const digest = text => createHash('sha256').update(text).digest('hex');
export const madridDay = time => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(time);
export function dailyWindow(now, seconds) {
  const day = madridDay(now);
  let lo = now, hi = now + 27 * 3600000;
  while (hi - lo > 1) { const mid = Math.floor((hi + lo) / 2); if (madridDay(mid) === day) lo = mid; else hi = mid; }
  return { day, started: now, deadline: Math.min(now + seconds * 1000, hi), used: 0, stalls: {}, deferred: [], active: null };
}
export function readingResult(value, id, assignment, text, authorId) {
  if (value?.id !== id || value.assignment !== assignment || !['COMPLETA', 'PARCIAL', 'BLOQUEADA'].includes(value.estado)) throw Error('Invalid reading result identity/state');
  if (typeof value.motivo !== 'string' || value.motivo.length < 40 || !Array.isArray(value.pendiente) || !Array.isArray(value.fuentes) || !value.fuentes.length) throw Error('Reading result lacks evidence');
  for (const source of value.fuentes) {
    if (typeof source.url !== 'string' || !/^https?:\/\//.test(source.url) || !['completa', 'parcial', 'inaccesible'].includes(source.cobertura) || typeof source.evidencia !== 'string' || source.evidencia.length < 20) throw Error('Invalid source evidence');
  }
  const stated = [...text.replaceAll('*', '').matchAll(/^Estado actual:\s*(COMPLETA|PARCIAL|BLOQUEADA|PENDIENTE)\b/gim)].at(-1)?.[1].toUpperCase();
  if (stated !== value.estado) throw Error('Reading result disagrees with the saved ficha');
  if (value.estado === 'COMPLETA' && (value.pendiente.length || !value.fuentes.some(x => x.cobertura === 'completa'))) throw Error('Incomplete reading cannot close an objective');
  const original = value.original, images = value.imagenes;
  if (!original || !['post', 'articulo', 'hilo'].includes(original.tipo) || !/^https?:\/\//.test(original.url ?? '') || !['completa', 'parcial', 'inaccesible'].includes(original.cobertura)) throw Error('Missing original article/thread coverage');
  if (!images || !['no_aplica', 'archivadas', 'faltan'].includes(images.estado) || !Array.isArray(images.archivos)) throw Error('Missing image archive coverage');
  if (images.estado === 'archivadas' && !images.archivos.length) throw Error('Image URLs are not an archive');
  if (value.estado === 'COMPLETA' && (original.cobertura !== 'completa' || images.estado === 'faltan')) throw Error('Original content or essential images remain incomplete');
  if (original.tipo === 'hilo' && (!authorId || original.autor_id !== authorId)) throw Error('Thread author differs from the bookmarked author');
  return value;
}

export async function verifyImageArchive(knowledge, id, images) {
  const base = await fs.realpath(knowledge), prefix = 'fuentes/' + id + '/';
  const seen = new Set();
  for (const entry of images.archivos) {
    if (typeof entry.ruta !== 'string' || !entry.ruta.startsWith(prefix) || seen.has(entry.ruta) || !/^[a-f0-9]{64}$/.test(entry.sha256 ?? '') || !/^https?:\/\//.test(entry.url ?? '')) throw Error('Invalid image archive entry');
    seen.add(entry.ruta);
    const file = await fs.realpath(path.resolve(base, entry.ruta));
    if (!file.startsWith(path.join(base, 'fuentes', id) + path.sep)) throw Error('Image archive escaped its objective');
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size < 8 || stat.size > 10 * 1024 * 1024) throw Error('Image/PDF archive size invalid (maximum 10 MiB per file)');
    const bytes = await fs.readFile(file);
    const header = bytes.subarray(0, 12);
    const recognized = header.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || header.subarray(0, 3).equals(Buffer.from([255,216,255])) || /^GIF8[79]a/.test(header.toString('ascii')) || (header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP') || header.toString('ascii', 0, 5) === '%PDF-';
    if (!recognized || digest(bytes) !== entry.sha256) throw Error('Image/PDF bytes or hash do not match the archive');
  }
}

export function nextObjective(pending, attempted) {
  return (pending.find(({ id }) => !Object.hasOwn(attempted, id)) ?? pending[0]).id;
}

export function readingFingerprint(reading) {
  return digest(JSON.stringify([reading.estado, reading.fuentes.map(({ url, cobertura }) => [url, cobertura]).sort((a, b) => a[0].localeCompare(b[0])), reading.original ? [reading.original.tipo, reading.original.url, reading.original.cobertura, reading.original.autor_id ?? null] : null, reading.imagenes ? [reading.imagenes.estado, reading.imagenes.archivos.map(x => x.sha256).sort()] : null]));
}

export function decision(text, ids) {
  const d = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  if (!['continue', 'stop', 'blocked'].includes(d.action) || typeof d.reason !== 'string') throw Error('Invalid supervisor decision');
  if (d.action === 'continue' && !ids.includes(d.target_id)) throw Error('Supervisor selected an unauthorized target');
  return d;
}

// Preserve API bookmark order; unknown records after the first known ID are history.
export function novelties(results, knownIds) {
  const known = new Set(knownIds), seen = new Set(), posts = [];
  for (const result of results) {
    if (result?.isError) throw Error('Bookmark response failed');
    const block = result?.content?.find(x => typeof x.text === 'string');
    const response = JSON.parse(block?.text ?? 'null');
    if (response?.successful !== true || !Array.isArray(response.data?.data)) throw Error('Invalid bookmark response');
    for (const post of response.data.data) {
      if (typeof post.id !== 'string' || !/^\d{10,25}$/.test(post.id) || typeof post.text !== 'string') throw Error('Invalid bookmark record');
      if (known.has(post.id)) return posts;
      if (seen.has(post.id)) throw Error('Repeated bookmark before frontier');
      seen.add(post.id);
      posts.push({ post, includes: response.data.includes ?? {} });
    }
  }
  if (!posts.length) return [];
  throw Error('Bookmark frontier unavailable; no new IDs admitted');
}

export async function supervise(io, limits) {
  const deadline = io.now() + limits.seconds * 1000;
  let previous = null;
  const stalls = new Map(Object.entries(limits.stallsById ?? {})), deferred = new Set(limits.deferred ?? []);
  for (let round = 1; round <= limits.rounds; round++) {
    if (io.now() >= deadline) return { reason: 'time_limit', rounds: round - 1 };
    while (await io.busy()) {
      if (!io.pause) return { reason: 'other_run_active', rounds: round - 1 };
      if (io.now() >= deadline) return { reason: 'time_limit', rounds: round - 1 };
      await io.pause();
    }
    const before = await io.snapshot();
    if (!before.pending.length) return { reason: before.blocked ? 'blocked_only' : 'complete', rounds: round - 1 };
    before.pending = before.pending.filter(x => !deferred.has(x.id));
    if (!before.pending.length) return { reason: 'no_progress', rounds: round - 1, deferred: [...deferred] };
    // Scheduling needs IDs and progress, not untrusted research text.
    const queue = { pending: before.pending.map(({ id, state }) => ({ id, state })), blocked: before.blocked, complete: before.complete };
    const progress = previous && { round: previous.round, target_id: previous.target_id, advanced: previous.advanced, remaining: previous.remaining, deferred: previous.deferred };
    const review = decision(await io.review(queue, progress, deadline), before.pending.map(x => x.id));
    if (review.action !== 'continue') return { reason: 'review_' + review.action, detail: review.reason, rounds: round - 1 };
    if (io.now() >= deadline) return { reason: 'time_limit', rounds: round - 1 };
    if (await io.busy()) return { reason: 'other_run_active', rounds: round - 1 };
    const worker = await io.work(review.target_id, deadline);
    const after = await io.snapshot();
    // Timestamp-only edits do not count as durable research progress.
    const advanced = worker.accepted !== false && before.fingerprints[review.target_id] !== after.fingerprints[review.target_id];
    stalls.set(review.target_id, advanced ? 0 : (stalls.get(review.target_id) ?? 0) + 1);
    if (worker.defer || stalls.get(review.target_id) >= limits.stalls) deferred.add(review.target_id);
    previous = { round, target_id: review.target_id, advanced, worker: (typeof worker === 'string' ? worker : worker.text).slice(-4000), remaining: after.pending.length, deferred: [...deferred], stalls: Object.fromEntries(stalls) };
    await io.record(previous);
    if (after.pending.length && after.pending.every(x => deferred.has(x.id))) return { reason: 'no_progress', rounds: round, deferred: [...deferred] };
    if (!after.pending.length) return { reason: after.blocked ? 'blocked_only' : 'complete', rounds: round };
  }
  return { reason: 'round_limit', rounds: limits.rounds };
}

export function fingerprint(state, text) {
  return digest(state + '\n' + text.replace(/\b20\d\d-\d\d-\d\d(?:[T ][\d:.]+Z?)?/g, '<date>').trim());
}

async function main(configPath) {
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const root = path.dirname(configPath);
  await fs.mkdir(path.join(root, 'lock')); // Fail closed after a crash; no automatic restart.
  const session = randomUUID(), owned = new Set(), deliveryNonces = new Set();
  let interrupted = false;
  const interrupt = () => { interrupted = true; };
  process.once('SIGTERM', interrupt);
  process.once('SIGINT', interrupt);
  const sessionDir = path.join(root, 'sessions', session);
  await fs.mkdir(sessionDir, { recursive: true, mode: 0o700 });
  const save = (name, value) => fs.writeFile(path.join(sessionDir, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  const { dispatchRoutine } = await import('./routine.mjs');
  const { createDb } = await import('/app/packages/db/src/client.ts');
  const { runAsSystem, runAsTenant } = await import('/app/packages/db/src/row-security.ts');
  const { cancelRunsInTransaction } = await import('/app/packages/db/src/cancel-runs.ts');
  const { prisma: db, pool } = createDb(process.env.DATABASE_URL, { applicationName: 'documentary-continuity-supervisor', poolMax: 1 });
  let owner, result;
  try {
    const actors = config.team;
    if (!actors || !['Kelsier', 'Marsh', 'Dockson', 'Sazed', 'Tindwyl'].every(name => actors[name]?.id && actors[name]?.routineId)) throw Error('Team configuration missing');
    const participantIds = Object.values(actors).map(x => x.id);
    const bots = await runAsSystem('Resolve the explicitly authorized research team', () => db.bot.findMany({
      where: { id: { in: participantIds }, spaceId: config.spaceId, archivedAt: null },
      select: { id: true, userId: true, computer: { select: { homeKey: true } } },
    }));
    if (bots.length !== 5 || bots.some(b => b.userId !== bots[0].userId) || Object.values(actors).some(a => bots.find(b => b.id === a.id)?.computer?.homeKey !== a.homeKey)) throw Error('Participant ownership/workspace mismatch');
    owner = { spaceId: config.spaceId, userId: bots[0].userId };
    const tenant = fn => runAsTenant(owner, fn);
    const cancelOwned = async () => {
      if (!owned.size && !deliveryNonces.size) return;
      await tenant(async () => {
        const runs = await db.run.findMany({ where: { ...owner, OR: [{ id: { in: [...owned] } }, { clientNonce: { in: [...deliveryNonces] } }] }, select: { id: true, taskId: true, userId: true, spaceId: true } });
        // Use Rakazo's own cancellation/secret-cleanup operation, only for this session's runs.
        await db.$transaction(tx => cancelRunsInTransaction(tx, runs, new Date()));
      });
    };
    const invoke = async (bot, assignment, deadline) => {
      if (interrupted || Date.now() >= deadline) throw Error('time_limit');
      const nonce = assignment.runNonce ?? assignment.assignment;
      ledger.active.deliveries ??= {};
      ledger.modelCalls ??= [];
      if (!ledger.modelCalls.includes(nonce)) {
        if (config.modelRunLimit && ledger.modelCalls.length >= config.modelRunLimit) throw Error('model_run_limit');
        ledger.modelCalls.push(nonce);
        await atomicJson(dayFile, ledger);
      }
      deliveryNonces.add('routine-run:' + owner.userId + ':' + nonce);
      await save('delivery-nonces.json', [...deliveryNonces]);
      const delivery = await tenant(() => dispatchRoutine(db, owner, bot.routineId, bot.id, nonce, assignment));
      const runId = delivery.id;
      owned.add(runId);
      await save('owned-runs.json', [...owned]);
      ledger.active.runId = runId;
      const receipt = ledger.active.deliveries[nonce] ??= { runId, botId: bot.id, phase: assignment.phase };
      await atomicJson(dayFile, ledger);
      for (;;) {
        const run = await tenant(() => db.run.findFirst({ where: { id: runId, botId: bot.id, ...owner }, select: { status: true, error: true } }));
        if (!run) throw Error('Run unavailable');
        if (run.status.startsWith('waiting_')) throw Error('human_intervention_required');
        if (TERMINAL.has(run.status)) {
          if (run.status !== 'completed') throw Error(run.error?.includes('invalidated oauth token') ? 'provider_oauth_reauthorization_required' : 'Run ' + run.status);
          const messages = await tenant(() => db.message.findMany({ where: { runId, role: 'bot' }, orderBy: { seq: 'asc' }, select: { blocks: true } }));
          const text = messages.flatMap(m => Array.isArray(m.blocks) ? m.blocks.filter(b => b.kind === 'text').map(b => b.text) : []).join('\n');
          receipt.completed = true;
          await atomicJson(dayFile, ledger);
          await save(runId + '.json', { botId: bot.id, phase: assignment.phase, text });
          return text;
        }
        if (interrupted || Date.now() >= deadline) { await cancelOwned(); throw Error('time_limit'); }
        if (bot.id !== config.reviewer.id && !receipt.watched) {
          const latest = await tenant(() => db.event.findFirst({ where: { spaceId: owner.spaceId, runId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }));
          if (Date.now() - (latest?.createdAt.getTime() ?? ledger.active.reservedAt) >= 15 * 60000) {
            receipt.watched = true;
            await atomicJson(dayFile, ledger);
            const observation = teamReview(await invoke(actors.Tindwyl, {
              phase: 'watch', assignment: ledger.active.assignment, runNonce: nonce + '-watch',
              observation: { runId, botId: bot.id, phase: assignment.phase, status: run.status, lastEventAt: latest?.createdAt, elapsedMs: Date.now() - ledger.active.reservedAt },
            }, deadline), true);
            await save('watch-' + runId + '.json', observation);
            ledger.active.runId = runId;
            await atomicJson(dayFile, ledger);
            if (observation.action !== 'wait') throw Error(observation.action === 'stop' ? 'team_supervision_stop' : 'supervisor_deferred');
          }
        }
        await new Promise(r => setTimeout(r, 3000));
      }
    };
    const knowledge = path.resolve(config.knowledge);
    const discoveryFile = path.join(root, 'discovery-runs.json');
    const discovered = await fs.readFile(discoveryFile, 'utf8').then(JSON.parse).catch(e => { if (e.code === 'ENOENT') return {}; throw e; });
    const atomicJson = async (file, value) => {
      const tmp = file + '.' + session + '.tmp';
      const handle = await fs.open(tmp, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); } finally { await handle.close(); }
      await fs.rename(tmp, file);
      const directory = await fs.open(path.dirname(file), 'r');
      try { await directory.sync(); } finally { await directory.close(); }
    };
    const recover = async () => {
      if (!config.discoveryRoutineId || config.trial) return;
      const runs = await tenant(() => db.run.findMany({ where: { ...owner, botId: config.worker.id, routineId: config.discoveryRoutineId, status: 'completed' }, orderBy: { createdAt: 'asc' }, select: { id: true } }));
      for (const run of runs) {
      if (discovered[run.id]) continue;
      const effects = await tenant(() => db.externalEffect.findMany({ where: { spaceId: config.spaceId, runId: run.id, kind: 'mcp__x-guardados-composio__X_MCP_GET_USERS_BOOKMARKS', status: 'completed' }, orderBy: { createdAt: 'asc' }, select: { id: true, result: true } }));
      // A no-query discovery may legitimately just resume the existing backlog.
      if (!effects.length) { discovered[run.id] = { status: 'no_query' }; await atomicJson(discoveryFile, discovered); continue; }
      let entries;
      try { entries = novelties(effects.map(x => x.result), config.allowedIds); }
      catch (error) { discovered[run.id] = { status: 'invalid', error: error.message }; await atomicJson(discoveryFile, discovered); await save('discovery-warning-' + run.id + '.json', discovered[run.id]); continue; }
      const indexFile = path.join(knowledge, 'indice.json'), controlFile = path.join(knowledge, 'control-novedades.json');
      const original = await fs.readFile(indexFile, 'utf8'), index = JSON.parse(original);
      const controlOriginal = await fs.readFile(controlFile, 'utf8'), control = JSON.parse(controlOriginal);
      const source = 'lotes/recuperacion-' + run.id + '.json';
      const preserve = async (file, value) => {
        try { await fs.writeFile(path.join(knowledge, file), value, { flag: 'wx', mode: 0o600 }); }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
      };
      await preserve(source, JSON.stringify({ runId: run.id, effects }, null, 2) + '\n');
      for (const { post, includes } of entries) {
        const id = post.id, postFile = 'posts/' + id + '.json', ficha = 'fichas/' + id + '.md';
        const refs = new Set((post.referenced_tweets ?? post.referenced_posts ?? []).map(x => x.id));
        const related = (includes.posts ?? includes.tweets ?? []).filter(x => refs.has(x.id));
        const authors = new Set([post.author_id, ...related.map(x => x.author_id)]);
        const media = new Set([post, ...related].flatMap(x => x.attachments?.media_keys ?? []));
        const relevant = Object.fromEntries(Object.entries(includes).map(([key, value]) => [key, Array.isArray(value) ? value.filter(x => key === 'users' ? authors.has(x.id) : key === 'media' ? media.has(x.media_key) : refs.has(x.id)) : value]));
        await preserve(postFile, JSON.stringify({ ...post, includes: relevant, provenance: source }, null, 2) + '\n');
        const saved = JSON.parse(await fs.readFile(path.join(knowledge, postFile), 'utf8'));
        if (saved.id !== id || saved.text !== post.text) throw Error('Archived bookmark conflicts with source: ' + id);
        await preserve(ficha, '# Guardado ' + id + '\n\nEstado actual: PENDIENTE\nFuente: ' + (post.url ?? 'https://x.com/i/status/' + id) + '\nPost y expansiones: ' + postFile + '\nProcedencia: ' + source + '\n\nInvestigar las afirmaciones relevantes y su utilidad. El archivo no equivale a investigación terminada.\nReutiliza las lecturas preliminares de este objetivo ya conservadas en lotes/, si existen.\n');
        index.items[id] ??= { url: post.url ?? 'https://x.com/i/status/' + id, estado: 'PENDIENTE', ficha, post: postFile, lote: run.id, etiquetas: [] };
      }
      if (await fs.readFile(indexFile, 'utf8') !== original || await fs.readFile(controlFile, 'utf8') !== controlOriginal) throw Error('Queue changed during recovery');
      await atomicJson(indexFile, index);
      control.seen_ids = [...new Set([...entries.map(x => x.post.id), ...control.seen_ids])];
      if (entries.length) control.last_seen_bookmark_id = entries[0].post.id;
      await atomicJson(controlFile, control);
      config.allowedIds = [...new Set([...entries.map(x => x.post.id), ...config.allowedIds])];
      await atomicJson(configPath, config);
      await save('recovery.json', { runId: run.id, admitted: entries.map(x => x.post.id), source });
      discovered[run.id] = { status: 'applied', admitted: entries.map(x => x.post.id) };
      await atomicJson(discoveryFile, discovered);
      }
    };
    const snapshot = async () => {
      await recover();
      const index = JSON.parse(await fs.readFile(path.join(knowledge, 'indice.json'), 'utf8'));
      const pending = [], fingerprints = {};
      let blocked = 0, complete = 0;
      for (const id of config.allowedIds) {
        const item = index.items[id];
        if (!item || !['PARCIAL', 'BLOQUEADA', 'COMPLETA', 'PENDIENTE'].includes(item.estado)) throw Error('Invalid queue entry');
        const real = await fs.realpath(path.resolve(knowledge, item.ficha));
        if (!real.startsWith(knowledge + path.sep)) throw Error('Evidence escaped its authorized directory');
        const text = await fs.readFile(real, 'utf8');
        fingerprints[id] = ledger.coverage?.[id] ?? fingerprint(item.estado, text);
        if (item.estado === 'BLOQUEADA') blocked++;
        else if (item.estado === 'COMPLETA') {
          if (!/(?:estado actual|^#+ cierre documental)[^\n]*completa/im.test(text.replaceAll('*', ''))) throw Error('Index/evidence completion mismatch: ' + id);
          complete++;
        } else pending.push({ id, state: item.estado });
      }
      return { pending, blocked, complete, fingerprints };
    };
    const busy = () => tenant(() => db.run.count({ where: { ...owner, botId: { in: participantIds }, status: { notIn: [...TERMINAL] } } })).then(n => n > 0);
    const dayFile = path.join(root, 'days', madridDay(Date.now()) + '.json');
    await fs.mkdir(path.dirname(dayFile), { recursive: true, mode: 0o700 });
    const ledger = await fs.readFile(dayFile, 'utf8').then(JSON.parse).catch(e => { if (e.code === 'ENOENT') return dailyWindow(Date.now(), config.limits.seconds); throw e; });
    await atomicJson(dayFile, ledger);
    for (const receipt of Object.values(ledger.active?.deliveries ?? {})) if (receipt.runId) owned.add(receipt.runId);
    for (const nonce of ledger.modelCalls ?? []) if (ledger.active && nonce.startsWith(ledger.active.assignment + '-')) deliveryNonces.add('routine-run:' + owner.userId + ':' + nonce);
    const roundLimit = ledger.roundLimit ?? config.limits.rounds ?? Infinity;
    const present = async () => {
      if (!config.pages?.enabled || config.trial || interrupted || Date.now() >= ledger.deadline) return;
      try {
        const { refreshPages } = await import('./pages.mjs');
        await tenant(() => refreshPages(db, owner, { ...config, configPath }, ledger.deadline, { stopped: () => interrupted }));
      } catch (error) {
        // Presentation failure never restarts an accepted investigation or deletes its last page.
        await save('presentation-error.json', { error: error.message });
      }
    };
    const work = async (id, deadline) => {
      if (!config.allowedIds.includes(id)) throw Error('Unauthorized reading target');
      if (!ledger.active) {
        if (ledger.used >= roundLimit || Date.now() >= ledger.deadline) throw Error('daily_limit');
        const assignment = randomUUID();
        ledger.active = { id, assignment, reservedAt: Date.now(), result: 'lotes/resultados-supervisor/' + id + '-' + assignment + '.json' };
        ledger.used++;
        await atomicJson(dayFile, ledger); // Reserve the attempt before creating any run.
      }
      if (ledger.active.id !== id) throw Error('Unreconciled assignment');
      const indexFile = path.join(knowledge, 'indice.json');
      const before = JSON.parse(await fs.readFile(indexFile, 'utf8'));
      const item = before.items[id];
      const assignment = { ...ledger.active, ficha: item.ficha, post: item.post };
      await fs.mkdir(path.join(knowledge, 'lotes/resultados-supervisor'), { recursive: true, mode: 0o700 });
      let text;
      try {
        if (ledger.active.failure) throw Error(ledger.active.failure);
        ledger.active.team ??= {};
        const post = JSON.parse(await fs.readFile(path.join(knowledge, item.post), 'utf8'));
        const beforeFicha = await fs.readFile(path.join(knowledge, item.ficha), 'utf8');
        const checkpoint = () => atomicJson(dayFile, ledger);
        const receipts = () => Object.values(ledger.active.deliveries ?? {}).filter(x => x.completed);
        const packetRoot = actor => path.join('/data/homes', actors[actor].homeKey, 'knowledge/guardados-x/equipo', assignment.assignment);
        const outcome = await researchTeam({
          checkpoint, receipts, post: async () => ({ id, text: post.text, includes: post.includes }),
          call: (phase, actor, payload) => invoke(actors[actor], { ...assignment, ...payload, phase: phase === 'resupervise' ? 'supervise' : phase, runNonce: assignment.assignment + '-' + phase }, deadline),
          prepare: async actor => {
            const target = packetRoot(actor);
            try { await fs.access(path.join(target, 'ready.json')); }
            catch (e) {
              if (e.code !== 'ENOENT') throw e;
              await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
              const tmp = await fs.mkdtemp(target + '-staging-');
              await fs.mkdir(path.join(tmp, 'fuentes'), { mode: 0o700 });
              await fs.writeFile(path.join(tmp, 'post.json'), JSON.stringify(post), { mode: 0o600 });
              await fs.writeFile(path.join(tmp, 'ficha.md'), beforeFicha, { mode: 0o600 });
              try { await copyResearchTree(path.join(knowledge, 'fuentes', id), path.join(tmp, 'fuentes', id)); }
              catch (error) { if (error.code !== 'ENOENT') throw error; }
              await atomicJson(path.join(tmp, 'ready.json'), { id, assignment: assignment.assignment, actor });
              await fs.rename(tmp, target);
            }
            return { workspace: '/home/rakazo/knowledge/guardados-x/equipo/' + assignment.assignment, post: 'post.json', ficha: 'ficha.md', result: 'resultado.json' };
          },
          delivery: async actor => {
            const base = packetRoot(actor);
            try {
              const ficha = await fs.readFile(path.join(base, 'ficha.md'), 'utf8');
              const reading = readingResult(JSON.parse(await fs.readFile(path.join(base, 'resultado.json'), 'utf8')), id, assignment.assignment, ficha, post.author_id);
              await verifyImageArchive(base, id, reading.imagenes);
              return { reading, ficha, base };
            } catch (error) {
              if (error.code && !['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
              await save('invalid-team-' + assignment.assignment + '.json', { id, error: error.message });
              throw Error('team_delivery_invalid');
            }
          },
          accept: async delivery => {
            if (await fs.readFile(path.join(knowledge, item.ficha), 'utf8') !== beforeFicha) throw Error('Ficha changed during specialist assignment');
            for (const image of delivery.reading.imagenes.archivos) {
              const target = path.join(knowledge, image.ruta);
              let existing;
              try { existing = await fs.readFile(target); } catch (e) { if (e.code !== 'ENOENT') throw e; }
              if (existing && digest(existing) !== image.sha256) throw Error('Conflicting canonical image');
              if (!existing) { await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 }); await fs.writeFile(target, await fs.readFile(path.join(delivery.base, image.ruta)), { flag: 'wx', mode: 0o600 }); }
            }
            const record = { ...delivery.reading, equipo: { routing: ledger.active.team.route, receipts: receipts(), supervision: ledger.active.team.secondReview ?? ledger.active.team.review } };
            const preserved = preserveFicha(beforeFicha, delivery.ficha, ledger.active.team.route.specialist);
            const tmp = path.join(knowledge, item.ficha) + '.' + assignment.assignment + '.tmp';
            await fs.writeFile(tmp, preserved, { flag: 'wx', mode: 0o600 });
            await fs.rename(tmp, path.join(knowledge, item.ficha));
            await atomicJson(path.join(knowledge, assignment.result), record);
          },
        }, ledger.active.team, assignment);
        text = 'Investigación de ' + outcome.actor + ', supervisada por Tindwyl';
      } catch (error) {
        if (interrupted || Date.now() >= deadline || !['human_intervention_required', 'supervisor_deferred', 'team_review_deferred', 'team_delivery_invalid'].includes(error.message)) throw error;
        ledger.active.failure = error.message;
        await atomicJson(dayFile, ledger); // Record why our cancellation is safe to reconcile after restart.
        await cancelOwned();
        await save('deferred-' + assignment.assignment + '.json', { id, runId: ledger.active.runId, reason: error.message });
        return { text: error.message, accepted: false, defer: true };
      }
      const file = await fs.realpath(path.join(knowledge, assignment.result)).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
      if (file) {
        if (!file.startsWith(knowledge + path.sep)) throw Error('Reading result escaped knowledge');
        const raw = await fs.readFile(indexFile, 'utf8'), index = JSON.parse(raw);
        const ficha = await fs.readFile(await fs.realpath(path.join(knowledge, item.ficha)), 'utf8');
        const source = await fs.readFile(file, 'utf8');
        let reading;
        try {
          const post = JSON.parse(await fs.readFile(path.join(knowledge, item.post), 'utf8'));
          reading = readingResult(JSON.parse(source), id, assignment.assignment, ficha, post.author_id);
          await verifyImageArchive(knowledge, id, reading.imagenes);
        }
        catch (error) {
          if (error.code && !['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
          await save('invalid-' + assignment.assignment + '.json', { id, runId: ledger.active.runId, error: error.message }); return { text, accepted: false };
        }
        index.items[id].estado = reading.estado;
        if (await fs.readFile(indexFile, 'utf8') !== raw) throw Error('Index changed while accepting result');
        await atomicJson(indexFile, index);
        // Paraphrasing the same source coverage is not new documentary progress.
        ledger.coverage ??= {};
        ledger.coverage[id] = readingFingerprint(reading);
        await atomicJson(dayFile, ledger);
        await save('accepted-' + assignment.assignment + '.json', { ...reading, runId: ledger.active.runId, fichaSha256: digest(ficha) });
        await present();
      }
      return { text, accepted: Boolean(file) };
    };
    try {
      if (!ledger.active) await present();
      // A committed run is replayed by nonce after interruption, never inferred twice.
      if (ledger.active) {
        const id = ledger.active.id, resumed = await work(id, ledger.deadline);
        ledger.stalls[id] = resumed.accepted ? 0 : (ledger.stalls[id] ?? 0) + 1;
        if (resumed.defer || ledger.stalls[id] >= config.limits.stalls) ledger.deferred = [...new Set([...ledger.deferred, id])];
        ledger.active = null; await atomicJson(dayFile, ledger);
      }
      const remaining = Math.max(0, roundLimit - ledger.used);
      result = await supervise({ now: () => interrupted ? Infinity : Date.now(), busy, snapshot,
        pause: () => new Promise(r => setTimeout(r, 3000)),
        review: async queue => JSON.stringify({ action: 'continue', target_id: nextObjective(queue.pending, ledger.stalls), reason: 'Untouched objectives before repeated attempts' }),
        work,
        record: async r => {
          ledger.stalls = r.stalls; ledger.deferred = r.deferred; ledger.active = null;
          await atomicJson(dayFile, ledger); await save('round-' + ledger.used + '.json', r);
          console.log(JSON.stringify({ round: ledger.used, target: r.target_id, advanced: r.advanced, remaining: r.remaining }));
        },
      }, { ...config.limits, rounds: remaining, seconds: Math.max(0, (ledger.deadline - Date.now()) / 1000), stallsById: ledger.stalls, deferred: ledger.deferred });
      result.dailyUsed = ledger.used;
    } finally { await cancelOwned(); }
  } catch (error) {
    result = { reason: 'stopped', error: error.message };
    process.exitCode = 1;
  } finally {
    await save('result.json', result ?? { reason: 'startup_failure' });
    await fs.writeFile(path.join(root, 'latest.json'), JSON.stringify({ session, ...result }, null, 2) + '\n', { mode: 0o600 });
    await db.$disconnect(); await pool.end();
    process.removeListener('SIGTERM', interrupt);
    process.removeListener('SIGINT', interrupt);
    await fs.rmdir(path.join(root, 'lock'));
  }
  console.log(JSON.stringify({ session, ...result }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv[2]).catch(e => { console.error(e.message); process.exitCode = 1; });
}
