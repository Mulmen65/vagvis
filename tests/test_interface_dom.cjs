/* Executes the actual UI and engines with a minimal DOM fixture. This exercises
   logic and rendered HTML strings; it is NOT a browser or visual layout test. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),source=path.join(root,'kallkod/source'),json=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const V=require(path.join(source,'core.js')),H=require(path.join(source,'households.js')),S=require(path.join(source,'scenarios.js')),D=require(path.join(source,'distance.js')),E=require(path.join(source,'evidence.js')).create(json('underlag/evidensregister.json'));
const areas=json('kallkod/data/omraden.json'),a=V.unpackProject(json('kallkod/data/project.json'),areas),b=V.unpackProject(json('kallkod/data/household-project.json'),areas);
a.config.iterations=100;b.config.iterations=100;
const embedded={'embedded-omraden':areas,'embedded-project':a,'embedded-household-project':b,'embedded-config':{iterations:100},'embedded-mode':'household','embedded-result':null,'embedded-ytor':json('kallkod/data/ytor.json'),'distance-data':json('kallkod/data/distance-indicators.json')};
const nodes=new Map(),handlers={},errors=[],checks=[];
function node(id){if(!nodes.has(id))nodes.set(id,{id,textContent:embedded[id]===undefined?'':JSON.stringify(embedded[id]),innerHTML:'',dataset:{},classList:{toggle(){}},style:{},hidden:false,disabled:false,querySelector(){return null;},setAttribute(){},removeAttribute(){},click(){},remove(){},append(){},showModal(){},close(){}});return nodes.get(id);}
const document={getElementById:node,querySelectorAll:()=>[],addEventListener:(type,fn)=>handlers[type]=fn,body:{append(){}},createElement:()=>node('temporary-download'),documentElement:{cloneNode(){const copies=new Map(Object.keys(embedded).map(id=>[id,{textContent:node(id).textContent,removeAttribute(){},setAttribute(){}}]));return {querySelector:selector=>copies.get(selector.slice(1))||null,get outerHTML(){return '<html>'+[...copies].map(([id,n])=>'<script id="'+id+'" type="application/json">'+n.textContent+'</script>').join('')+'</html>';}};}}};
let downloadedBlob=null;
class DownloadURL extends URL{static createObjectURL(blob){downloadedBlob=blob;return 'blob:test';}static revokeObjectURL(){}}
const context={window:{Vagvis:V,VagvisHouseholds:H,VagvisScenarios:S,VagvisDistance:D,VagvisEvidence:E,VagvisMaps:{masks:{},dispose(){},draw(){},select(){},color(){return '#aaa';}},print(){}},document,console:{error:x=>errors.push(x.message)},Intl,Number,String,Math,Date,Promise,JSON,Map,Set,Blob,URL:DownloadURL,setTimeout,clearTimeout};
vm.runInNewContext(fs.readFileSync(path.join(source,'app.js'),'utf8'),context);
const changeMode=mode=>handlers.change({target:{dataset:{path:'household.kmMode'},value:mode}});
const click=id=>handlers.click({target:{closest:()=>({id,dataset:{},hasAttribute:()=>false})}});
const near=(a,b)=>assert.ok(Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(b)),a+' != '+b);
function allViews(App,label){for(const route of ['overview','map','calc','parameters','measures','control','data','method']){App.setView(route);assert.ok(!node('view').innerHTML.includes('Vyn kunde inte visas'),label+' '+route);assert.ok(node('view').innerHTML.length>80,label+' '+route);assert.ok(!node('view').innerHTML.includes('undefined'),label+' undefined '+route);}checks.push(label+': all eight UI routes render without errors');}
(async()=>{
 const App=context.window.VagvisApp;await App.ready;
 assert.equal(App.getConfig().household.kmMode,'local');const initial=App.getResult(),city0=initial.results.find(r=>r.key==='city|1280').central.vkm;
 assert.equal(App.getProject().distanceData.rows.length,348);allViews(App,'B default local');
 App.setView('parameters');assert.ok(node('view').innerHTML.includes('value="deso_estimate"'));assert.ok(!node('view').innerHTML.includes('id="distance-model-panel"'));checks.push('New panel hidden until explicit selection; current local default retained');
 changeMode('deso_estimate');assert.equal(App.getConfig().household.kmMode,'deso_estimate');assert.ok(node('view').innerHTML.includes('id="distance-model-panel"'));assert.ok(node('view').innerHTML.includes('inte validerad'));assert.equal(node('export').disabled,true);
 App.setView('calc');assert.ok(!node('view').innerHTML.includes('Vyn kunde inte visas'));await App.run();
 const selected=App.getResult();near(selected.results.find(r=>r.key==='city|1280').central.vkm,city0);
 assert.equal(App.getAudit().distanceModel.estimate.status,'model_estimate');assert.equal(App.getAudit().distanceModel.indicators.rows.length,348);
 const localKm=H.explain(App.getProject(),App.getConfig(),'city|1280').rows.map(r=>r.kmPerCar);assert.ok(new Set(localKm.map(k=>k.toFixed(6))).size>1);allViews(App,'B DeSO estimate');
 checks.push('Selected model changes DeSO allocation, preserves city activity, exports indicator/assumption provenance');
 App.setView('parameters');handlers.change({target:{dataset:{edit:'household.distanceModel.coefficients.centre',scale:'1'},value:'0.25'}});assert.equal(App.getConfig().household.distanceModel.coefficients.centre,.25);assert.equal(node('export').disabled,true);await App.run();
 const adjusted=H.explain(App.getProject(),App.getConfig(),'city|1280').rows.map(r=>r.kmPerCar);assert.ok(adjusted.some((x,i)=>Math.abs(x-localKm[i])>1e-6));
 click('reset-distance-model');assert.equal(App.getConfig().household.distanceModel.coefficients.centre,D.DEFAULTS.coefficients.centre);await App.run();checks.push('Coefficient edit invalidates cache and result; reset restores defaults');
 App.getConfig().scenarioNote='Öresund <tagg> & DeSO';handlers.click({target:{closest:()=>({dataset:{preset:'carsharing_pbl2015'},hasAttribute:()=>false})}});await App.run();const pr=App.getResult().results.find(r=>r.key==='city|1280');near(pr.scenarioCentral.vkm/pr.central.vkm,.825);near(pr.scenarioCentral.cars/pr.central.cars,.7);checks.push('Actual preset event gives correct scenario factors in new mode');
 click('download-offline');assert.ok(downloadedBlob,'Offline download created');
 const offlineHtml=await downloadedBlob.text();
 const offlineScript=id=>{const m=offlineHtml.match(new RegExp('<script id="'+id+'" type="application/json">([\\s\\S]*?)</script>'));assert.ok(m,'Offline embedded '+id);return JSON.parse(m[1]);};
 const offlineProject=offlineScript('embedded-household-project'),offlineConfig=offlineScript('embedded-config');
 assert.equal(offlineConfig.household.kmMode,'deso_estimate');assert.equal(offlineConfig.scenarioNote,'Öresund <tagg> & DeSO');
 assert.equal(offlineScript('embedded-mode'),'household');assert.equal(offlineScript('distance-data').rows.length,348);assert.equal(offlineProject.distanceData.rows.length,348);
 const reloaded=V.unpackProject(offlineProject,offlineScript('embedded-omraden')),redetermined=H.deterministic(reloaded,offlineConfig);
 near(redetermined.baseMap.get('city|1280').vkm,pr.central.vkm);near(redetermined.scenarioMap.get('city|1280').vkm,pr.scenarioCentral.vkm);
 checks.push('Offline export serializes selected mode, indicators, scenario, Swedish text and escaped HTML; round-trip reproduces activity');

 App.setView('data');const prior=App.getProject();context.window.VagvisRegister={fetch:async()=>{throw new Error('Mock network failure');}};await App.fetchRegister();assert.strictEqual(App.getProject(),prior);assert.ok(node('message').textContent.includes('Befintligt underlag är kvar'));checks.push('Failed register fetch is atomic with selected DeSO mode');
 const importIndicators=async obj=>{handlers.change({target:{id:'import-input',dataset:{},files:[{text:async()=>JSON.stringify(obj)}]}});await new Promise(resolve=>setTimeout(resolve,0));};
 const current=App.getProject(),sameIndicators=JSON.parse(JSON.stringify(current.distanceData));
 const wrongYear=JSON.parse(JSON.stringify(sameIndicators));wrongYear.dataYear=2025;await importIndicators(wrongYear);assert.strictEqual(App.getProject(),current);assert.ok(node('message').textContent.includes('Import kunde inte genomföras'));
 const wrongValue=JSON.parse(JSON.stringify(sameIndicators));wrongValue.rows[0].income=-1;await importIndicators(wrongValue);assert.strictEqual(App.getProject(),current);
 const duplicate=JSON.parse(JSON.stringify(sameIndicators));duplicate.rows.push({...duplicate.rows[0]});await importIndicators(duplicate);assert.strictEqual(App.getProject(),current);
 await importIndicators(sameIndicators);assert.notStrictEqual(App.getProject(),current);assert.equal(App.getConfig().household.kmMode,'deso_estimate');assert.equal(node('export').disabled,true);await App.run();
 checks.push('Indicator file import accepts validated data and rejects wrong-year, negative and duplicate data atomically');
 changeMode('local');await App.run();near(App.getResult().results.find(r=>r.key==='city|1280').central.vkm,city0);App.setView('parameters');assert.ok(!node('view').innerHTML.includes('id="distance-model-panel"'));
 changeMode('national');await App.run();near(App.getResult().results.find(r=>r.key==='city|1280').central.vkm,100524*12753);allViews(App,'B national');checks.push('Switching back restores local baseline and national option remains functional');
 App.setModel('territorial');App.getConfig().iterations=100;await App.run();assert.equal(App.getResult().model,'territorial');for(const route of ['overview','map','calc','parameters','control','data','method']){App.setView(route);assert.ok(!node('view').innerHTML.includes('Vyn kunde inte visas'),'A '+route);}checks.push('Independent A engine and existing routes remain usable');
 assert.deepEqual(errors,[]);
 fs.mkdirSync(path.join(root,'testresultat'),{recursive:true});fs.writeFileSync(path.join(root,'testresultat/interface_dom.json'),JSON.stringify({version:V.VERSION,executedAt:new Date().toISOString(),runtime:process.version,passed:checks.length,checks,errors,scope:'Minimal DOM fixture executes actual source and engines. It does not validate Chromium layout, screenshots or Streamlit runtime.'},null,2)+'\n');
 console.log(checks.length+' UI logic checks passed (DOM fixture, not a browser).');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
