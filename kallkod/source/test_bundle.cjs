/* Browser-global bootstrap and event smoke checks with a minimal DOM shim.
   This is not a browser layout, browser compatibility or network test. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../Vagvis_2.0.html'),'utf8'),elements=new Map(),events={},blobs=[];
const urls=new Map();let urlSequence=0;
const ctx2d=new Proxy({},{get:()=>()=>{},set:()=>true});
class Element{
 constructor(id=''){this.id=id;this.dataset={};this.style={};this.disabled=false;this.hidden=false;this.className='';this.classList={toggle(){}};this.value='';this.clientWidth=450;this.events={};}
 set innerHTML(s){this._html=s;for(const m of s.matchAll(/\bid="([^"]+)"/g))if(!elements.has(m[1]))elements.set(m[1],new Element(m[1]));}
 get innerHTML(){return this._html||'';}
 addEventListener(name,fn){this.events[name]=fn;}
 getContext(){return ctx2d;}
 setAttribute(k,v){this[k]=v;}
 showModal(){this.open=true;}
 close(){this.open=false;}
 click(){}
}
for(const m of html.matchAll(/\bid="([^"]+)"/g))elements.set(m[1],new Element(m[1]));
for(const m of html.matchAll(/<script(?: id="([^"]+)")?(?: type="([^"]+)")?>([\s\S]*?)<\/script>/g))if(m[1])elements.get(m[1]).textContent=m[3];
const navs=['overview','map','parameters','data','method'].map(v=>{const e=new Element();e.dataset.view=v;return e;});
const document={getElementById:id=>elements.get(id)||null,createElement:()=>new Element(),querySelectorAll:s=>s==='.nav'?navs:[],addEventListener:(k,v)=>events[k]=v};
const sandbox={document,console,setTimeout,clearTimeout,Blob,URL:{createObjectURL:b=>{blobs.push(b);const url='blob:test'+(++urlSequence);urls.set(url,b);return url},revokeObjectURL:url=>urls.delete(url)},Intl,Float64Array,Map,Set,Math,Date,Number,String,JSON,Promise,AbortController,URLSearchParams};
sandbox.window=sandbox;sandbox.devicePixelRatio=1;sandbox.addEventListener=()=>{};sandbox.print=()=>{};
if(process.env.VAGVIS_TEST_WORKER==='1')sandbox.Worker=class {
 constructor(url){this.blob=urls.get(url);this.dead=false;}
 postMessage(data){(async()=>{try{const ctx={console,setTimeout,clearTimeout,Float64Array,Map,Set,Math,Date,Number,String,JSON,Promise};ctx.self=ctx;ctx.postMessage=d=>{if(!this.dead)this.onmessage?.({data:d});};vm.runInContext(await this.blob.text(),vm.createContext(ctx));await ctx.onmessage({data:structuredClone(data)});}catch(e){this.onerror?.({message:e.message});}})();}
 terminate(){this.dead=true;}
};
const context=vm.createContext(sandbox);
for(const m of html.matchAll(/<script(?: id="([^"]+)")?(?: type="([^"]+)")?>([\s\S]*?)<\/script>/g))if(m[2]!=='application/json'&&m[1]!=='leaflet-script')vm.runInContext(m[3],context);
const wait=async()=>{for(let i=0;i<2000;i++){if(sandbox.VagvisApp.getResult())return;await new Promise(r=>setTimeout(r,10));}throw Error('Bootstrap timed out');};
function click(id){events.click({preventDefault(){},target:{closest:s=>s==='button'?{id}:null}});}
function nav(v){events.click({preventDefault(){},target:{closest:s=>s==='[data-view],[data-go]'?{dataset:{view:v}}:null}});}
(async()=>{
 await wait();assert.ok(sandbox.VagvisApp.getResult().results.some(x=>x.id==='1280'&&x.central));assert.ok(elements.get('view').innerHTML.includes('268'));console.log('OK bundled browser-global startup and calculation');
 for(const v of ['map','parameters','data','method','overview']){nav(v);assert.ok(elements.get('view').innerHTML.length>500);}console.log('OK all five navigation views render strings without runtime exceptions');
 nav('parameters');elements.get('view').events.input({target:{dataset:{range:'trafficChange'},value:'-20'}});assert.equal(sandbox.VagvisApp.getConfig().trafficChange,-.2);assert.equal(elements.get('export').disabled,true);await sandbox.VagvisApp.run();const c=sandbox.VagvisApp.getResult().results.find(x=>x.id==='1280'&&x.level==='city');assert.ok(Math.abs(c.scenarioCentral.total/c.central.total-.8)<1e-10);console.log('OK scenario input, dirty state and paired recalculation');
 click('download-csv');assert.ok((await blobs.at(-1).text()).includes('bas_P2_5'));click('download-audit');const saved=JSON.parse(await blobs.at(-1).text());assert.equal(saved.schema,'vagvis-1');assert.equal(saved.config.trafficChange,-.2);assert.ok(saved.sources.length>10);assert.ok(saved.lastResult.results.length>0);console.log('OK CSV and complete project exports contain computed results and provenance');
 nav('data');click('load-demo');await wait();assert.equal(sandbox.VagvisApp.getProject().isDemo,true);nav('map');assert.ok(elements.get('map-svg').innerHTML.includes('<path'));console.log('OK explicitly fictional demo and vector map generation');
 assert.ok(!/<script[^>]+src=|<link[^>]+href=|<img[^>]+src=/.test(html));assert.ok(!html.includes('/*__PROJECT__*/'));assert.equal(html,fs.readFileSync(path.join(__dirname,'../Netlify/index.html'),'utf8'));console.log('OK no automatic external code/assets; Netlify and offline files identical');
 sandbox.VagvisApp.switchModel('household');await wait();assert.equal(sandbox.VagvisApp.getModel(),'household');assert.equal(sandbox.VagvisApp.getConfig().year,2023);assert.equal(sandbox.VagvisApp.getProject().households.length,326);const hr=sandbox.VagvisApp.getResult(),m=hr.results.find(x=>x.level==='city'&&x.id==='1280');assert.ok(m.central.total>m.central.direct&&m.central.direct>0);assert.ok(hr.v7interval&&hr.v7interval['2180'].p5>0);assert.ok(elements.get('view').innerHTML.includes('samma beräkning som Bilmodell v7'));assert.ok(elements.get('city').innerHTML.includes('data-city="2180"'));console.log('OK switch to household model, 2018 geography and 2023 source data');
 for(const v of ['map','parameters','data','method','overview']){nav(v);assert.ok(elements.get('view').innerHTML.length>500);}console.log('OK all five household navigation views render');
 nav('measures');assert.ok(elements.get('view').innerHTML.includes('Mobilitetsåtgärder'));elements.get('view').events.input({target:{dataset:{mpackage:'1'},value:'stad_ivl'}});assert.equal(sandbox.VagvisApp.getConfig().household.measures.packageId,'stad_ivl');assert.ok(elements.get('view').innerHTML.includes('Åtgärdernas effekt'));await sandbox.VagvisApp.run();const hm=sandbox.VagvisApp.getResult().results.find(x=>x.key==='city|1280');assert.ok(hm.scenarioCentral.direct<hm.central.direct);elements.get('view').events.input({target:{dataset:{mpackage:'1'},value:'inga'}});await sandbox.VagvisApp.run();
 nav('control');for(let i=0;i<1500&&!elements.get('view').innerHTML.includes('kk-rows');i++)await new Promise(r=>setTimeout(r,20));assert.ok(elements.get('view').innerHTML.includes('32 kontroller'));console.log('OK measures and reference check views (Bilmodell v7 code) render and change only the scenario');
 nav('map');assert.ok(elements.get('map-svg').innerHTML.includes('clip-path'));click('download-csv');assert.ok((await blobs.at(-1).text()).includes('direkt_tCO2_som_bilmodell_v7'));nav('data');click('download-household-data');assert.equal(JSON.parse(await blobs.at(-1).text()).households.length,326);console.log('OK coastal clipping markup and household exports');
 sandbox.VagvisApp.switchModel('territorial');assert.equal(sandbox.VagvisApp.getProject().isDemo,true);assert.equal(sandbox.VagvisApp.getConfig().trafficChange,-.2);sandbox.VagvisApp.switchModel('household');assert.equal(sandbox.VagvisApp.getConfig().trafficChange,0);console.log('OK switching retains independent project data, assumptions and results');
 console.log('10 bundle smoke checks passed (worker mode '+(process.env.VAGVIS_TEST_WORKER==='1')+'). No real browser layout or live download check.');
})().catch(e=>{console.error(e);process.exitCode=1;});
