import fs from 'node:fs/promises';
import path from 'node:path';

const json = text => JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
export function communicationPrompt(phase) {
  if (phase === 'classify') return `FASE classify — respuesta para Gabi, sin JSON ni bloques de código.
Primera línea: «Lo investigará Marsh: Título», «Lo investigará Dockson: Título» o «Lo investigará Sazed: Título». Solo si ninguno encaja: «Lo investigaré yo, sin especialista adecuado: Título».
Después de una línea en blanco, explica en un párrafo breve por qué ese reparto tiene sentido. Para Kelsier justifica por qué ninguna especialidad encaja; no lo uses como sustituto de un compañero bloqueado. Esto propone la asignación, no acredita un encargo ya ejecutado.
Título conceptual de 8–160 caracteres; si trata de un modelo, conserva su nombre exacto y variante documentada. No autor, ID ni archivo. No investigues ni uses herramientas.`;
  if (phase === 'supervise' || phase === 'watch') return `FASE ${phase} — respuesta para Gabi, sin JSON ni bloques de código.
Primera línea: ${phase === 'watch' ? '«Conviene esperar: Título», «Revisión aplazada: Título» o «Trabajo detenido: Título»' : '«Revisión aprobada: Título», «Corrección necesaria: Título» o «Trabajo detenido: Título»'}.
Después de una línea en blanco, explica en un párrafo breve qué se ha revisado, el estado real y el límite o siguiente paso pertinente. Usa el tema facilitado; en watch sin tema usa «Investigación en curso». No vuelques IDs, nonces, recibos ni rutas internas.
No afirmes lectura independiente: solo revisas metadatos y recibos. Aprobar permite integrar el estado real, también PARCIAL/BLOQUEADA, y no demuestra eficacia ni investigación independiente. Una corrección debe ser concreta; esperar no prueba atasco. Sin herramientas ni investigación propia. Mantén los criterios de decisión y cobertura existentes.`;
  return '';
}
export function routeDecision(text) {
  const match = text.trim().match(/^(?:Lo investigará (Marsh|Dockson|Sazed)|Lo investigaré yo, sin especialista adecuado): ([^\n]+)\n+([\s\S]+)$/);
  const value = match ? { specialist: match[1] ?? 'Kelsier', titulo: match[2].trim(), reason: match[3].trim(), no_specialist: !match[1] } : json(text);
  if (!['Marsh', 'Dockson', 'Sazed', 'Kelsier'].includes(value.specialist) || typeof value.reason !== 'string' || value.reason.length < 20) throw Error('Invalid specialist assignment');
  if (value.specialist === 'Kelsier' && value.no_specialist !== true) throw Error('Kelsier may research only without a matching specialist');
  if (value.titulo !== undefined && (typeof value.titulo !== 'string' || value.titulo.trim().length < 8 || value.titulo.length > 160 || /^\d+$/.test(value.titulo) || value.titulo.endsWith('.md'))) throw Error('Invalid conceptual title');
  return value;
}
export function teamReview(text, watch = false) {
  const actions = { 'Revisión aprobada': 'approve', 'Corrección necesaria': 'revise', 'Trabajo detenido': 'stop', 'Conviene esperar': 'wait', 'Revisión aplazada': 'defer' };
  const match = text.trim().match(/^(Revisión aprobada|Corrección necesaria|Trabajo detenido|Conviene esperar|Revisión aplazada): ([^\n]+)\n+([\s\S]+)$/);
  if (match && match[3].trim().length < 20) throw Error('Invalid team supervision');
  const value = match ? { action: actions[match[1]], reason: match[2].trim() + ': ' + match[3].trim() } : json(text);
  if (!(watch ? ['wait', 'defer', 'stop'] : ['approve', 'revise', 'stop']).includes(value.action) || typeof value.reason !== 'string' || value.reason.length < 20) throw Error('Invalid team supervision');
  return value;
}
// Each stage is durably checkpointed; a replay uses the same native run nonce.
export async function researchTeam(io, state, assignment) {
  if (!state.route) {
    state.route = routeDecision(await io.call('classify', 'Kelsier', { post: await io.post() }));
    await io.checkpoint();
  }
  const actor = state.route.specialist;
  if (!state.packet) { state.packet = await io.prepare(actor); await io.checkpoint(); }
  if (!state.researched) {
    await io.call('investigate', actor, { ...assignment, ...state.packet, routing: state.route });
    state.researched = true; await io.checkpoint();
  }
  let delivery = await io.delivery(actor, state.packet);
  const superviseDelivery = phase => io.call(phase, 'Tindwyl', {
    routing: state.route, researcher: actor, receipts: io.receipts(),
    // A short justification explains secondary partial sources without exposing whole articles.
    reading: { estado: delivery.reading.estado, motivo: delivery.reading.motivo, original: delivery.reading.original, pendiente: delivery.reading.pendiente,
      fuentes: delivery.reading.fuentes.map(({ url, cobertura }) => ({ url, cobertura })),
      imagenes: { estado: delivery.reading.imagenes.estado, count: delivery.reading.imagenes.archivos.length } },
  });
  if (!state.review) {
    state.review = teamReview(await superviseDelivery('supervise'));
    await io.checkpoint();
  }
  if (state.review.action === 'revise' && !state.corrected) {
    await io.call('correct', actor, { ...assignment, ...state.packet, routing: state.route, feedback: state.review.reason });
    state.corrected = true; await io.checkpoint();
  }
  if (state.corrected && !state.secondReview) {
    delivery = await io.delivery(actor, state.packet);
    state.secondReview = teamReview(await superviseDelivery('resupervise'));
    await io.checkpoint();
  }
  const review = state.secondReview ?? state.review;
  if (review.action !== 'approve') throw Error(review.action === 'stop' ? 'team_supervision_stop' : 'team_review_deferred');
  await io.accept(delivery);
  return { actor, review };
}

// Copy only this assignment's public research packet, never an entire home or credentials.
export function preserveFicha(before, delivered, actor) {
  return delivered.startsWith(before) ? delivered : before + '\n\n## Dictamen del especialista — ' + actor + '\n\n' + delivered;
}

export async function copyResearchTree(source, target) {
  const stat = await fs.lstat(source);
  if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw Error('Unsafe research packet entry');
  if (stat.isDirectory()) {
    await fs.mkdir(target, { recursive: true, mode: 0o700 });
    for (const entry of await fs.readdir(source)) await copyResearchTree(path.join(source, entry), path.join(target, entry));
  } else {
    if (stat.size > 20 * 1024 * 1024) throw Error('Research packet file too large');
    await fs.writeFile(target, await fs.readFile(source), { flag: 'wx', mode: 0o600 });
  }
}
