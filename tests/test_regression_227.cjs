/* Numerical regression against the user-supplied, unchanged Vägvis 2.2.7 source.
   The fixture records original numerical output, not source-code similarity. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),V=require('../kallkod/source/core.js'),H=require('../kallkod/source/households.js');
const json=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const golden=json('tests/fixtures/legacy_227.json'),areas=json('kallkod/data/omraden.json');
const projects={territorial:V.unpackProject(json('kallkod/data/project.json'),areas),household:V.unpackProject(json('kallkod/data/household-project.json'),areas)};
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function payload(m){return [...m].sort(([a],[b])=>a.localeCompare(b)).map(([k,r])=>[k,r===null?null:Object.fromEntries(golden.numericKeys.filter(key=>Object.hasOwn(r,key)).map(key=>[key,r[key]]))]);}
function cfg(p,patch){return {...p.config,...patch,household:{...p.config?.household,...patch.household}};}
(async()=>{
 const checks=[];
 for(const x of golden.cases){
  const p=projects[x.model],c=cfg(p,x.patch),d=x.model==='household'?H.deterministic(p,c):V.deterministic(p,c),bm=x.model==='household'?d.baseMap:d.base.agg,sm=x.model==='household'?d.scenarioMap:d.scenario.agg;
  assert.equal(digest(payload(bm)),x.baseDigest,x.id+' baseline differs from original 2.2.7');
  assert.equal(digest(payload(sm)),x.scenarioDigest,x.id+' scenario differs from original 2.2.7');
  checks.push(x.id+' exact central values for all areas and numerical components');
  if(x.monteCarlo){
   const mc=x.monteCarlo,r=await H.simulate(p,{...c,iterations:mc.iterations,seed:mc.seed});
   const value=[...r.draws].sort(([a],[b])=>a.localeCompare(b)).map(([key,row])=>[key,Object.fromEntries(Object.entries(row).map(([k,a])=>[k,Array.from(a)]))]);
   assert.equal(digest(value),mc.drawsDigest,x.id+' seeded Monte Carlo differs from original 2.2.7');
   checks.push(x.id+' exact fixed-seed '+mc.iterations+' Monte Carlo draws, every area');
  }
  console.log('OK '+x.id);
 }
 fs.mkdirSync(path.join(root,'testresultat'),{recursive:true});fs.writeFileSync(path.join(root,'testresultat/regression_227.json'),JSON.stringify({version:V.VERSION,executedAt:new Date().toISOString(),runtime:process.version,sourceVersion:golden.sourceVersion,sourceArchiveSHA256:golden.sourceArchiveSHA256,passed:checks.length,checks,scope:'Numerical regression only; no browser or visual verification.'},null,2)+'\n');
 console.log(checks.length+' numerical regressions passed.');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
