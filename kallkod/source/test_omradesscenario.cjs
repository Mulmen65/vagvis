/* Kontroller av Områdesscenario (2.0.5), modell B och A. Körs: node source/test_omradesscenario.cjs */
const path=require('node:path');const R=path.resolve(__dirname,'..');const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const V=require(R+'/source/core.js'),H=require(R+'/source/households.js');const P=JSON.parse(fs.readFileSync(R+'/source/household_project.json'));
const sb={window:{}};vm.createContext(sb);for(const f of ['atgarder.js','osakerhet.js','mc.js'])vm.runInContext(fs.readFileSync(path.join(require('./sokvagar.cjs').V7,f),'utf8'),sb);
vm.runInContext(fs.readFileSync(R+'/source/v7_berakning.js','utf8'),sb);global.ATGARDER=sb.window.ATGARDER;global.OSAKERHET=sb.window.OSAKERHET;global.MC=sb.window.MC;const BM=sb.window.BILMODELL;
const near=(a,b,t=1e-9,m='')=>assert.ok(Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),m+' '+a+' vs '+b);
const tf=id=>BM.tillstandFranForval(id);let ok=0;const check=async(n,f)=>{await f();ok++;console.log('OK',n);};
const cfgWith=x=>{const c=JSON.parse(JSON.stringify(P.config));Object.assign(c,x);return c;};
(async()=>{
await check('områdesscenario "som området" ger samma scenario som 2.0.4:s åtgärder för en DeSO (v7 Befintliga områden)',()=>{
 const st=JSON.parse(JSON.stringify(tf('ivl')));
 const c1=cfgWith({});c1.household.measures={packageId:'ivl',state:st,scope:{level:'deso',city:'1280',id:'1280C1040'},newDwellings:200,sigmaS:0};
 const c2=cfgWith({areaScenario:{active:true,city:'1280',deso:'1280C1040',newDwellings:200,base:{mode:'area'},measures:{packageId:'ivl',state:st}}});
 const a=H.deterministic(P,c1),b=H.deterministic(P,c2);for(const [k,v] of a.scenario){const w=b.scenario.get(k);for(const f of Object.keys(v))near(w[f],v[f],1e-9,k+' '+f);}
 for(const [k,v] of a.base){const w=b.base.get(k);for(const f of Object.keys(v))assert.equal(w[f],v[f]);}});
await check('nya hushåll från ett motsvarande område räknas som v7 Nya områden (bilar per hushåll och km per bil, med parkeringstal)',()=>{
 const st=tf('paket');st.bilpool={pa:true,niva:60};
 for(const [a,cap] of [[{kk:'1280',sd:'Hyllie',kod:''},0.3],[{kk:'1280',sd:'Hyllie',kod:'1280C1270'},0],[{kk:'1280',sd:'Husie',kod:'1280C1780'},0.5]]){
  const c=cfgWith({areaScenario:{active:true,city:'1280',deso:'1280C1450',newDwellings:4000,persons:2,base:{mode:'analog',analog:a},parking:cap||null,measures:{state:st}}});
  const as=H.prepare(P,c).area;const rows=a.kod?P.households.filter(r=>r.kod===a.kod):P.households.filter(r=>r.kk===a.kk&&r.sd===a.sd);
  // v7 renderN/berakna: agg(analog), kontextN, atgardseffekt, tillampa med tak
  let hh=0,bilar=0,kmBil=0;rows.forEach(r=>{hh+=r.hh;bilar+=r.bph*r.hh;kmBil+=r.km*r.bph*r.hh;});const B0=bilar/hh,km0=kmBil/bilar;
  const E=BM.atgardseffekt(st,{andelNy:1,tathet:0,pushExtra:cap>0&&cap<B0?1:0}),Rv=BM.tillampa(B0,km0,E,cap);
  near(as.nu.B,Rv.B,1e-12,'B');near(as.nu.K,Rv.km,1e-12,'km');near(as.nu.V,Rv.V,1e-12,'V');}});
await check('detaljvyn summerar till samma DeSO-, stadsdels- och kommunvärden som beräkningen',()=>{
 for(const mode of ['area','analog','own']){const c=cfgWith({trafficChange:.05,electrify:.1,areaScenario:{active:true,city:'1280',deso:'1280C1450',newDwellings:4000,persons:2,base:{mode,analog:{kk:'1280',sd:'Hyllie',kod:''},bph:.3,km:11000},parking:.3,ev:{el:.5,lh:.1},applyExisting:true,measures:{state:tf('ivl')}}});
  const d=H.areaDetail(P,c),sc=d.deterministic.scenario.get('deso|1280|1280C1450');for(const f of ['vkm','hh','bef','cars','direct','total','ttw'])near(d.scen[f],sc[f],1e-9,mode+' '+f);
  let s=0;for(const [k,v] of d.deterministic.scenario)if(k.startsWith('deso|1280|'))s+=v.total;near(s,d.deterministic.scenario.get('city|1280').total,1e-9,'stängning');}});
await check('osäkerheten i vyn har centralvärden nära den deterministiska beräkningen',()=>{
 const c=cfgWith({areaScenario:{active:true,city:'1280',deso:'1280C1450',newDwellings:4000,persons:2,base:{mode:'own',bph:.3,km:11000},measures:{state:{}}}});
 const d=H.areaDetail(P,c),u=H.areaMC(P,c);assert.ok(u.scen.p5<d.scen.direct&&d.scen.direct<u.scen.p95);near(u.nu.B.p50,0.3*Math.exp(-0.5*Math.log(1.04)),0.05,'B-median');});
await check('simuleringen: basfallet oförändrat, områdets scenario dras och kommunen är summan av DeSO',async()=>{
 const base=await H.simulate(P,cfgWith({iterations:300}));
 for(const mode of ['area','analog','own']){const c=cfgWith({iterations:300,areaScenario:{active:true,city:'1280',deso:'1280C1450',newDwellings:4000,persons:2,base:{mode,analog:{kk:'1280',sd:'Hyllie',kod:''},bph:.3,km:11000},parking:.3,measures:{state:tf('paket')}}});
  const r=await H.simulate(P,c);for(const x of r.results){const y=base.results.find(z=>z.key===x.key);assert.deepEqual(x.base,y.base);assert.deepEqual(x.direct,y.direct);}
  const x=r.results.find(z=>z.key==='deso|1280|1280C1450'),d=H.areaDetail(P,c);near(x.scenarioCentral.total,d.scen.total,1e-9);assert.ok(x.scenario.p025<x.scenario.p975);
  const others=r.results.filter(z=>z.key!=='deso|1280|1280C1450'&&z.level==='deso');for(const z of others){const y=base.results.find(q=>q.key===z.key);assert.deepEqual(z.scenario,y.scenario);}
  assert.ok(r.warnings.some(w=>w.includes('områdesscenario')));assert.equal(r.metrics.areaScenario.deso,'1280C1450');}});
await check('åtgärderna under Åtgärder & underlag gäller övriga områden när ett områdesscenario är aktivt',()=>{
 const c=cfgWith({areaScenario:{active:true,city:'1280',deso:'1280C1450',newDwellings:0,base:{mode:'area'},measures:{state:{}}}});c.household.measures={packageId:'stad_ivl',state:tf('stad_ivl'),scope:{level:'city',city:'1280',id:null},newDwellings:0,sigmaS:0};
 const d=H.deterministic(P,c);const j=d.scenario.get('deso|1280|1280C1450'),b=d.base.get('deso|1280|1280C1450');near(j.total,b.total,1e-12);const o=d.scenario.get('deso|1280|1280C1040'),ob=d.base.get('deso|1280|1280C1040');assert.ok(o.total<ob.total*0.95);});
await check('ogiltiga områdesscenarier stoppas',()=>{
 const bad=[{deso:'XXX'},{newDwellings:-1},{base:{mode:'konstig'}},{base:{mode:'own',bph:9,km:1}},{base:{mode:'analog',analog:{kk:'1280',sd:'Finns ej',kod:''}}},{ev:{el:.8,lh:.5}},{persons:50}];
 for(const b of bad){const c=cfgWith({areaScenario:{active:true,city:'1280',deso:'1280C1450',newDwellings:10,base:{mode:'area'},...b}});assert.throws(()=>H.prepare(P,c));}
 const c=cfgWith({areaScenario:{active:false,city:'1280',deso:'XXX'}});H.prepare(P,c);});
console.log(ok+' kontroller av områdesscenariot i modell B passerade.');await partA();
})().catch(e=>{console.error(e);process.exit(1);});



async function partA(){const P=JSON.parse(fs.readFileSync(R+'/source/geodata_project.json'));const base=V.config(P.config||{});ok=0;
await check('de boendes trafik i en DeSO läggs till personbilstrafiken i scenariot, utan kalibreringsfaktor',()=>{
 for(const tc of [0,.1]){const c0=V.config({...base,trafficChange:tc}),c1=V.config({...base,trafficChange:tc,areaTraffic:[{city:'1280',deso:'1280C1450',carVkm:400000}]});
 const d0=V.deterministic(P,c0),d1=V.deterministic(P,c1),k='deso|1280|1280C1450',f=d1.scenarioFactors[0];
 near(d1.scenario.agg.get(k).total-d0.scenario.agg.get(k).total,400000*(1+tc)*f.total/1e6,1e-9,'DeSO');near(d1.scenario.agg.get('city|1280').total-d0.scenario.agg.get('city|1280').total,400000*(1+tc)*f.total/1e6,1e-9,'kommun');
 for(const [key,v] of d0.base.agg)assert.equal(d1.base.agg.get(key).total,v.total);assert.ok(d1.base.scales['1280|light']!==1);}});
await check('minskad trafik (negativ) fungerar och övriga områden är oförändrade',()=>{
 const c0=V.config(base),c1=V.config({...base,areaTraffic:[{city:'1280',deso:'1280C1450',carVkm:-50000}]}),d0=V.deterministic(P,c0),d1=V.deterministic(P,c1);
 for(const [key,v] of d0.scenario.agg)if(!key.includes('1280C1450')&&!key.startsWith('city|1280')&&!key.startsWith('district|1280|'))assert.equal(d1.scenario.agg.get(key).total,v.total);
 assert.ok(d1.scenario.agg.get('deso|1280|1280C1450').total<d0.scenario.agg.get('deso|1280|1280C1450').total);});
await check('simuleringen: basfallets dragningar är desamma med och utan de boendes trafik',async()=>{
 const c0=V.config({...base,iterations:120}),c1=V.config({...base,iterations:120,areaTraffic:[{city:'1280',deso:'1280C1450',carVkm:400000}]});
 const r0=await V.simulate(P,c0),r1=await V.simulate(P,c1);for(const x of r0.results){const y=r1.results.find(z=>z.key===x.key);assert.deepEqual(y.base,x.base);}
 const y=r1.results.find(z=>z.key==='deso|1280|1280C1450');assert.ok(y.difference.mean>0&&y.difference.p025<y.difference.p975);});
await check('ogiltig lista och okänd DeSO stoppas',()=>{assert.throws(()=>V.config({...base,areaTraffic:[{city:'1280',deso:'1280C1450',carVkm:'x'}]}));assert.throws(()=>V.deterministic(P,V.config({...base,areaTraffic:[{city:'1280',deso:'NEJ',carVkm:1}]})));});
await check('ytan för en DeSO räknas i km²',()=>{const a=P.areas.find(x=>x.id==='1280C1450'&&x.level==='deso');const km2=V.areaKm2(a.geometry);assert.ok(km2>1.5&&km2<3,km2);});
console.log(ok+' kontroller av de boendes trafik i modell A passerade.');}
