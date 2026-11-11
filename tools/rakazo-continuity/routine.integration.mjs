import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDb} from '/app/packages/db/src/client.ts';
import {runAsSystem,runAsTenant} from '/app/packages/db/src/row-security.ts';
import {dispatchRoutine} from '/data/documentary-supervisor/routine.mjs';
const c=JSON.parse(await fs.readFile('/data/documentary-supervisor/config.json','utf8'));
const policy=(await fs.readFile('/data/documentary-supervisor/source-policy.md','utf8')).trim();
const {prisma:db,pool}=createDb(process.env.DATABASE_URL,{poolMax:1});
const rollback=Error('EXPECTED_ROLLBACK');
try {
 const owner=await runAsSystem('Validate authorized specialist routines without model execution',()=>db.bot.findUniqueOrThrow({where:{id:c.worker.id},select:{userId:true,spaceId:true}}));
 await runAsTenant(owner,async()=>{
  assert.equal(await db.run.count({where:{...owner,botId:{in:Object.values(c.team).map(x=>x.id)},status:{notIn:['completed','failed','cancelled']}}}),0);
  for(const [name,actor] of Object.entries(c.team)){
   const nonce='preflight-'+randomUUID();
   const proxy=new Proxy(db,{get(target,key){
    if(key==='$transaction')return fn=>db.$transaction(async tx=>{
     const first=await fn(tx),row=await tx.run.findUniqueOrThrow({where:{id:first.id},include:{task:true}});
     assert.equal(row.trigger,'routine');assert.equal(row.routineId,actor.routineId);assert.equal(row.botId,actor.id);assert.equal(row.status,'queued');assert.equal(row.userId,owner.userId);
     assert.ok(row.task.prompt.includes(nonce));assert.ok(row.task.prompt.startsWith('Autorización expresa'));
     if(name==='Kelsier'||name==='Tindwyl')assert.ok(row.task.prompt.includes('sin JSON ni bloques de código'));
     if(name!=='Tindwyl')assert.ok(row.task.prompt.includes(policy),'Current source policy missing');
     const assignment={assignment:nonce,id:c.allowedIds[0],phase:name==='Tindwyl'?'supervise':name==='Kelsier'?'classify':'investigate'};
     assert.equal((await dispatchRoutine(tx,owner,actor.routineId,actor.id,nonce,assignment)).id,row.id);
     const other=Object.values(c.team).find(x=>x.id!==actor.id);
     await assert.rejects(dispatchRoutine(tx,owner,actor.routineId,other.id,nonce,assignment),/Unauthorized/);
     throw rollback;
    });return Reflect.get(target,key);
   }});
   await assert.rejects(dispatchRoutine(proxy,owner,actor.routineId,actor.id,nonce,{assignment:nonce,id:c.allowedIds[0],phase:name==='Tindwyl'?'supervise':name==='Kelsier'?'classify':'investigate'}),e=>e===rollback);
   assert.equal(await db.run.count({where:{...owner,clientNonce:'routine-run:'+owner.userId+':'+nonce}}),0);
  }
  console.log('PASS: all five native routines, ownership, grants, source policy, nonce replay, wrong-bot rejection and rollback. Zero models.');
 });
}finally{await db.$disconnect();await pool.end();}
