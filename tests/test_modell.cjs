'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),json=p=>JSON.parse(read(p));
const V=require('../kallkod/source/core.js'),H=require('../kallkod/source/households.js'),E=require('../kallkod/source/evidence.js').create(json('underlag/evidensregister.json'));
const b=json('kallkod/data/household-project.json'),p=json('kallkod/data/project.json'),c=V.config(b.config),manifest=json('underlag/versionsunderlag.json');
let count=0;
function check(name,fn){fn();count++;console.log('OK '+name);}
function close(a,b,t=1e-10){assert.ok(Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),a+' != '+b);}
function sha(s){return crypto.createHash('sha256').update(s).digest('hex');}
const html=read('app/Vagvis.html'),grab=id=>JSON.parse(html.match(new RegExp('<script id="'+id+'" type="application/json">([\\s\\S]*?)</script>'))[1]);
const start=grab('embedded-result');
check('A och B behåller geografiska och numeriska underlag från 2.0.8',()=>{
  assert.equal(p.areas.filter(x=>x.level==='deso').length,348);
  assert.equal(b.households.length,326);
  assert.equal(sha(read('kallkod/source/households.js')),manifest.baselineModules['households.js']);
  for(const n of ['v7-atgarder.js','v7-osakerhet.js','v7-mc.js','v7-berakning.js'])assert.equal(sha(read('kallkod/source/'+n)),manifest.baselineModules[n]);
  for(const n of ['maps.js','network.js'])assert.equal(sha(read('kallkod/source/'+n)),manifest.baselineModules[n]);
  assert.equal(sha(read('kallkod/source/style.css').split('\n/* 2.0.9:')[0]),manifest.baselineStyleSha256);
  assert.equal(sha(read('kallkod/source/core.js').replace("VERSION='2.0.9'","VERSION='2.0.8'")),manifest.baselineModules['core.js']);
});
check('Förberäknat A-resultat har giltig identitet och bibehållen kommunreferens',()=>{
  assert.equal(start.version,'2.0.9');assert.equal(start.fingerprint,V.fingerprint(p,V.config(grab('embedded-config'))));
  assert.equal(start.results.filter(x=>x.level==='city').length,3);
  close(start.results.find(x=>x.key==='city|1280').central.ttw,268300,1e-3);
});
const d=H.deterministic(b,c),expected={'1280':279250.8336094443,'1283':159691.08480453037,'2180':116895.15738965574};
check('B:s kommunresultat matchar den reproducerade granskningen',()=>{
  for(const city of b.cities)close(d.base.get('city|'+city.id).total,expected[city.id]);
});
check('Alla DeSO och stadsdelsområden summerar till B:s kommunresultat',()=>{
  for(const city of b.cities)for(const level of ['deso','district']){
    const sum=[...d.base].filter(([k])=>k.startsWith(level+'|'+city.id+'|')).reduce((s,[k,x])=>s+x.total,0);
    close(sum,d.base.get('city|'+city.id).total);
  }
});
check('B skiljer TTW, elproduktion och full schablonlivscykel utan dubbelräkning',()=>{
  for(const city of b.cities){const x=d.base.get('city|'+city.id);close(x.direct,x.ttw+x.electricity);close(x.total,x.direct+x.fuelUpstream+x.vehicle+x.battery+x.maintenance+x.endoflife);close(x.net,x.total-x.credit);}
});
check('Källregistret följer aktuella inställningar och ändrar inte beräkningen',()=>{
  const before=JSON.stringify(c),alt=V.config({...c,household:{...c.household,efIce:.18}});
  assert.equal(E.parameters(c,b).find(x=>x.id==='B_efIce').activeValue,.15);
  assert.equal(E.parameters(alt,b).find(x=>x.id==='B_efIce').activeValue,.18);
  E.render(c,b);E.receipt(c,b);assert.equal(JSON.stringify(c),before);
  for(const r of E.parameters(c,b))assert.notEqual(r.activeValue,undefined,'Utan aktivt värde: '+r.id);
});
check('Registerpåslag och avståndsexponent beskrivs som modellbedömningar',()=>{
  const ps=E.parameters(c,b),phi=ps.find(x=>x.id==='B_PHI'),eps=ps.find(x=>x.id==='B_EPS');
  close(phi.activeValue,1.05,1e-5);for(const s of eps.activeValue)close(s,.1,1e-3);
  assert.equal(phi.effectiveStatus,'model_assumption');assert.equal(eps.effectiveStatus,'model_assumption');
});
check('Alla fjorton åtgärder redovisas som bedömda scenarioeffekter',()=>{
  const r=E.receipt(c,b);assert.equal(r.actions.length,14);assert.ok(r.actions.every(x=>x.status==='scenario_assumption'));assert.equal(r.release.newEmpiricalFit,false);assert.ok(Object.keys(r.actionReferences).length>10);
});
check('Saknade registerfält i importerade hushållsdata får inte falsk källstatus',()=>{
  const imported=V.clone(b);for(const r of imported.households)delete r.bil;
  const x=E.parameters(c,imported).find(x=>x.id==='B_PHI');assert.equal(x.effectiveStatus,'unverified_import');assert.equal(x.activeValue,null);
});
check('Gränssnittets befintliga vyer, kartor och export har bevarats',()=>{
  for(const x of ['overview','map','calc','parameters','measures','control','data','method'])assert.ok(html.includes('data-view="'+x+'"'));
  for(const x of ['run','export','download-csv','download-audit','download-offline','method-footer'])assert.ok(html.includes('id="'+x+'"'));
  assert.ok(html.includes('tile.openstreetmap.org'));assert.ok(html.includes('p.evidence=window.VagvisEvidence.receipt'));
  assert.ok(!/\{\{[^}]+\}\}/.test(html));
});
check('MVDT till ÅDT kräver källa och osäkerhet även i uppdateringen',()=>{
  const feature={type:'Feature',geometry:{type:'LineString',coordinates:[[13,55.6],[13.01,55.6]]},properties:{id:'test',city:'1280',flowMetric:'MVD',flow:1000,year:2024,flowDirection:'both',geometryDirection:'both',countBasis:'geometry',source:'Fiktivt test'}};
  assert.throws(()=>V.normalizeRoads({type:'FeatureCollection',features:[feature]},'1280',2024),/MVD/);
  feature.properties.mvdToAadtFactor=.9;feature.properties.conversionSource='Fiktiv dokumenterad profil';feature.properties.conversionCV=.1;
  close(V.normalizeRoads({type:'FeatureCollection',features:[feature]},'1280',2024)[0].aadt,900);
});
check('Alla levererade beräkningsskript kan parsas',()=>{
  for(const f of fs.readdirSync(path.join(root,'kallkod/source')).filter(f=>f.endsWith('.js')))new vm.Script(read('kallkod/source/'+f),{filename:f});
  for(const [all,attrs,body] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g))if(!attrs.includes('application/json'))new vm.Script(body);
});
(async()=>{
 const old={console,setTimeout,Promise,Float64Array,Math,Date};old.window=old;old.globalThis=old;vm.createContext(old);
 for(const f of ['core.js','v7-atgarder.js','v7-osakerhet.js','v7-mc.js','households.js'])vm.runInContext(read('kallkod/source/'+f).replace("VERSION='2.0.9'","VERSION='2.0.8'"),old);
 const oldr=await old.VagvisHouseholds.simulate(b,{...c,iterations:100,seed:42});
 const current={console,setTimeout,Promise,Float64Array,Math,Date};current.window=current;current.globalThis=current;vm.createContext(current);
 for(const f of ['core.js','v7-atgarder.js','v7-osakerhet.js','v7-mc.js','households.js'])vm.runInContext(read('kallkod/source/'+f),current);
 const newr=await current.VagvisHouseholds.simulate(b,{...c,iterations:100,seed:42});
 check('Monte Carlo ger samma dragningar som 2.0.8 med samma indata och frö',()=>{
   for(const key of oldr.draws.keys())for(let i=0;i<100;i++)assert.equal(newr.draws.get(key).base[i],oldr.draws.get(key).base[i]);
   assert.ok(newr.maxClosureError<1e-6);
 });
 const report={passed:count,failed:0,modelVersion:V.VERSION,baselineVersion:'2.0.8',checks:'Numerisk regression, Monte Carlo, geografi, källstatus, exportkoppling och skriptparsning. Ingen körning av Streamlit-server eller grafisk webbläsare i denna miljö.'};
 fs.writeFileSync(path.join(root,'dokument/Testresultat_modell.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;});
