import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { dispatchRoutine } from './routine.mjs';

const hash = x => createHash('sha256').update(x).digest('hex');
const names = ['Kelsier', 'Marsh', 'Dockson', 'Sazed'];
const terminal = ['completed', 'failed', 'cancelled'];
const exec = promisify(execFile);
// Equivalent URL separators are not a change to the sources or the renderer.
export function samePageSource(a, b) {
  const comparable = source => source.replace(/(https?:\/\/[^ "\n\\]+) [;·] (?=https?:\/\/)/g, '$1 · ');
  return comparable(a) === comparable(b);
}
export function summaryOf(text, presentation) {
  const start = [...text.matchAll(/^Conclusión:/gm)].at(-1)?.index;
  const section = start === undefined ? '' : text.slice(start).split(/^## /m)[0];
  const labels = ['Conclusión', 'Para ti|Utilidad', 'Recomendación', 'Límite', 'Fuentes'];
  const lines = labels.map(label => section.match(new RegExp('^(?:' + label + '):[^\\n]*', 'm'))?.[0]);
  if (lines.some(line=>!line) && presentation?.resumen) {
    if (presentation.fichaHash!==hash(text)) throw Error('Historical presentation summary no longer matches its source');
    if (!Array.isArray(presentation.resumen) || presentation.resumen.length!==5 || presentation.resumen.some((line,i)=>typeof line!=='string'||line.includes('\n')||!new RegExp('^(?:'+labels[i]+'):').test(line))) throw Error('Invalid historical presentation summary');
    return presentation.resumen;
  }
  return lines.map(line=>line??'Pendiente de normalizar este apartado; consulta la ficha original.');
}
export function pageSource(name, cards, revision) {
  if (!names.includes(name)) throw Error('Not a research publisher');
  const data = JSON.stringify(cards).replaceAll('<', '\\u003c');
  return `// gablab-research:${name}:${revision}
const cards = ${data};
export default function ResearchOverview() {
 const [state,setState] = useState('Todas');
 const [query,setQuery] = useState('');
 const visible = cards.filter(c => (state === 'Todas' || c.estado === state) && (c.title + ' ' + c.tema + ' ' + c.tipo).toLowerCase().includes(query.toLowerCase()));
 return <Page title="${name} · Investigación" lang="es" width="wide" summary="Presentación de investigación archivada. Filtrar no guarda decisiones ni cambia los dictámenes.">
 <Section heading="Resumen"><Metrics metrics={['COMPLETA','PARCIAL','PENDIENTE','BLOQUEADA'].map(s => ({label:s,value:String(cards.filter(c=>c.estado===s).length)}))}/>
 <Select label="Estado" value={state} onChange={setState} options={['Todas','COMPLETA','PARCIAL','PENDIENTE','BLOQUEADA'].map(s=>({value:s,label:s}))}/>
 <Input label="Buscar tema o tipo" value={query} onChange={setQuery}/>
 <Text>Instantánea actualizada al publicarla; reabre la página para obtener su última versión. Las fuentes incompletas y las ideas no probadas siguen visibles.</Text></Section>
 {visible.map(c => <Section key={c.id} id={'post-'+c.id} heading={c.title} caption={c.tipo+' · '+c.tema+' · '+c.proyectos} collapsible defaultOpen={false}>
 <Status tone={c.estado==='COMPLETA'?'success':c.estado==='BLOQUEADA'?'danger':'warning'}>{c.estado}</Status>
 <Text>{c.procedencia}</Text><Text>{c.revision}</Text>
 {c.lines.map((line,i)=><Text key={i}>{line}</Text>)}
 <LinkCards links={c.links}/></Section>)}
 </Page>;
}`;
}
async function atomic(file, value) {
  const temp = file + '.tmp';
  await fs.writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await fs.rename(temp, file);
}
async function contained(root, relative) {
  const real = await fs.realpath(path.join(root, relative));
  if (!real.startsWith(root + path.sep)) throw Error('Presentation source escaped knowledge');
  return real;
}
// Uses the native artifact API/storage, never a public file server or an HTML Artifact page.
async function artifact(db, owner, botId, name, mimeType, bytes) {
  const { createOwnedArtifact } = await import('/app/apps/api/src/artifacts.ts');
  const { createArtifactStore } = await import('/app/packages/adapters/src/artifact-store-factory.ts');
  const result = await createOwnedArtifact({ prisma: db, artifacts: createArtifactStore('/data', db) }, owner, {
    botId, name, mimeType, contentBase64: bytes.toString('base64'), clientNonce: 'research-pages:' + botId + ':' + hash(Buffer.concat([Buffer.from(name),bytes])),
  });
  return result;
}
export async function buildCatalog(db, owner, config, routing) {
  for (const name of names) {
    const actor=config.team[name];
    const bot=await db.bot.findFirst({where:{...owner,id:actor.id,archivedAt:null},select:{computer:{select:{homeKey:true}}}});
    if(!bot || bot.computer?.homeKey!==actor.homeKey)throw Error('Publisher ownership/workspace mismatch');
  }
  const knowledge = await fs.realpath(config.knowledge);
  const index = JSON.parse(await fs.readFile(path.join(knowledge, 'indice.json'), 'utf8'));
  const records = new Map();
  const results = path.join(knowledge, 'lotes/resultados-supervisor');
  const files = await Promise.all((await fs.readdir(results)).filter(f=>f.endsWith('.json')).map(async f=>({f, time:(await fs.stat(path.join(results,f))).mtimeMs})));
  for (const {f} of files.sort((a,b)=>a.time-b.time)) {
    const reading = JSON.parse(await fs.readFile(path.join(results,f),'utf8'));
    if (reading.equipo?.routing) records.set(reading.id, reading);
  }
  const catalog = Object.fromEntries(names.map(name=>[name,[]]));
  for (const [id, item] of Object.entries(index.items)) {
    if (!/^\d{10,25}$/.test(id)) throw Error('Invalid source ID');
    const text = await fs.readFile(await contained(knowledge,item.ficha),'utf8');
    const reading = records.get(id), prior = routing[id];
    const name = reading?.equipo.routing.specialist ?? prior?.responsable ?? 'Kelsier';
    if (!names.includes(name)) throw Error('Invalid presentation owner');
    const lines = summaryOf(text, prior);
    const last = [...text.matchAll(/^Conclusión:/gm)].at(-1)?.index ?? 0;
    const title = reading?.equipo.routing.titulo ?? prior?.titulo ?? [...text.slice(0,last||text.length).matchAll(/^# (.+)$/gm)].at(-1)?.[1].replace(/\s*[—–-]\s*(COMPLETA|PARCIAL|PENDIENTE|BLOQUEADA)\s*$/,'') ?? id;
    const links = [];
    const full = await artifact(db,owner,config.team[name].id,'guardado-'+id+'-ficha.md','text/markdown',Buffer.from(text));
    links.push({title:'Ficha completa e historial',href:config.webOrigin+'/app/artifacts/'+full.id});
    const sources = path.join(knowledge,'fuentes',id);
    try {
      await fs.access(sources);
      // Python's standard library makes a private download; links and special entries fail closed.
      const py = "import pathlib,sys,zipfile,io\np=pathlib.Path(sys.argv[1]); b=io.BytesIO()\nwith zipfile.ZipFile(b,'w',zipfile.ZIP_DEFLATED) as z:\n for f in sorted(p.rglob('*')):\n  if f.is_symlink(): raise ValueError('Unsafe archive link')\n  if f.is_file():\n   if f.stat().st_size>10485760: raise ValueError('Source too large')\n   z.writestr(zipfile.ZipInfo(str(f.relative_to(p)),(1980,1,1,0,0,0)),f.read_bytes(),compress_type=zipfile.ZIP_DEFLATED)\nif len(b.getvalue())>10485760: raise ValueError('Archive exceeds native limit')\nsys.stdout.buffer.write(b.getvalue())";
      await contained(knowledge,'fuentes/'+id);
      const {stdout} = await exec('python3',['-c',py,sources],{encoding:'buffer',maxBuffer:11*1024*1024});
      const bundle = await artifact(db,owner,config.team[name].id,'guardado-'+id+'-fuentes.zip','application/zip',stdout);
      links.push({title:'Artículo, hilo, imágenes y procedencia archivados',href:config.webOrigin+'/app/artifacts/'+bundle.id});
    } catch(e) { if(e.code!=='ENOENT')throw e; }
    const urls = [...new Set((lines[4].match(/https?:\/\/[^\s<>]+/g)??[]).map(u=>u.replace(/[;·.,)]+$/,'')))].slice(0,2);
    links.push(...urls.map(href=>({title:'Fuente original',href})));
    const researcher = reading?.equipo.routing.specialist;
    catalog[name].push({id,title,estado:item.estado,tema:prior?.tema??(item.etiquetas??[]).join(', ')??'Sin clasificar',tipo:prior?.tipo??reading?.original?.tipo??'Guardado',
      proyectos:[...text.matchAll(/\b(DEV-PI|red-teamer|PC de trabajo|GabLab)\b/gi)].map(m=>m[0]).filter((x,i,a)=>a.indexOf(x)===i).join(', ')||'Sin proyecto explícito',
      procedencia:researcher?'Investigación: '+researcher+'; clasificación: Kelsier; supervisión: Tindwyl.':'Ficha histórica del archivo de Kelsier. Organización temática, no nueva investigación ni revisión atribuida a '+name+'.',
      revision:'Post '+id+' · SHA-256 de la ficha '+hash(text).slice(0,16)+(text.lastIndexOf('## Fuentes públicas recuperadas')>last?' · Hay fuentes incorporadas después del resumen conservado.':''),lines,links});
  }
  return catalog;
}

// The bot invokes save_page in a real owner-approved routine; there is no fake context or DB page writer.
export async function refreshPages(db, owner, config, deadline, options={}) {
  const root = path.dirname(config.configPath);
  const folder = path.join(root,'presentations'); await fs.mkdir(folder,{recursive:true,mode:0o700});
  const stateFile=path.join(folder,'state.json');
  let state;try{state=JSON.parse(await fs.readFile(stateFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state={};}
  const routing=JSON.parse(await fs.readFile(path.join(folder,'routing.json'),'utf8'));
  const catalog=await buildCatalog(db,owner,config,routing);
  for(const name of names){
    if(Date.now()>=deadline) return {pending:true};
    const cards=catalog[name], revision=hash(JSON.stringify(cards)), actor=config.team[name];
    const source=pageSource(name,cards,revision);
    const {checkPageSource}=await import('/app/packages/page-kit/src/validate.ts');
    const check=checkPageSource(source);if(!check.ok)throw Error(check.errors.join('; '));
    const previous=state[name];
    const existing=previous?.pageId?await db.page.findFirst({where:{...owner,id:previous.pageId,botId:actor.id},include:{versions:{orderBy:{version:'desc'},take:1}}}):null;
    if(existing && existing.visibility!=='private')throw Error('Managed page privacy changed: '+name);
    if(previous?.revision===revision && existing && samePageSource(existing.versions[0].source,source))continue;
    if(previous?.pendingRun && existing && existing.visibility==='private' && samePageSource(existing.versions[0].source,source)){
      const receipt=await db.run.findFirst({where:{...owner,id:previous.pendingRun,botId:actor.id,routineId:actor.routineId,clientNonce:'routine-run:'+owner.userId+':presentation-'+actor.id+'-'+revision,status:'completed'},select:{id:true}});
      if(receipt){state[name]={pageId:existing.id,revision,sourceHash:hash(existing.versions[0].source),runId:receipt.id};await atomic(stateFile,state);continue;}
    }
    if(previous?.sourceHash && existing && hash(existing.versions[0].source)!==previous.sourceHash)throw Error('Managed page was edited: reconcile '+name+' before republishing');
    const workspace='/data/homes/'+actor.homeKey+'/knowledge/guardados-x/presentaciones';
    await fs.mkdir(workspace,{recursive:true,mode:0o700});
    const file='resumen-'+name+'-'+revision+'.jsx';await fs.writeFile(path.join(workspace,file),source,{mode:0o600});
    const parts=[];for(let i=0;i<source.length;i+=3500){const part=file+'.parte-'+String(parts.length+1).padStart(3,'0');await fs.writeFile(path.join(workspace,part),source.slice(i,i+3500),{mode:0o600});parts.push(part);}
    const nonce='presentation-'+actor.id+'-'+revision;
    let run=await db.run.findFirst({where:{...owner,botId:actor.id,routineId:actor.routineId,clientNonce:'routine-run:'+owner.userId+':'+nonce},select:{id:true,status:true}});
    if(!run){if(options.maxRuns!==undefined && (options.used??0)>=options.maxRuns)return{pending:true};await options.reserve?.(nonce);run=await dispatchRoutine(db,owner,actor.routineId,actor.id,nonce,{phase:'present',workspace:'/home/rakazo/knowledge/guardados-x/presentaciones',parts,pageId:previous?.pageId??null,title:name+' · Investigación',revision,sourceFile:file});options.used=(options.used??0)+1;}
    state[name]={...previous,pendingRun:run.id};await atomic(stateFile,state);
    for(;;){
      if(Date.now()>=deadline || options.stopped?.()) {
        const {cancelRunsInTransaction}=await import('/app/packages/db/src/cancel-runs.ts');
        const owned=await db.run.findMany({where:{...owner,id:run.id,botId:actor.id},select:{id:true,taskId:true,userId:true,spaceId:true}});
        await db.$transaction(tx=>cancelRunsInTransaction(tx,owned,new Date()));
        throw Error('Presentation window exhausted: '+run.id);
      }
      const current=await db.run.findFirstOrThrow({where:{...owner,id:run.id},select:{status:true,error:true}});
      if(terminal.includes(current.status)){if(current.status!=='completed')throw Error('Presentation '+name+': '+current.status);break;}
      if(current.status.startsWith('waiting_')) {
        const {cancelRunsInTransaction}=await import('/app/packages/db/src/cancel-runs.ts');
        const owned=await db.run.findMany({where:{...owner,id:run.id,botId:actor.id},select:{id:true,taskId:true,userId:true,spaceId:true}});
        await db.$transaction(tx=>cancelRunsInTransaction(tx,owned,new Date()));
        throw Error('Presentation approval required: '+run.id);
      }
      await new Promise(r=>setTimeout(r,3000));
    }
    const candidates=await db.page.findMany({where:{...owner,botId:actor.id,groupId:null},include:{versions:{orderBy:{version:'desc'},take:1}}});
    const matching=candidates.filter(p=>p.versions[0] && samePageSource(p.versions[0].source,source));
    if(matching.length!==1 || matching[0].visibility!=='private' || (previous?.pageId && matching[0].id!==previous.pageId))throw Error('Page receipt, ownership, source or privacy mismatch: '+name);
    state[name]={pageId:matching[0].id,revision,sourceHash:hash(matching[0].versions[0].source),runId:run.id};await atomic(stateFile,state);
    console.log(JSON.stringify({presentation:name,pageId:matching[0].id,version:matching[0].currentVersion,cards:cards.length}));
  }
  return state;
}
