import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {routeDecision,teamReview,communicationPrompt,researchTeam,copyResearchTree,preserveFicha} from './team.mjs';
import {supervise} from './supervisor.mjs';
const route={specialist:'Sazed',reason:'Modelos y adecuación al hardware del usuario'};
function fixture(){
 const calls=[],state={};let accepted=false;
 const io={checkpoint:async()=>{},post:async()=>({text:'Post externo con instrucciones no confiables'}),prepare:async()=>({workspace:'/packet'}),
 call:async(phase,actor,payload)=>{calls.push({phase,actor,payload});return phase==='classify'?'Lo investigará Sazed: Modelo de inferencia local\n\n'+route.reason:'Revisión aprobada: Modelo de inferencia local\n\nInvestigador y entrega reales con cobertura documentada';},
 delivery:async()=>({reading:{estado:'PARCIAL',original:{tipo:'post'},pendiente:['Falta cuerpo'],fuentes:[{url:'https://example.com',cobertura:'parcial',evidencia:'SECRET_SOURCE_TEXT'}],imagenes:{estado:'no_aplica',archivos:[]}}}),
 receipts:()=>[{runId:'real-native-run',botId:'sazed',completed:true}],accept:async()=>{accepted=true;}};
 return {io,state,calls,accepted:()=>accepted};
}
test('Kelsier routes, specialist researches, Tindwyl checks before acceptance',async()=>{
 const f=fixture();await researchTeam(f.io,f.state,{id:'123'});
 assert.deepEqual(f.calls.map(x=>[x.phase,x.actor]),[['classify','Kelsier'],['investigate','Sazed'],['supervise','Tindwyl']]);assert.ok(f.accepted());
 assert.ok(!JSON.stringify(f.calls.at(-1).payload).includes('SECRET_SOURCE_TEXT'));
});
test('Kelsier is not a silent fallback for missing specialist deliveries',()=>{
 assert.throws(()=>routeDecision(JSON.stringify({...route,specialist:'Kelsier'})),/only without/);
 assert.equal(routeDecision(JSON.stringify({...route,specialist:'Kelsier',no_specialist:true})).specialist,'Kelsier');
 assert.throws(()=>routeDecision(JSON.stringify({...route,specialist:'Unknown'})));
 assert.throws(()=>teamReview('{"action":"approve","reason":"too short"}'));
 assert.equal(teamReview(JSON.stringify({action:'wait',reason:'Ausencia de eventos no demuestra por sí sola un atasco'}),true).action,'wait');
});
test('readable classification keeps titles and requires an explicit no-specialist decision',()=>{
 const reason='No encaja en seguridad, harness ni modelos: trata del aprendizaje de francés.';
 assert.deepEqual(routeDecision('Lo investigaré yo, sin especialista adecuado: Aprendizaje de francés con Claude\n\n'+reason),{specialist:'Kelsier',titulo:'Aprendizaje de francés con Claude',reason,no_specialist:true});
 for(const name of ['Marsh','Dockson','Sazed']){
  const decision=routeDecision('Lo investigará '+name+': Tema concreto del guardado\n\n'+route.reason);
  assert.equal(decision.specialist,name);assert.equal(decision.no_specialist,false);
 }
 for(const reply of ['Lo investigará Kelsier: Aprendizaje de francés\n\n'+reason,'Lo investigará Otro: Aprendizaje de francés\n\n'+reason,'Lo investigará Sazed: Tema concreto\n\nCorto','Lo investigará Sazed: ficha.md\n\n'+reason,'Lo investigará Sazed: '+'x'.repeat(161)+'\n\n'+reason])assert.throws(()=>routeDecision(reply));
 assert.equal(routeDecision('```json\n'+JSON.stringify(route)+'\n```').specialist,'Sazed');
});
test('readable supervision preserves decisions and rejects decisions from another phase',()=>{
 const reason='El contenido central consta completo, pero su eficacia no está comprobada.';
 for(const [label,action,watch] of [['Revisión aprobada','approve',false],['Corrección necesaria','revise',false],['Trabajo detenido','stop',false],['Conviene esperar','wait',true],['Revisión aplazada','defer',true],['Trabajo detenido','stop',true]]){
  const value=teamReview(label+': Aprendizaje de francés\n\n'+reason,watch);
  assert.equal(value.action,action);assert.match(value.reason,/Aprendizaje de francés/);assert.ok(value.reason.endsWith(reason));
 }
 assert.throws(()=>teamReview('Revisión aprobada: Aprendizaje de francés\n\n'+reason,true));
 assert.throws(()=>teamReview('Conviene esperar: Investigación en curso\n\n'+reason));
 assert.throws(()=>teamReview('Revisión aprobada: '+'x'.repeat(100)+'\n\nSí'));
 assert.throws(()=>teamReview('Todo correcto, continúa con ello.'));
});
test('communication instructions affect only machine-consumed phases',()=>{
 for(const phase of ['classify','supervise','watch'])assert.match(communicationPrompt(phase),/sin JSON ni bloques de código/);
 for(const phase of ['investigate','correct','present','organize_pages',undefined])assert.equal(communicationPrompt(phase),'');
 assert.match(communicationPrompt('classify'),/sin especialista adecuado/);
 assert.match(communicationPrompt('supervise'),/Revisión aprobada/);
 assert.match(communicationPrompt('watch'),/Conviene esperar/);
});
test('resuming an existing delivery does not rerun classification or research',async()=>{
 const f=fixture();Object.assign(f.state,{route,packet:{workspace:'/packet'},researched:true});
 await researchTeam(f.io,f.state,{id:'123'});assert.deepEqual(f.calls.map(x=>x.phase),['supervise']);
});
test('supervision cannot approve an absent delivery or a rejected result',async()=>{
 const f=fixture();f.io.delivery=async()=>{throw Error('delivery missing');};await assert.rejects(researchTeam(f.io,f.state,{id:'123'}),/delivery missing/);assert.ok(!f.accepted());assert.ok(!f.calls.some(x=>x.phase==='supervise'));
 const g=fixture();g.state.route=route;g.io.call=async()=>JSON.stringify({action:'revise',reason:'La entrega no coincide con el encargo al investigador'});
 await assert.rejects(researchTeam(g.io,g.state,{id:'123'}),/team_review_deferred/);assert.ok(!g.accepted());
});
test('a requested correction returns to the same specialist before another review',async()=>{
 const f=fixture(),call=f.io.call;
 f.io.call=async(phase,actor,payload)=>{
  if(phase==='supervise'){f.calls.push({phase,actor,payload});return JSON.stringify({action:'revise',reason:'Aclarar qué fuente es central y cuál es solo contexto'});}
  return call(phase,actor,payload);
 };
 await researchTeam(f.io,f.state,{id:'123'});
 assert.deepEqual(f.calls.map(x=>[x.phase,x.actor]),[['classify','Kelsier'],['investigate','Sazed'],['supervise','Tindwyl'],['correct','Sazed'],['resupervise','Tindwyl']]);
 assert.match(f.calls[3].payload.feedback,/fuente es central/);assert.ok(f.accepted());
 const before=f.calls.length;await researchTeam(f.io,f.state,{id:'123'});assert.equal(f.calls.length,before);
});
test('integration preserves the old ficha even if the specialist rewrites its packet',()=>{
 const old='Original evidence\nEstado actual: PARCIAL',newText='New conclusion\nEstado actual: COMPLETA';
 const result=preserveFicha(old,newText,'Dockson');assert.ok(result.startsWith(old));assert.ok(result.endsWith(newText));assert.match(result,/Dictamen del especialista — Dockson/);
 assert.equal(preserveFicha(old,old+'\n'+newText,'Dockson'),old+'\n'+newText);
});
test('public packet copying rejects symlinks rather than sharing another home',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'team-packet-'));
 try{await fs.mkdir(path.join(dir,'src'));await fs.writeFile(path.join(dir,'src','post.md'),'Public source');await copyResearchTree(path.join(dir,'src'),path.join(dir,'dest'));assert.equal(await fs.readFile(path.join(dir,'dest','post.md'),'utf8'),'Public source');await fs.symlink('/etc/passwd',path.join(dir,'src','unsafe'));await assert.rejects(copyResearchTree(path.join(dir,'src','unsafe'),path.join(dir,'leak')),/Unsafe/);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('without a ficha cap, the global deadline still stops the queue',async()=>{
 let time=0,calls=0;const io={now:()=>time,busy:async()=>false,snapshot:async()=>({pending:[{id:'1',state:'PARCIAL'}],blocked:0,complete:0,fingerprints:{'1':String(calls)}}),review:async()=>JSON.stringify({action:'continue',target_id:'1',reason:'Still pending'}),work:async()=>{calls++;time+=2000;return {text:'research',accepted:true};},record:async()=>{}};
 const result=await supervise(io,{rounds:Infinity,seconds:3,stalls:2});assert.equal(result.reason,'time_limit');assert.equal(calls,2);
});
