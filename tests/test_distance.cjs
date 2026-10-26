/* Optional DeSO-distance allocation: conservation, bounded factors, missing data,
   explicit model status and scenario behaviour. No synthetic values enter the app. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),V=require('../kallkod/source/core.js'),H=require('../kallkod/source/households.js'),D=require('../kallkod/source/distance.js');
const clone=x=>JSON.parse(JSON.stringify(x)),near=(a,b,label,rel=1e-10)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=rel*Math.max(1,Math.abs(b)),label+': '+a+' != '+b),reports=[];
async function check(name,fn){await fn();reports.push(name);console.log('OK '+name);}
function project(){return {model:'household',metadata:{dataYear:2024,desoVersion:'2025',dataStatus:'observed_register'},d:[
 {kod:'1280C1000',kk:'1280',sd:'1280R1',hh:100,bef:200,bil:100,km:10000,kmStatus:'derived_official',dataYear:2024},
 {kod:'1280C1010',kk:'1280',sd:'1280R2',hh:50,bef:100,bil:50,km:10000,kmStatus:'derived_official',dataYear:2024},
 {kod:'1280C1020',kk:'1280',sd:'1280R2',hh:10,bef:20,bil:0,km:10000,kmStatus:'derived_official',dataYear:2024}
 ],distanceData:{schema:'vagvis-distance-indicators-1',version:'2.3.0',dataYear:2024,desoVersion:'2025',rows:[
 {kod:'1280C1000',kk:'1280',centreKm:.2,transitKm:.1,serviceKm:.1,income:250},
 {kod:'1280C1010',kk:'1280',centreKm:15,transitKm:2,serviceKm:3,income:350},
 {kod:'1280C1020',kk:'1280',centreKm:30,transitKm:4,serviceKm:5,income:null}
 ]}};}
function config(extra={}){return H.config({iterations:100,household:{kmMode:'deso_estimate',...extra}});}
(async()=>{
 await check('Default mode and chosen coefficients are explicit, no DeSO mode is auto-enabled',()=>{
  assert.equal(H.DEFAULTS.kmMode,'local');assert.equal(D.VERSION,'2.3.0');assert.equal(D.DEFAULTS.coefficients.bph,0);
  assert.deepEqual(Object.keys(D.DEFAULTS.coefficients).sort(),['bph','centre','income','service','transit']);
  const c=config();assert.equal(c.household.distanceModel.residualCV,.35);
 });
 await check('Browser UMD exports the same DeSO allocation as CommonJS',()=>{
  const browser={};vm.runInNewContext(fs.readFileSync(path.join(root,'kallkod/source/distance.js'),'utf8'),browser);
  assert.equal(browser.VagvisDistance.VERSION,D.VERSION);
  assert.equal(JSON.stringify(browser.VagvisDistance.estimate(project(),config())),JSON.stringify(D.estimate(project(),config())));
 });
 await check('Selected DeSO allocation varies within a city and preserves registered cars and city Vkm',()=>{
  const p=project(),before=JSON.stringify(p),c=config(),d=H.deterministic(p,c),rows=d.prep.distanceEstimate.rows,old=H.deterministic(p,{...c,household:{kmMode:'local'}});
  assert.ok(rows[0].kmPerCar<rows[1].kmPerCar);assert.ok(rows.every(r=>r.status==='model_estimate'));
  near(rows.reduce((s,r)=>s+r.vkm,0),1500000,'target Vkm');
  near(d.baseMap.get('city|1280').vkm,old.baseMap.get('city|1280').vkm,'same city Vkm');
  near(d.baseMap.get('city|1280').total,old.baseMap.get('city|1280').total,'same city emissions');
  assert.equal(JSON.stringify(p),before,'caller project must not be mutated');
  const explanation=H.explain(p,c,'deso|1280|1280C1000').rows[0];
  near(explanation.kmPerCar,rows[0].kmPerCar,'explanation');assert.equal(explanation.kmLevel,'skattad DeSO');
  assert.equal(explanation.distanceEstimate.status,'model_estimate');
  assert.throws(()=>H.kmOf(p.d[0],c),/förberedda/,'raw rows cannot silently get national fallback');
 });
 await check('Bounds apply after normalization, including extreme coefficients and zero-car areas',()=>{
  const p=project();p.distanceData.rows[1].centreKm=1e6;
  const r=D.estimate(p,config({distanceModel:{coefficients:{centre:2,transit:2,service:2,income:2,bph:2},minFactor:.9,maxFactor:1.1}}));
  for(const row of r.rows)assert.ok(row.factor>=.9-1e-12&&row.factor<=1.1+1e-12);
  near(r.cities['1280'].estimatedVkm,r.cities['1280'].targetVkm,'bounded closure');
  for(const opts of [{minFactor:1},{maxFactor:1}])assert.ok(D.estimate(p,config({distanceModel:opts})).rows.every(row=>row.factor===1));
 });
 await check('Missing indicators are null/neutral, never fabricated; complete absence gives baseline',()=>{
  const p=project();p.distanceData.rows=p.distanceData.rows.map(row=>({kod:row.kod,kk:row.kk,centreKm:null,transitKm:null,serviceKm:null,income:null}));
  const r=D.estimate(p,config());assert.ok(r.rows.every(row=>row.factor===1));
  for(const row of r.rows)for(const key of ['centre','transit','service','income']){assert.equal(row.features[key],null);assert.equal(row.components[key].contribution,0);assert.equal(row.coverage[key],false);}
  assert.ok(r.warnings.some(w=>w.includes('underlag saknas')));
  delete p.distanceData;const empty=D.estimate(p,config());assert.ok(empty.rows.every(row=>row.factor===1));assert.ok(empty.warnings.some(w=>w.includes('Inga externa')));
 });
 await check('Observed household ratio is recalculated after edits rather than stale indicator bph',()=>{
  const p=project();p.distanceData.rows.forEach(row=>row.bph=999);
  const c=config({distanceModel:{coefficients:{centre:0,transit:0,service:0,income:0,bph:.3}}}),r=D.estimate(p,c);
  near(r.rows[0].features.bph,1,'observed ratio');near(r.rows[1].features.bph,1,'observed ratio');
  p.d[0].hh=200;const edited=D.estimate(p,c);assert.ok(edited.rows[0].kmPerCar<r.rows[0].kmPerCar);
  p.d[0].hh=0;p.d[0].hhStatus='spatial_model_assumption';assert.equal(H.prepare(p,c).distanceEstimate.rows[0].features.bph,null);
 });
 await check('Zero cars and zero anchor are finite and cannot create phantom traffic',()=>{
  const p=project();p.d.forEach(row=>row.bil=0);const r=D.estimate(p,config());
  assert.equal(r.cities['1280'].cars,0);assert.equal(r.cities['1280'].targetVkm,0);assert.ok(r.rows.every(row=>row.factor===1&&Number.isFinite(row.kmPerCar)&&row.vkm===0));
  p.d[0].bil=100;p.d.forEach(row=>row.km=0);assert.equal(H.deterministic(p,config()).baseMap.get('city|1280').vkm,0);
 });
 await check('Bad geography, data year, duplicate rows and invalid values fail explicitly',()=>{
  for(const mutate of [p=>p.distanceData.rows.push(clone(p.distanceData.rows[0])),p=>p.distanceData.rows[0].kk='2180',p=>p.distanceData.rows[0].kod='UNKNOWN',p=>p.distanceData.dataYear=2025,p=>p.distanceData.desoVersion='2018',p=>p.distanceData.rows[0].centreKm=-1,p=>p.distanceData.rows[0].income=0]){const p=project();mutate(p);assert.throws(()=>D.estimate(p,config()));}
  for(const dm of [{minFactor:1.1},{maxFactor:.9},{coefficients:{invented:.1}},{coefficients:{centre:3}},{residualCV:-1}])assert.throws(()=>config({distanceModel:dm}));
 });
 await check('Baseline allocation stays frozen through measures and new-household scenario',()=>{
  const p=project(),c=config();c.areaScenario={bilpool:{enabled:true,preset:'carsharing_pbl2015'}};
  c.exploitation={enabled:true,city:'1280',deso:p.d[0].kod,newHouseholds:20,carsPerHousehold:.5,kmPerCar:null};
  const r=H.deterministic(p,c),base=r.baseMap.get('city|1280'),after=r.scenarioMap.get('city|1280'),k=r.prep.rows[0].resolvedKm;
  near(base.vkm,1500000,'frozen baseline');near(after.vkm,(1500000+10*k)*.825,'measures apply once');near(after.cars,160*.7,'car measure once');
  near(r.baseMap.get('deso|1280|1280C1000').vkm,100*k,'baseline unchanged');
 });
 await check('New-mode MC normalizes P×K, preserves city activity and closes in every draw',async()=>{
  const p=project(),c=config();c.household.uncertainty.distanceLocal=0;c.household.uncertainty.carStock=0;
  for(const key of Object.keys(c.uncertainty))if(key!=='mixConcentration')c.uncertainty[key]=0;
  const d=H.deterministic(p,c),r=await H.simulate(p,c),city=r.draws.get('city|1280');
  const local=r.draws.get('deso|1280|1280C1000').base;assert.ok(Math.max(...local)>Math.min(...local));
  for(let i=0;i<c.iterations;i++){
   near(city.base[i],d.baseMap.get('city|1280').total,'fixed city draw '+i);
   for(const level of ['deso','district'])near([...r.draws].filter(([key])=>key.startsWith(level+'|1280|')).reduce((sum,[,row])=>sum+row.base[i],0),city.base[i],'draw closure '+level);
   assert.equal(city.difference[i],0);
  }
  assert.ok(r.maxClosureError<1e-8);
 });
 await check('Actual packaged indicators match all 348 DeSO and preserve all three city totals',()=>{
  const json=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8')),p=V.unpackProject(json('kallkod/data/household-project.json'),json('kallkod/data/omraden.json'));
  p.distanceData=json('kallkod/data/distance-indicators.json');assert.equal(p.distanceData.rows.length,348);
  const c={...p.config,household:{...p.config.household,kmMode:'deso_estimate'}},r=H.deterministic(p,c),old=H.deterministic(p,{...c,household:{...c.household,kmMode:'local'}});
  assert.equal(r.prep.distanceEstimate.rows.length,348);
  for(const city of ['1280','1283','2180']){
   const selected=r.prep.distanceEstimate.rows.filter(row=>row.kk===city);assert.ok(new Set(selected.map(row=>row.kmPerCar.toFixed(6))).size>1,'variation in '+city);
   near(r.baseMap.get('city|'+city).vkm,old.baseMap.get('city|'+city).vkm,'actual city Vkm '+city);
   near(r.baseMap.get('city|'+city).total,old.baseMap.get('city|'+city).total,'actual city LCA '+city);
  }
 });
 fs.mkdirSync(path.join(root,'testresultat'),{recursive:true});fs.writeFileSync(path.join(root,'testresultat/korstracka_deso.json'),JSON.stringify({version:D.VERSION,executedAt:new Date().toISOString(),runtime:process.version,passed:reports.length,checks:reports,scope:'Numerical/methodological tests, not empirical validation of DeSO mileage.'},null,2)+'\n');
 console.log(reports.length+' DeSO-distance checks passed.');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
