/* Offline build: Node built-ins only. Every bundled result is recalculated. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
function local(file){
  if(typeof file!=='string'||path.isAbsolute(file))throw Error('Ogiltig byggsökväg');
  const target=path.resolve(root,file);
  if(!target.startsWith(root+path.sep))throw Error('Byggsökväg utanför paketet: '+file);
  return target;
}
const read=file=>fs.readFileSync(local(file),'utf8');
const json=file=>JSON.parse(read(file));
const write=(file,text)=>{fs.mkdirSync(path.dirname(local(file)),{recursive:true});fs.writeFileSync(local(file),text);};
const safe=value=>JSON.stringify(value).replaceAll('<','\\u003c');
/* Samma inbäddning som vagvis_sidor.py gör vid körning i Streamlit: filens text, validerad. */
function embed(file,text){text=text.trim();if(file.endsWith('.json')){JSON.parse(text);return text.replaceAll('<','\\u003c');}if(file.endsWith('.js'))return text.replace(/<\/script/gi,'<\\/script');return text;}
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function list(directory){
  return fs.readdirSync(local(directory),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry=>entry.isDirectory()?list(directory+'/'+entry.name):[directory+'/'+entry.name]);
}
async function main(){
  const V=require('./source/core.js');
  if(V.VERSION!=='2.2.4')throw Error('Bygget kräver beräkningsmotor 2.2.4');
  const omraden=json('kallkod/data/omraden.json'),project=V.unpackProject(json('kallkod/data/project.json'),omraden),households=V.unpackProject(json('kallkod/data/household-project.json'),omraden),cfg=V.config(project.config||json('kallkod/data/config.json'));
  V.validateProject(project);
  const registry=json('underlag/evidensregister.json');
  if(registry.version!=='2.2.4')throw Error('Fel version i evidensregistret');
  const E=require('./source/evidence.js').create(registry);
  // No inherited numerical baseline is read. Fixed seed/config reproduce the draws.
  let result;
  if(process.argv.includes('--reuse-result')){
    result=json('kallkod/data/result.json');
    if(result.version!==V.VERSION||result.fingerprint!==V.fingerprint(project,cfg))throw Error('Det lagrade resultatet matchar inte aktuell modell, konfiguration och indata. Bygg utan --reuse-result.');
    console.log('Återanvänder det aktuella, verifierade Vägvis-resultatet.');
  }else{
    let last=-1;
    result=await V.simulate(project,cfg,fraction=>{const step=Math.floor(fraction*4);if(step>last){last=step;console.log('A-simulering '+Math.min(100,step*25)+' %');}});
  }
  result.fingerprint=V.fingerprint(project,cfg);
  result.drawsCity=result.drawsCity||{};
  if(result.draws instanceof Map){
    for(const [key,value] of result.draws)if(key.startsWith('city|')){
      result.drawsCity[key]=Object.fromEntries(Object.entries(value).map(([name,values])=>[name,Array.from(values)]));
    }
  }
  delete result.draws;
  write('kallkod/data/result.json',JSON.stringify(result)+'\n');
  const html=read('kallkod/source/shell.html').replace(/\{\{([^}]+)\}\}/g,(_,file)=>embed(file,read(file)));
  if(/\{\{[^}]+\}\}/.test(html))throw Error('En byggmarkör saknar innehåll');
  write('app/Vagvis.html',html);
  const styles=read('kallkod/source/style.css')+'body{display:block;max-width:1080px;margin:24px auto;padding:20px}.card{margin:20px 0}h1{font-size:36px}a{overflow-wrap:anywhere}@media print{body{padding:0;margin:0}.card{break-inside:auto}}';
  const method='<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vägvis 2.2.4 – metod och källor</title><style>'+styles+'</style></head><body><h1>Vägvis 2.2.4 – metod och källor</h1><p>Två självständiga beräkningsperspektiv. A avser trafiken på vägar inom området. B avser hushållens bilar och hela deras körning, tilldelad hemområdet. Resultaten har olika systemgränser och ska inte summeras.</p>'+E.render(cfg,project)+E.render(V.config(households.config||cfg),households)+'</body></html>';
  write('app/Metod_och_anvandning.html',method);
  const traffic='<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Trafikdata</title><style>body{font:17px/1.6 system-ui;max-width:1000px;margin:30px auto;padding:20px}pre{white-space:pre-wrap}</style></head><body><h1>Underlag för trafikmodellen</h1><pre>'+esc(read('dokument/Trafikdata_till_Malmo.txt'))+'</pre></body></html>';
  write('app/Trafikdata_till_Malmo.html',traffic);
  const files=[...list('app').filter(file=>file!=='app/Vagvis.html'),...list('kallkod/source'),...list('kallkod/data'),'kallkod/bygg_appen.cjs','streamlit_app.py','vagvis_sidor.py','requirements.txt','underlag/evidensregister.json','underlag/atgarder.json','underlag/trafik/matta_lankar_2024.json'];
  const hashes=Object.fromEntries(files.sort().map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(local(file))).digest('hex')]));
  write('underlag/SHA256.json',JSON.stringify(hashes,null,2)+'\n');
  console.log('Byggd Vägvis '+V.VERSION+': '+Buffer.byteLength(html)+' byte; aktuellt A-resultat, '+cfg.iterations+' simuleringar.');
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
