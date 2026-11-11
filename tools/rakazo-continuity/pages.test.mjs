import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { routeDecision } from './team.mjs';
import { summaryOf, pageSource, samePageSource } from './pages.mjs';

test('presentation uses the last documentary summary, not the historical one', () => {
  const old = 'Conclusión: antes\nPara ti: antes\nRecomendación: antes\nLímite: antes\nFuentes: https://old.example\n';
  const latest = 'Conclusión: ahora\nPara ti: proyecto\nRecomendación: conservar\nLímite: fuente parcial\nFuentes: https://new.example\n';
  assert.deepEqual(summaryOf(old+'\n## Dictamen nuevo\n'+latest), latest.trim().split('\n'));
  assert.equal(summaryOf('Sin resumen estructurado').length,5);
  assert.ok(summaryOf('Sin resumen estructurado').every(x=>x.includes('consulta la ficha original')));
});

test('historical presentation summaries are bound to the unchanged original', () => {
  const text='Dictamen documental sin cinco líneas';
  const presentation={fichaHash:createHash('sha256').update(text).digest('hex'),resumen:['Conclusión: contraste existente','Utilidad: proyecto','Recomendación: conservar','Límite: sin prueba local','Fuentes: https://source.example']};
  assert.deepEqual(summaryOf(text,presentation),presentation.resumen);
  assert.throws(()=>summaryOf(text+' actualizado',presentation),/no longer matches/);
  assert.throws(()=>summaryOf(text,{...presentation,resumen:['texto sin etiquetas']}),/Invalid historical/);
  const current='Conclusión: nuevo\nPara ti: actual\nRecomendación: mantener\nLímite: sin pruebas\nFuentes: https://new.example';
  assert.equal(summaryOf(current,presentation)[0],'Conclusión: nuevo');
});

test('recommendation priorities survive presentation independently of documentary state', () => {
  for (const priority of ['ALTA','MEDIA','BAJA','SIN APLICACIÓN ACTUAL']) {
    for (const estado of ['COMPLETA','PARCIAL','PENDIENTE','BLOQUEADA']) {
      const recommendation='Recomendación: '+priority+' — DEV-PI: aporte concreto y acción justificada.';
      const text='Conclusión: alcance documentado\nPara ti: una idea del post\n'+recommendation+'\nLímite: sin prueba local\nFuentes: https://source.example';
      const lines=summaryOf(text);
      assert.equal(lines.length,5);
      assert.equal(lines[2],recommendation);
      const source=pageSource('Dockson',[{id:'1',estado,title:'Idea concreta',lines,links:[]}],'revision');
      const [card]=JSON.parse(source.match(/^const cards = (.+);$/m)[1]);
      assert.equal(card.estado,estado);
      assert.deepEqual(card.lines,lines);
    }
  }
  assert.equal(summaryOf('Conclusión: legado\nPara ti: contexto\nRecomendación: esperar\nLímite: sin pruebas\nFuentes: https://source.example')[2],'Recomendación: esperar');
});

test('conceptual titles travel with the specialist assignment without changing the role', () => {
  const routing={specialist:'Dockson',reason:'Es una mejora del harness y del contexto de agentes',titulo:'Mejora del contexto para agentes'};
  assert.equal(routeDecision(JSON.stringify(routing)).titulo,routing.titulo);
  for(const titulo of ['0000000000000000000','ficha.md',null])assert.throws(()=>routeDecision(JSON.stringify({...routing,titulo})),/Invalid conceptual title/);
});

test('only equivalent source URL separators can differ in a saved page', () => {
  const expected='const sources = "https://first.example/path · https://second.example/path";\n';
  assert.ok(samePageSource(expected,expected.replace(' · ',' ; ')));
  assert.ok(!samePageSource(expected,expected.replace('first.example','different.example')));
  assert.ok(!samePageSource(expected,expected+'attack();'));
  assert.ok(!samePageSource('Recomendación: adoptar','Recomendación: descartar'));
  assert.ok(!samePageSource('const x = 1;','const x = 2;'));
});

test('snapshot keeps unverified ideas and all states without executable source interpolation', () => {
  const cards=['COMPLETA','PARCIAL','PENDIENTE','BLOQUEADA'].map((estado,i)=>({id:String(i),estado,title:'</script><script>attack</script>',lines:['no probado'],links:[]}));
  const source=pageSource('Dockson',cards,'revision');
  assert.ok(!source.includes('</script>'));
  for(const {estado} of cards)assert.ok(source.includes(estado));
  assert.ok(source.includes('no probado'));
  assert.ok(!source.includes('ReplyButton'));
  assert.ok(!source.includes('Toggle'));
  assert.throws(()=>pageSource('Tindwyl',cards,'revision'),/Not a research publisher/);
  assert.throws(()=>pageSource('Pam',cards,'revision'),/Not a research publisher/);
});
