'use strict';
/* Offline fixtures exercise actual browser-import selection, atomicity and counts. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const R=require('../kallkod/source/register.js'),V=require('../kallkod/source/core.js'),vm=require('node:vm');
const raw=JSON.parse(require('node:zlib').gunzipSync(fs.readFileSync(path.join(__dirname,'../underlag/raw/scb_deso_2025.geojson.gz'))).toString('utf8'));
const areas=raw.features.map(f=>({...f.properties,geometry:f.geometry}));
for(const city of ['1280','1283','2180'])for(const id of new Set(areas.filter(a=>a.city===city).map(a=>a.regso)))areas.push({id,city,level:'district',version:'2025'});
const project={schema:'vagvis-1',model:'household',title:'Fiktivt API-test',metadata:{desoVersion:'2025',dataYear:2024,dataStatus:'constructed_scenario',spatialProxy:{status:'spatial_model_assumption'}},areas,d:areas.filter(a=>a.level==='deso').map(a=>({kod:a.id,kk:a.city,sd:a.regso,hh:2,bil:1,bef:3,km:999,status:'spatial_model_assumption',proxyWeight:.01})),config:V.config()};
const allCodes=project.d.map(r=>r.kod).sort(),dim=(label,labels,extra={})=>({label,category:{index:Object.fromEntries(Object.keys(labels).map((x,i)=>[x,i])),label:labels},...extra});
function metadata(table){
 const dimension={Region:dim('Region',Object.fromEntries(allCodes.map(k=>[k,k]))),Tid:dim('År',{'2023':'2023','2024':'2024'}),ContentsCode:dim('Antal',{'COUNT':'Antal'})};
 dimension.ContentsCode.category.unit={COUNT:{base:'antal',decimals:0}};
 if(table.field==='bil')dimension.Status=dim('Status',{'PARKED':'avställda','ACTIVE':'i trafik'});
 if(table.field==='hh')dimension.Hushallstyp=dim('hushållstyp',{'ONE':'Ensamstående','TWO':'Sammanboende'},{extension:{elimination:true}});
 if(table.field==='bef'){dimension.Alder=dim('Ålder',{'ALL':'Alla åldrar','0':'0 år'});dimension.Kon=dim('Kön',{'K':'kvinnor','M':'män'});}
 return {class:'dataset',id:Object.keys(dimension),dimension,role:{time:['Tid']},updated:'2026-04-02'};
}
function dataset(table,url,options){
 const params=new URL(url).searchParams,meta=metadata(table),selected={};
 for(const [key,value]of params)if(key.startsWith('valueCodes['))selected[key.slice(11,-1)]=value.split(',');
 // Return in a different order to catch flat-position assumptions.
 const ids=Object.keys(selected).reverse(),sizes=ids.map(k=>selected[k].length),dimension={};
 for(const key of ids){dimension[key]=dim(meta.dimension[key].label,Object.fromEntries(selected[key].map(x=>[x,meta.dimension[key].category.label[x]])));if(key==='ContentsCode')dimension[key].category.unit={COUNT:{base:options.badUnit?'km':'antal',decimals:0}};}
 const n=sizes.reduce((a,b)=>a*b,1),base=table.field==='hh'?10:table.field==='bil'?8:20,value=Array(n).fill(base),data={class:'dataset',id:ids,size:sizes,dimension,value};
 if(options.missing&&table.field==='bil')data.value[0]=null;
 if(options.badStatus&&table.field==='bil')data.status={'0':':'};
 if(options.zeroHouseholds&&table.field==='hh')data.value[0]=0;
 if(options.badYear)dimension.Tid=dim('År',{'2023':'2023'});
 return data;
}
function fakeFetch(options={}){
 let requests=0;const urls=[];
 const fetchImpl=async url=>{
  requests++;urls.push(url);if(options.denyAt===requests)return {ok:false,status:403,text:async()=>''};
  if(options.networkAt===requests)throw new TypeError('Failed to fetch');
  const table=R.TABLES.find(t=>url.includes('/'+t.id+'/'));
  assert(table,'only fixed official tables requested');
  const data=url.includes('/metadata?')?metadata(table):dataset(table,url,options);
  return {ok:true,status:200,text:async()=>JSON.stringify(data)};
 };
 return {fetchImpl,urls,get requests(){return requests;}};
}
async function main(){
 const original=JSON.stringify(project),mock=fakeFetch(),progress=[];
 const next=await R.fetch(project,{fetchImpl:mock.fetchImpl,onProgress:p=>progress.push(p)});
 assert.equal(mock.requests,45);assert.equal(progress.at(-1).phase,'validated');assert.equal(progress.at(-1).completed,45);
 assert.equal(next.metadata.dataStatus,'observed_register');assert.equal(next.d.length,348);assert.equal(next.households,next.d);assert.equal(next.metadata.registerImport.requests.length,45);assert.equal(next.metadata.sourceReceipts.length,3);assert.equal(next.metadata.spatialProxy,null);
 assert(next.d.every(r=>r.hh===10&&r.bil===8&&r.bef===40&&r.bph===.8&&r.status==='observed_register'&&!Object.hasOwn(r,'proxyWeight')));
 assert.equal(next.config.household,undefined,'import does not fabricate household distance or fleet config');
 assert.equal(next.d[0].km,999,'unused row distance is preserved and not substituted by SCB counts');
 assert(mock.urls.some(x=>x.includes('valueCodes%5BStatus%5D=ACTIVE')));
 assert(!mock.urls.some(x=>x.includes('Hushallstyp%5D')),'elimination total must be omitted, not guessed');
 assert.equal(JSON.stringify(project),original,'success never mutates input');
 for(const options of [{missing:true},{badStatus:true},{zeroHouseholds:true},{badUnit:true},{badYear:true},{denyAt:3},{networkAt:2}]){
  const m=fakeFetch(options);await assert.rejects(R.fetch(project,{fetchImpl:m.fetchImpl}));assert.equal(JSON.stringify(project),original,'failure never mutates active input');
 }
 const controller=new AbortController();controller.abort();await assert.rejects(R.fetch(project,{fetchImpl:mock.fetchImpl,signal:controller.signal}),{name:'AbortError'});
 const ambiguous=dim('Okänd',{'1':'Del 1','2':'Del 2'});assert.throws(()=>R.totalCodes(ambiguous),/Ingen entydig/);
 assert.throws(()=>R.selection(metadata(R.TABLES[1]),R.TABLES[1],['9999C0000']),/Alla begärda/);
 assert.throws(()=>R.expectedCodes({...project,d:project.d.slice(1)}),/Hushållsraderna/);
 const browser=vm.createContext({AbortController,URLSearchParams,TextEncoder,setTimeout,clearTimeout,console});
 for(const name of ['core.js','scenarios.js','households.js','register.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../kallkod/source',name),'utf8'),browser,{filename:name});
 assert.equal(browser.VagvisRegister.VERSION,'2.2.5');assert.equal(browser.VagvisHouseholds.VERSION,'2.2.5');
 const browserMock=fakeFetch(),browserResult=await browser.VagvisRegister.fetch(project,{fetchImpl:browserMock.fetchImpl});
 assert.equal(browserMock.requests,45);assert.equal(browserResult.d[0].bil,8);assert.equal(browserResult.metadata.dataStatus,'observed_register');
 const wrongConfig=structuredClone(project);wrongConfig.config.year=2023;
 await assert.rejects(browser.VagvisRegister.fetch(wrongConfig,{fetchImpl:fakeFetch().fetchImpl}),/skiljer sig från beräkningsåret/,'real browser H.validate must reject a config-year mismatch');
 assert.equal(JSON.stringify(project),original);
 console.log('Register import fixtures passed:45requests,348complete rows, elimination and sex partition, data/unit/year/status guards, CORS/HTTP/cancel, atomic success/failure.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
