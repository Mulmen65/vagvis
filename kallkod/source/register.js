/* SCB PxWebApi v2 browser import. Complete validation precedes any activation.
   Selection and JSON-stat2 interpretation match verktyg/hamta_underlag.py. */
(function(root,factory){
 'use strict';
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./households.js'));
 else root.VagvisRegister=factory(root.VagvisHouseholds);
})(typeof globalThis!=='undefined'?globalThis:this,function(H){
 'use strict';
 const VERSION='2.2.4',BASE='https://statistikdatabasen.scb.se/api/v2';
 const COUNTS=Object.freeze({'1280':209,'1283':84,'2180':55});
 const TABLES=Object.freeze([
  {id:'TAB6568',field:'hh',path:'START__BE__BE0101__BE0101Y/HushallDesoTyp',status:null},
  {id:'TAB6589',field:'bil',path:'START__TK__TK1001__TK1001Z/PersBilarDesoN',status:'i trafik'},
  {id:'TAB6574',field:'bef',path:'START__BE__BE0101__BE0101Y/FolkmDesoAldKon',status:null}
 ]);
 const clone=x=>JSON.parse(JSON.stringify(x));
 const fail=message=>{throw new Error(message);};
 const slug=x=>String(x??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const same=(a,b)=>a.length===b.length&&a.every(x=>b.includes(x));
 const finiteCount=x=>typeof x==='number'&&Number.isFinite(x)&&Number.isInteger(x)&&x>=0;
 function codes(dimension){
  const index=dimension?.category?.index;
  if(Array.isArray(index)){if(new Set(index).size!==index.length)fail('Dubbla dimensionskoder i SCB-svaret.');return index.slice();}
  if(!index||typeof index!=='object')fail('JSON-stat-dimension saknar category.index.');
  const pairs=Object.entries(index).sort((a,b)=>a[1]-b[1]);
  if(!pairs.length||pairs.some((x,i)=>x[1]!==i))fail('JSON-stat-dimensionens index är inte komplett.');
  return pairs.map(x=>x[0]);
 }
 function totalCodes(dimension){
  const cc=codes(dimension),labels=dimension.category.label||{};
  const totals=['totalt','samtliga','totalt antal hushall','samtliga hushall','alla aldrar','samtliga aldrar','totalt, alla aldrar','kvinnor och man','bada konen','total'];
  const found=cc.filter(k=>totals.includes(slug(labels[k])));
  if(found.length===1)return found;
  if(cc.length===1)return cc;
  if(['kon','sex'].includes(slug(dimension.label))){const partition=cc.filter(k=>['kvinnor','man','women','men'].includes(slug(labels[k])));if(partition.length===2)return partition;}
  // null is deliberate omission of an officially declared aggregate, not a guessed code.
  if(dimension.extension?.elimination===true)return null;
  fail('Ingen entydig total eller disjunkt partition för '+(dimension.label||'okänd dimension')+'.');
 }
 function selection(metadata,table,regions,year=2024){
  if(year!==2024)fail('Denna registerkoppling gäller referensår 2024 och DeSO 2025.');
  if(metadata?.class!=='dataset'||!metadata.dimension||!Array.isArray(metadata.id))fail('Metadata följer inte PxWebApi v2 JSON-stat2; inga variabelkoder gissas.');
  const selected={};let region=false,time=false;
  for(const key of metadata.id){
   const dim=metadata.dimension[key],label=slug(dim?.label||key),norm=slug(key),available=codes(dim);
   if(['region','deso'].includes(norm)||label==='region'){
    if(!regions.every(k=>available.includes(k)))fail('Alla begärda DeSO 2025 finns inte i SCB:s regiondimension.');
    selected[key]=regions.slice();region=true;
   }else if((metadata.role?.time||[]).includes(key)||['tid','ar','time'].includes(norm)){
    if(!available.includes(String(year)))fail('Referensår 2024 saknas i SCB-tabellen.');selected[key]=[String(year)];time=true;
   }else if(norm==='status'||label==='status'){
    const found=available.filter(k=>slug(dim.category.label?.[k])===table.status);
    if(found.length!==1)fail('Personbilsstatus ”i trafik” kan inte väljas entydigt.');selected[key]=found;
   }else selected[key]=totalCodes(dim);
  }
  if(!region||!time||Object.values(selected).reduce((n,v)=>n*(v===null?1:v.length),1)>150000)fail('Region eller tid saknas, eller SCB-uttaget är för stort.');
  return selected;
 }
 function queryUrl(table,selected){
  const params=new URLSearchParams({lang:'sv',outputFormat:'json-stat2'});
  for(const [key,value]of Object.entries(selected))if(value!==null)params.append('valueCodes['+key+']',value.join(','));
  return BASE+'/tables/'+table.id+'/data?'+params.toString();
 }
 function flatten(data,selected){
  if(data?.class!=='dataset'||!Array.isArray(data.id)||!Object.hasOwn(data,'value'))fail('SCB-svaret är inte ett JSON-stat2-dataset.');
  const ids=data.id,sizes=data.size,dimensions=data.dimension||{};
  if(!Array.isArray(sizes)||sizes.length!==ids.length||new Set(ids).size!==ids.length)fail('SCB-dimensionerna är inkonsekventa.');
  const order=ids.map((key,i)=>{
   if(!Object.hasOwn(selected,key))fail('SCB-svaret innehåller en oväntad dimension: '+key+'.');
   const cc=codes(dimensions[key]),requested=selected[key];
   if(!Number.isInteger(sizes[i])||sizes[i]<1||cc.length!==sizes[i]||(requested===null?cc.length!==1:!same(cc,requested)))fail('SCB-svaret matchar inte urvalet: '+key+'.');
   return cc;
  });
  for(const [key,value]of Object.entries(selected))if(!ids.includes(key)&&value!==null&&value.length!==1)fail('En icke-skalär dimension eliminerades.');
  const n=sizes.reduce((a,b)=>a*b,1),values=data.value;
  if(!values||typeof values!=='object'||Array.isArray(values)&&values.length!==n)fail('SCB-dataceller saknas eller svaret är avkortat.');
  const rows=[];
  for(let index=0;index<n;index++){
   const value=values[index],mark=Array.isArray(data.status)?data.status[index]:data.status?.[String(index)];
   if(!finiteCount(value))fail('Saknat, skyddat, negativt eller icke-heltaligt SCB-antal ersätts inte med noll.');
   if(mark!=null&&!['','e','p'].includes(String(mark).trim().toLowerCase()))fail('SCB-cellstatus kräver metodbedömning: '+mark+'.');
   const row={};for(const [key,value]of Object.entries(selected))if(!ids.includes(key)&&value!==null)row[key]=value[0];
   let position=index;for(let j=ids.length-1;j>=0;j--){row[ids[j]]=order[j][position%sizes[j]];position=Math.floor(position/sizes[j]);}
   rows.push({...row,value});
  }
  return rows;
 }
 function unitReceipt(metadata,table,selected){
  const declared=[];
  for(const [key,dimension]of Object.entries(metadata.dimension||{})){
   const units=dimension.category?.unit||{};
   for(const code of selected[key]||[])if(units[code]){
    const unit=units[code],base=typeof unit==='string'?unit:unit.base;
    if(base!=null){
     const label=slug(base);
     if(!['antal','antal hushall','antal personer','antal bilar','antal fordon','hushall','personer','bilar','fordon','number','persons','households','vehicles'].includes(label))fail('Oväntad enhet i '+table.id+': '+base+'. Inga enhetsomräkningar gissas.');
     declared.push({dimension:key,code,unit:clone(unit)});
    }
   }
  }
  return {expected:'antal',validation:declared.length?'declared_metadata_and_integer_cells':'fixed_official_table_definition_and_integer_cells',declared};
 }
 function expectedCodes(project){
  if(project?.model!=='household'||String(project.metadata?.desoVersion)!=='2025'||!Array.isArray(project.d)||!Array.isArray(project.areas))fail('Import kräver hushållsprojektet med komplett DeSO 2025-geografi.');
  const areas=project.areas.filter(a=>a.level==='deso'),ids=areas.map(a=>String(a.id)).sort();
  if(ids.length!==348||new Set(ids).size!==348)fail('Projektet måste innehålla exakt 348 unika DeSO 2025.');
  for(const [city,count]of Object.entries(COUNTS))if(areas.filter(a=>String(a.city)===city).length!==count)fail('Fel antal DeSO för kommun '+city+'.');
  for(const a of areas)if(String(a.version)!=='2025'||!/^\d{4}[ABC]\d{4}$/.test(String(a.id))||String(a.id).slice(0,4)!==String(a.city))fail('Geografikod eller DeSO-version är felaktig.');
  const rows=project.d.map(r=>String(r.kod));if(!same(rows,ids)||new Set(rows).size!==348)fail('Hushållsraderna måste matcha samtliga DeSO-geometrier utan dubletter.');
  for(const r of project.d){const a=areas.find(a=>String(a.id)===String(r.kod));if(String(r.kk)!==String(a.city)||!r.sd||!project.areas.some(g=>g.level==='district'&&String(g.city)===String(r.kk)&&String(g.id)===String(r.sd)))fail('Kommun eller RegSO saknas för '+r.kod+'.');}
  return ids;
 }
 function pause(ms,signal){return new Promise((resolve,reject)=>{let timer;const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(cancelled());};if(signal?.aborted)return abort();timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);signal?.addEventListener('abort',abort,{once:true});});}
 const cancelled=()=>{const error=new Error('Registerhämtningen avbröts. Befintliga modelldata har behållits.');error.name='AbortError';return error;};
 async function digest(raw){
  if(!globalThis.crypto?.subtle)return null;
  const bytes=new TextEncoder().encode(raw),hash=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
 }
 async function fetchRegister(project,options={}){
  const {year=2024,signal,onProgress=()=>{}}=options,fetchImpl=options.fetchImpl||globalThis.fetch;
  if(year!==2024)fail('Registerkopplingen gäller endast 2024 med DeSO 2025.');
  if(typeof H?.validate!=='function')fail('Hushållsmodulen är inte laddad. Ladda om sidan; inga registerdata aktiverades.');
  if(typeof fetchImpl!=='function')fail('Webbläsaren saknar fetch. Använd paketets Python-hämtning.');
  const expected=expectedCodes(project),entries=[],receipts=[],merged=Object.fromEntries(expected.map(k=>[k,{kod:k}]));
  const total=TABLES.length*(1+Math.ceil(expected.length/25));let completed=0;
  const checkAbort=()=>{if(signal?.aborted)throw cancelled();};
  async function collect(id,url,table,phase){
   checkAbort();const fetchedAt=new Date().toISOString();let response,raw,attempts=0;
   for(let attempt=0;attempt<3;attempt++){
    checkAbort();attempts=attempt+1;const controller=new AbortController();let timedOut=false;
    const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>{timedOut=true;controller.abort();},35000);
    try{response=await fetchImpl(url,{method:'GET',mode:'cors',credentials:'omit',headers:{Accept:'application/json'},signal:controller.signal});if(response?.ok)raw=await response.text();}
    catch(error){
     if(signal?.aborted)throw cancelled();
     if(timedOut)fail('SCB-hämtningen tog längre än 35 sekunder. Befintliga modelldata har behållits.');
     fail('SCB kunde inte hämtas i webbläsaren (nätverk eller CORS). Befintliga data har behållits. Använd vid behov Python-hämtningen. '+(error.message||''));
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
    if(response?.ok)break;
    if([429,500,502,503,504].includes(response?.status)&&attempt<2){
     const retry=Number(response.headers?.get?.('Retry-After'));
     await pause(Number.isFinite(retry)&&retry>0?Math.min(retry,30)*1000:(attempt+1)*1000,signal);continue;
    }
    fail('SCB svarade HTTP '+(response?.status??'okänd status')+'. Inga nya data aktiverades.');
   }
   if(new TextEncoder().encode(raw).length>50*1024*1024)fail('SCB-svaret överstiger 50 MiB.');
   checkAbort();let data;try{data=JSON.parse(raw.replace(/^\uFEFF/,''));}catch{fail('SCB-svaret var inte giltig JSON. Inga nya data aktiverades.');}
   entries.push({id,url,method:'GET',fetchedAt,attempts,status:'downloaded',bytes:new TextEncoder().encode(raw).length,sha256:await digest(raw),rawResponse:raw,activatedInApp:true});
   completed++;onProgress({completed,total,table:table.id,field:table.field,phase,message:table.id+': '+completed+' av '+total+' svar hämtade'});
   return data;
  }
  for(const table of TABLES){
   const metadataUrl=BASE+'/tables/'+table.id+'/metadata?lang=sv',metadata=await collect(table.field+'_metadata',metadataUrl,table,'metadata'),selections=[];
   for(let offset=0;offset<expected.length;offset+=25){
    checkAbort();const regions=expected.slice(offset,offset+25),selected=selection(metadata,table,regions,year),units=unitReceipt(metadata,table,selected),url=queryUrl(table,selected),part=String(offset/25).padStart(2,'0');
    const data=await collect(table.field+'_data_'+part,url,table,'data');unitReceipt(data,table,selected);
    const rows=flatten(data,selected),rk=Object.keys(selected).find(key=>['region','deso'].includes(slug(key))||slug(metadata.dimension[key]?.label)==='region'),totals={};
    for(const row of rows)totals[row[rk]]=(totals[row[rk]]||0)+row.value;
    if(!same(Object.keys(totals),regions))fail('Saknade eller oväntade DeSO-koder i SCB-deluttaget.');
    for(const [code,value]of Object.entries(totals)){if(Object.hasOwn(merged[code],table.field))fail('Dubbelt DeSO-värde: '+code+'.');merged[code][table.field]=value;}
    selections.push({table:table.id,selection:clone(selected),nullMeaning:'Dimensionen utelämnas endast om officiell metadata anger elimination=true för en total.',url,units});
   }
   receipts.push({table:table.id,field:table.field,page:'https://www.statistikdatabasen.scb.se/pxweb/sv/ssd/'+table.path+'/',metadataUrl,referenceYear:year,updated:metadata.updated??null,statusSelection:table.status,selections,definition:table.field==='bil'?'I trafik, registrerade på folkbokförda personer 31 december. Privatleasing och enskild firma ingår; förmånsbilar ingår inte.':'SCB:s registerstatistik 31 december. Explicit total eller disjunkt könspartition.'});
  }
  checkAbort();
  for(const row of Object.values(merged)){
   if(!['hh','bef','bil'].every(k=>finiteCount(row[k])))fail('Ofullständig registerrad för '+row.kod+'.');
   if(row.hh===0&&row.bil>0)fail('Bilar med noll hushåll kräver separat metodbedömning: '+row.kod+'. Befintliga data har behållits.');
  }
  const next=clone(project),stamp=new Date().toISOString();
  next.d=project.d.map(old=>{
   const row={...clone(old),...merged[old.kod],status:'observed_register',bilStatus:'observed_register',hhStatus:'observed_register',befStatus:'observed_register',bphStatus:'derived_descriptor',dataYear:2024};row.bph=row.hh?row.bil/row.hh:0;row.bphR=row.bph;
   for(const key of ['proxyResidentialKm','proxyWeight','vkm','bphL','bphH','bph5','bph95','kmL','kmH','km5','km95'])delete row[key];
   row.provenance={hh:'TAB6568',bil:'TAB6589: i trafik',bef:'TAB6574',referenceYear:2024,geography:'DeSO 2025',fetchedAt:stamp};return row;
  });
  next.households=next.d;
  const cityTotals={};for(const row of next.d){const c=cityTotals[row.kk]??={hh:0,bef:0,bil:0};for(const k of ['hh','bef','bil'])c[k]+=row[k];}
  next.metadata={...next.metadata,dataYear:2024,desoVersion:'2025',dataStatus:'observed_register',fieldStatuses:{bil:'observed_register',hh:'observed_register',bef:'observed_register',km:'transferred_assumption'},sourceReceipts:receipts,municipalTotals:cityTotals,cityBaselines:cityTotals,spatialProxy:null,distributionMethod:'SCB registertal per DeSO 2025; ingen geografisk proxyfördelning.',registerFetchedAt:stamp,
   notes:['Hushåll, registrerade personbilar i trafik och folkmängd har hämtats som kompletta SCB-uttag per DeSO 2025 för 2024.','Körsträckan är fortsatt ett överfört riksgenomsnitt eller användarens val. Registerhämtningen ändrar varken körsträcka eller fordonsmix.','Privatleasing och enskild firma ingår i bilregistret; förmånsbilar via arbetsgivare ingår inte. Körsträckans målpopulation och årsslutsstockens population är inte identiska.'],
   registerImport:{schemaVersion:1,modelVersion:VERSION,createdAt:stamp,complete:true,activatedInApp:true,dataYear:2024,desoVersion:'2025',rows:348,requests:entries}};
  delete next.lastResult;delete next.evidence;
  H.validate(next,next.config||{});
  checkAbort();onProgress({completed,total,phase:'validated',message:'Samtliga 348 DeSO är validerade. Registerunderlaget kan aktiveras.'});
  return next;
 }
 return {VERSION,TABLES,fetch:fetchRegister,codes,totalCodes,selection,queryUrl,flatten,expectedCodes,unitReceipt};
});
