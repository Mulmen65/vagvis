/* Vägvis 2.0.7 – räkneexemplet ska ge exakt samma värden som kartan.
   node source/test_rakneexempel.cjs   (skriver rakneexempel-tests.txt)
   A: explain() räknar om varje område ur resultatets celler, kalibreringen och utsläppsfaktorerna.
   B: explain() räknar om varje område ur hushållsraderna och faktorerna per km.
   Kontrollen görs för basfall och scenario, på kommun-, stadsdels- och DeSO-nivå. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert');
const V=require('./core.js'),H=require('./households.js');
const {V7}=require('./sokvagar.cjs'),sb={window:{}};vm.createContext(sb);
for(const f of ['atgarder.js','osakerhet.js','mc.js'])vm.runInContext(fs.readFileSync(path.join(V7,f),'utf8'),sb);
global.ATGARDER=sb.window.ATGARDER;global.OSAKERHET=sb.window.OSAKERHET;global.MC=sb.window.MC;
const read=f=>JSON.parse(fs.readFileSync(path.join(__dirname,f),'utf8'));
const log=[],ok=(t)=>{log.push('OK  '+t);};
/* Cellerna avrundas till 0,0001 fordonskm; avvikelser under 0,1 kg räknas som noll. */
const rel=(a,b)=>Math.abs(a-b)<1e-4?0:Math.abs(a-b)/Math.max(1,Math.abs(b));
(async()=>{
 const t0=Date.now();
 /* ---------- A ---------- */
 const A=read('geodata_project.json');
 const scen={...A.config,iterations:100,trafficChange:.05,electrify:.1,areaChanges:[{city:'1280',level:'deso',id:'1280C1450',change:.2}],newRoads:[{city:'1280',deso:'1280C1450',roadClass:'secondary',km:1.2}],areaTraffic:[{city:'1280',deso:'1280C1450',carVkm:2.5e6}]};
 for(const [name,cf] of [['basinställning',{...A.config,iterations:100}],['scenario',scen]]){
  const r=await V.simulate(A,V.config(cf));
  assert.ok(Array.isArray(r.cells)&&r.cells.length>1000,'celler saknas');
  let n=0,worst=0,worstS=0;
  for(const x of r.results){if(!x.central)continue;const e=V.explain(r,x.key);worst=Math.max(worst,rel(e.total.total,x.central.total));worstS=Math.max(worstS,rel(e.scenario.total,x.scenarioCentral.total));
   for(const k of [...V.KEYS,'credit','biogenic'])assert.ok(rel(e.total[k],x.central[k])<1e-7,x.key+' '+k);
   assert.ok(rel(e.vkm,x.central.vkm)<1e-7,x.key+' fordonskm');n++;}
  assert.ok(worst<1e-7,'största avvikelse basfall '+worst);assert.ok(worstS<1e-7,'största avvikelse scenario '+worstS);
  const c=V.explain(r,'city|1280'),km=r.cells.filter(x=>!x.o).reduce((a,x)=>a+x.km,0);
  assert.ok(Math.abs(km-(r.metrics.lengthKm-r.metrics.outsideKm))<0.01,'väglängd');
  assert.ok(c.classes.find(x=>x.id==='car').calibrated,'Malmö kalibreras');
  ok('A '+name+': '+n+' områden, räkneexemplet = kartan för basfall och scenario (avvikelse under 0,1 kg CO₂e i alla områden). Väglängd i områdena '+km.toFixed(1)+' km.');
  if(name==='scenario'){const e=V.explain(r,'deso|1280|1280C1450');assert.ok(e.roads.some(g=>g.scenarioOnly&&g.roadClass==='boende'),'boenderad');assert.ok(e.roads.some(g=>g.scenarioOnly&&g.roadClass==='secondary'&&Math.abs(g.km-1.2)<1e-9),'ny väg med längd');ok('A scenario: de boendes trafik och ny väg (1,2 km) syns som egna rader i räkneexemplet för 1280C1450.');}
  else {const e=V.explain(r,'deso|1280|1280C1450');ok('A 1280C1450: '+e.total.total.toFixed(1)+' ton CO₂e, '+(e.vkm/1e6).toFixed(2)+' milj. fordonskm, '+e.km.toFixed(2)+' km väg.');
   const h=V.explain(r,'city|1283');assert.ok(h.classes.every(x=>!x.calibrated&&x.scale===1),'Helsingborg okalibrerat');ok('A Helsingborg: ingen kalibrering, faktor 1 för alla fordonsslag.');}
 }
 /* ---------- B ---------- */
 const B=read('household_project.json');
 const bc=V.config({...B.config,iterations:200,trafficChange:-.1,electrify:.15});
 const rb=await H.simulate(B,bc);let nb=0,wb=0;
 for(const x of rb.results){if(!x.central)continue;const e=H.explain(B,rb,x.key);for(const k of ['direct','total','ttw','electricity','fuelUpstream','vehicle','battery','maintenance','endoflife']){const d=rel(e.t[k],x.central[k]);wb=Math.max(wb,d);assert.ok(d<1e-9,x.key+' '+k+' '+e.t[k]+' '+x.central[k]);}
  assert.ok(rel(e.vkm,x.central.vkm)<1e-9&&rel(e.hh,x.central.hh)<1e-9&&rel(e.cars,x.central.cars)<1e-9,x.key+' aktivitet');nb++;}
 ok('B: '+nb+' områden, räkneexemplet = kartan för direkt CO₂, livscykel och alla delar (avvikelse under 0,1 kg).');
 /* ---------- Ytor ---------- */
 const Y=read('omradesytor.json');let ny=0,wy=0;
 for(const a of A.areas){const y=Y.A[a.level+'|'+a.city+'|'+a.id];assert.ok(y&&y.ha>0&&y.landHa>0&&y.landHa<=y.ha+1e-6,'yta A '+a.id);const d=Math.abs(V.areaKm2(a.geometry)*100/y.ha-1);wy=Math.max(wy,d);ny++;}
 assert.ok(wy<0.02,'areaKm2 avviker '+wy);
 for(const a of B.areas){const y=Y.B[a.level+'|'+a.city+'|'+a.id];assert.ok(y&&y.ha>0,'yta B '+a.id);ny++;}
 ok('Ytor: '+ny+' områden har yta; webbläsarens ytformel avviker högst '+(wy*100).toFixed(2)+' % från SWEREF 99 TM.');
 const msg=log.join('\n')+'\nAlla kontroller godkända ('+((Date.now()-t0)/1000).toFixed(0)+' s).';
 fs.writeFileSync(path.join(__dirname,'rakneexempel-tests.txt'),msg+'\n');console.log(msg);
})().catch(e=>{console.error('FEL:',e.message);process.exit(1);});
