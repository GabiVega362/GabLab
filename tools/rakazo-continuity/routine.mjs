import { communicationPrompt } from './team.mjs';

// Native owner-approved routines, not a rewritten webhook trigger or a fake user run.
export async function dispatchRoutine(db, owner, routineId, botId, nonce, assignment) {
  const { createRepos } = await import('/app/packages/db/src/repos.ts');
  const { routineTestTarget, routineTestRunNonce, createRoutineTestRun } = await import('/app/apps/api/src/routines.ts');
  const { createAgentSkillsService } = await import('/app/apps/api/src/agent-skills.ts');
  const { expandSkillReferencesInPrompt } = await import('/app/packages/core/src/agent-skill.ts');
  const key = routineTestRunNonce(owner, nonce);
  const existing = await db.run.findFirst({ where: { ...owner, botId, routineId, clientNonce: key }, select: { id: true } });
  if (existing) return existing;
  const target = await routineTestTarget(db, createRepos(db), owner, routineId);
  if (!target.routine.active || target.botId !== botId) throw Error('Unauthorized or inactive documentary routine');
  const skills = await createAgentSkillsService(db).listWithContent(owner);
  const prompt = expandSkillReferencesInPrompt(target.routine.prompt, skills) + '\n\n' + communicationPrompt(assignment.phase) + '\n\nAsignación del controlador autorizado:\n' + JSON.stringify(assignment);
  return db.$transaction(async tx => {
    const replay = await tx.run.findFirst({ where: { ...owner, botId, routineId, clientNonce: key }, select: { id: true } });
    if (replay) return replay;
    if (await tx.run.count({ where: { ...owner, botId, status: { notIn: ['completed', 'failed', 'cancelled'] } } })) throw Error('other_run_active');
    // RunWorkerHost scans durable queued runs every five seconds; no custom executor.
    return createRoutineTestRun(tx, owner, target, prompt, key);
  });
}
