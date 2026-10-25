/* Independent arithmetic examples and invariants. Uses Node built-ins only. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),V=require('../kallkod/source/core.js'),S=require('../kallkod/source/scenarios.js'),H=require('../kallkod/source/households.js');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const json=file=>JSON.parse(read(file));
const omraden=json('kallkod/data/omraden.json');
const load=file=>V.unpackProject(json(file),omraden);
const reports=[];
function near(actual,expected,label,rel=1e-9){assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=rel*Math.max(1,Math.abs(expected)),label+': '+actual+' ≠ '+expected);}
async function check(name,fn){await fn();reports.push(name);console.log('OK '+name);}
const polygon=(x0,x1)=>({type:'Polygon',coordinates:[[[x0,-.1],[x1,-.1],[x1,.1],[x0,.1],[x0,-.1]]]});
function fixture(){
  const geometry={type:'LineString',coordinates:[[0,0],[1,0]]};
  const properties={id:'LINK',flowMetric:'ANNUAL_VKM',annualVkm:366000,measurementYear:2024,flowDirection:'both',geometryDirection:'both',countBasis:'geometry',source:'Fiktivt aritmetiskt testfall',aadtCV:0,classShares:{car:1}};
  return {schema:'vagvis-1',model:'territorial',title:'Fiktivt testfall',metadata:{desoVersion:'2025',networkYear:2024},cities:[{id:'TEST',name:'Testkommun',reference:null}],areas:[
    {id:'D1',city:'TEST',level:'deso',name:'Väst',version:'2025',geometry:polygon(0,.5)},
    {id:'D2',city:'TEST',level:'deso',name:'Öst',version:'2025',geometry:polygon(.5,1)},
    {id:'EMPTY',city:'TEST',level:'deso',name:'Utan vägunderlag',version:'2025',geometry:polygon(2,3)},
    {id:'DIST',city:'TEST',level:'district',name:'Testområde',version:'2025',geometry:polygon(0,1)}
  ],roads:V.normalizeRoads({type:'FeatureCollection',features:[{type:'Feature',properties,geometry}]},'TEST',2024)};
}
function toyConfig(){
  const c=V.config({iterations:100,mode:'network',environment:{enabled:false}});
  Object.assign(c.profiles[0],{mix:{petrol:1},mj:1,other:0,life:100000,body:1000,battery:0,maint:2,eol:100,credit:50});
  c.fuels.petrol={name:'Fiktivt testbränsle',fossil:1,ttw:70,wtt:20,bio:0,bioCO2:0};
  return V.config(c);
}
function aggregateClosure(agg,cities){
  for(const city of cities)for(const level of ['deso','district'])for(const key of [...V.KEYS,'electricity','fuelUpstream','direct','credit','biogenic','total','net','vkm']){
    const expected=agg.get('city|'+city.id)?.[key];
    if(expected==null)continue;
    const value=[...agg].filter(([id])=>id.startsWith(level+'|'+city.id+'|')).reduce((total,[,row])=>total+row[key],0);
    near(value,expected,city.id+' '+level+' '+key);
  }
}
async function main(){
  await check('Körbar källkod är självständig och har rätt version',()=>{
    assert.equal(V.VERSION,'2.2.2');assert.equal(S.VERSION,'2.2.2');assert.equal(H.VERSION,'2.2.2');
    // Endast filer som skalet laddar får finnas i kallkod/source; äldre modellers filer ska inte följa med.
    const sources=fs.readdirSync(path.join(root,'kallkod/source')).sort();
    const loaded=[...read('kallkod/source/shell.html').matchAll(/\{\{kallkod\/source\/([^}]+)\}\}/g)].map(m=>m[1]);
    assert.deepEqual(sources,[...loaded,'shell.html'].sort(),'Okända filer i kallkod/source');
    for(const file of sources){
      const source=read('kallkod/source/'+file);
      if(file.endsWith('.js'))new vm.Script(source,{filename:file});
    }
    const pages=fs.readdirSync(path.join(root,'app')).filter(f=>f.endsWith('.html')).sort();
    assert.ok(pages.every(f=>['Metod_och_anvandning.html','Trafikdata_till_Malmo.html','Vagvis.html'].includes(f)),'Okända sidor i app/: '+pages.join(', '));
  });
  await check('Byggd HTML har körbar JavaScript och laddar beräkningsmoduler i rätt ordning',()=>{
    const html=read('app/Vagvis.html');
    const ids=['core-script','scenario-script','household-script','register-script'];
    const positions=ids.map(id=>html.indexOf('id="'+id+'"'));
    assert.ok(positions.every(position=>position>=0),'En modulmarkör saknas');
    assert.deepEqual(positions,[...positions].sort((a,b)=>a-b),'Globalmodulerna har fel laddningsordning');
    let scripts=0;
    for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
      if(/type=["']application\/json["']/.test(match[1])){JSON.parse(match[2]);continue;}
      assert.ok(!/\bsrc=/.test(match[1]),'Extern kod ska vara paketerad');
      new vm.Script(match[2],{filename:'app/Vagvis.html script '+scripts});scripts++;
    }
    assert.ok(scripts>=9,'Körbara skript saknas');
  });
  await check('Livscykeln summerar sex komponenter utan dubbelräkning eller återvinningsavdrag',()=>{
    const c=toyConfig(),f=V.factors(c)[0];
    near(f.ttw,70,'TTW g/km');near(f.wtt,20,'WTT g/km');near(f.vehicle,10,'Fordon g/km');near(f.battery,0,'Batteri g/km');near(f.maintenance,2,'Underhåll g/km');near(f.endoflife,1,'Slutbehandling g/km');
    near(f.total,103,'LCA g/km');near(f.credit,.5,'Separat kredit');near(f.net,102.5,'Separat nettoscenario');
    for(const factor of V.factors(V.config())){
      near(factor.total,V.KEYS.reduce((sum,key)=>sum+factor[key],0),'Komponentsumma');
      near(factor.wtt,factor.electricity+factor.fuelUpstream,'Tidigare energiled');
      near(factor.direct,factor.ttw+factor.electricity,'Drift inklusive elproduktion');
    }
  });
  await check('Elbil har noll TTW och redovisar elproduktion en gång',()=>{
    const c=V.config();c.profiles[0].mix={bev:1};const f=V.factors(c)[0];
    near(f.ttw,0,'Elbil TTW');near(f.fuelUpstream,0,'Elbil bränsleled');near(f.electricity,.182/.9*90,'El g/km: 20,2 kWh/100 km vid uttag × 90 g/kWh');
    near(f.vehicle,7200*.903*1000/240000,'Elbil fordonsproduktion (ICCT 6,5 t)');near(f.battery,53.4*72.8*1000/240000,'Elbil batteri (ICCT 53,4 kWh × 72,8 kg/kWh)');near(f.maintenance,4,'Elbil underhåll (ICCT 4 g/km)');near(f.endoflife,0,'Slutbehandling ingår i ICCT:s tillverkningsvärde');
  });
  await check('Årstrafik, ton och skottår har rätt enheter i ett explicit räknefall',()=>{
    assert.equal(V.days(2024),366);assert.equal(V.days(2023),365);
    const p=fixture(),d=V.deterministic(p,toyConfig()),city=d.base.agg.get('city|TEST');
    near(city.vkm,366000,'Årligt trafikarbete');near(city.total,37.698,'Ton CO2e');near(city.ttw,25.62,'Ton TTW');
    near(d.base.agg.get('deso|TEST|D1').total,18.849,'Halva länken');
    aggregateClosure(d.base.agg,p.cities);aggregateClosure(d.scenario.agg,p.cities);
  });
  await check('MVD, målår och körriktning kräver dokumenterad omräkning',()=>{
    const g=fixture().roads[0].geometry,raw={flowMetric:'MVD',flow:1000,measurementYear:2023,flowDirection:'both',geometryDirection:'forward',countBasis:'geometry',source:'Fiktiv mätning'};
    assert.throws(()=>V.normalizeTraffic(raw,g,2024),/MVD/);
    const conversion={...raw,mvdToAadtFactor:.9,conversionSource:'Dokumenterad testprofil',conversionCV:.1};
    assert.throws(()=>V.normalizeTraffic(conversion,g,2024),/yearFactor/);
    const year={...conversion,yearFactor:1.1,yearFactorSource:'Dokumenterad testframskrivning',yearFactorCV:.05};
    assert.throws(()=>V.normalizeTraffic(year,g,2024),/directionShare/);
    const converted=V.normalizeTraffic({...year,directionShare:.4,directionSource:'Fiktivt riktningssnitt',directionCV:0},g,2024);
    near(converted.aadt,396,'MVD × årsprofil × år × riktning');assert.equal(converted.year,2024);assert.equal(converted.measurementYear,2023);assert.equal(converted.flowAudit.factors.length,3);
    const missing={...year,directionShare:.4,directionSource:'Fiktivt riktningssnitt'};
    assert.throws(()=>V.normalizeTraffic(missing,g,2024),/CV/);
    assert.throws(()=>V.normalizeTraffic({...raw,flowMetric:'AADT',flowDirection:'forward',geometryDirection:'backward'},g,2023),/riktning/);
  });
  await check('Fordonsandelar ska anges som andelar, inte procenttal',()=>{
    const c=V.config();c.profiles[0].mix={bev:50,petrol:50};assert.throws(()=>V.config(c));
    const p=fixture();p.roads[0].classShares={car:100};assert.throws(()=>V.validateProject(p));
    const normalized=V.normalizeTraffic({},fixture().roads[0].geometry,2024);assert.equal(normalized.aadt,null);
  });
  await check('Åtgärder har inga dolda effekter och dubblar inte bilinnehav och körning',()=>{
    for(const action of S.actions){assert.deepEqual(action.defaultEffects,{cars:0,vkm:0,energy:0});}
    const state={bilpool:{enabled:true,coverage:1,intensity:1,preset:'carsharing_pbl2015'}};
    const result=S.apply({cars:100,vkm:1000000,households:80},state);
    near(result.after.cars,70,'Bilar');near(result.after.vkm,825000,'Totala bilkilometer');near(result.after.kmPerCar,11785.714285714286,'Km per kvarvarande bil');
    const partial=S.apply({cars:100,vkm:1000000},{bilpool:{...state.bilpool,coverage:.5}});
    near(partial.after.cars,85,'Halvt deltagande bilar');near(partial.after.vkm,912500,'Halvt deltagande körning');
    const identity=S.effects({cykelnat:{enabled:true}});assert.equal(identity.fVkm,1);assert.ok(identity.warnings.length>0);
    assert.throws(()=>S.effects({bilpool:{enabled:true,coverage:50}}));
    assert.throws(()=>S.apply({cars:100,vkm:1000000},{bilpool:{enabled:true,effects:{cars:-1,vkm:0,energy:0}}}));
  });
  await check('A-scenario ändrar scenariot utan att skriva över basfallet',()=>{
    const p=fixture(),baseline=V.deterministic(p,toyConfig()),config=toyConfig();config.areaChanges=[{city:'TEST',level:'deso',id:'D1',change:-.5}];
    const changed=V.deterministic(p,config);near(changed.base.agg.get('city|TEST').total,baseline.base.agg.get('city|TEST').total,'Oförändrat basfall');near(changed.scenario.agg.get('city|TEST').total,37.698*.75,'Områdesscenario');aggregateClosure(changed.scenario.agg,p.cities);
  });
  await check('Monte Carlo bevarar områdessummor i varje dragning och saknade områden är null',async()=>{
    const p=fixture(),c=toyConfig(),a=await V.simulate(p,c),b=await V.simulate(p,c);
    const missing=a.results.find(row=>row.id==='EMPTY');assert.equal(missing.central,null);assert.equal(missing.base,null);
    assert.deepEqual(Array.from(a.draws.get('city|TEST').base),Array.from(b.draws.get('city|TEST').base));
    assert.ok(a.maxClosureError<1e-8);
    for(let i=0;i<c.iterations;i++)for(const level of ['deso','district']){
      const sum=[...a.draws].filter(([key])=>key.startsWith(level+'|TEST|')).reduce((total,[,draws])=>total+draws.base[i],0);
      near(sum,a.draws.get('city|TEST').base[i],'Dragning '+i+' '+level);
    }
    const row=a.results.find(row=>row.key==='city|TEST');assert.ok(row.base.p025<=row.base.p50&&row.base.p50<=row.base.p975);assert.equal(row.difference.p025,0);assert.equal(row.difference.p975,0);
  });
  await check('CSV lämnar landnormalisering tom när landareal saknas och A kan avbrytas',async()=>{
    const p=fixture(),c=toyConfig(),r=await V.simulate(p,c);
    const rows=V.resultCSV(r,undefined,undefined,()=>({ha:100,landHa:null})).replace(/^\uFEFF/,'').split(/\r?\n/).map(line=>line.split(';').map(cell=>cell.slice(1,-1).replaceAll('""','"')));
    const header=rows[0],city=rows.find(row=>row[header.indexOf('niva')]==='city');
    assert.equal(city[header.indexOf('yta_ha')],'100,000');
    for(const name of ['landyta_ha','bas_tCO2e_per_ha_land','scenario_tCO2e_per_ha_land'])assert.equal(city[header.indexOf(name)],'',name);
    const positive=V.resultCSV(r,undefined,undefined,()=>({ha:100,landHa:50})).replace(/^\uFEFF/,'').split(/\r?\n/).map(line=>line.split(';').map(cell=>cell.slice(1,-1).replaceAll('""','"')));
    const positiveCity=positive.find(row=>row[header.indexOf('niva')]==='city');assert.equal(positiveCity[header.indexOf('bas_tCO2e_per_ha_land')],'0,754');
    await assert.rejects(V.simulate(p,c,()=>{},()=>true),/avbr/i);
  });
  await check('Aktiva geografier och nyberäknat A-resultat går att spåra och summera',()=>{
    const p=load('kallkod/data/project.json'),b=load('kallkod/data/household-project.json'),c=V.config(p.config),r=json('kallkod/data/result.json');
    assert.equal(r.version,V.VERSION);assert.equal(r.model,'territorial');assert.equal(p.model,'territorial');assert.equal(r.fingerprint,V.fingerprint(p,c));assert.equal(r.fingerprint,V.fingerprint({...p,model:'territorial'},V.config(p.config||json('kallkod/data/config.json'))),'UI:s startkonfiguration ska godta det nyberäknade resultatet');assert.ok(!Object.hasOwn(r,'baselineVersion'));
    const areaKey=a=>a.city+'|'+a.level+'|'+a.id;
    assert.deepEqual(p.areas.map(areaKey).sort(),b.areas.map(areaKey).sort());
    assert.ok(p.areas.every(a=>a.version==='2025'));
    const agg=new Map(r.results.filter(row=>row.central).map(row=>[row.key,row.central]));aggregateClosure(agg,p.cities);
    for(const row of r.results)if(row.central){near(row.central.total,V.KEYS.reduce((sum,key)=>sum+row.central[key],0),'Paketerad komponentsumma');}
    assert.ok(r.maxClosureError<1e-5);
  });
  await check('B beräknar antal bilar × km per bil med samma LCA-enhet som A',()=>{
    const p={model:'household',metadata:{dataYear:2024,dataStatus:'observed_register'},d:[
      {kod:'1280C1000',kk:'1280',sd:'1280R1',hh:100,bef:200,bil:100,dataYear:2024},
      {kod:'1280C1010',kk:'1280',sd:'1280R1',hh:50,bef:100,bil:50,dataYear:2024}
    ]},c=toyConfig();c.household={kmPerCar:1000};
    const d=H.deterministic(p,c),city=d.baseMap.get('city|1280');
    near(city.cars,150,'Bilar');near(city.vkm,150000,'B fordonskm');near(city.total,15.45,'B ton CO2e');
    aggregateClosure(d.baseMap,[{id:'1280'}]);assert.deepEqual(d.baseMap,d.scenarioMap);
    const explanation=H.explain(p,c,'city|1280');near(explanation.rows.reduce((sum,row)=>sum+row.vkm,0),city.vkm,'B räkneexempel');
    const missing=V.clone(p);missing.d[0].bil=null;assert.throws(()=>H.validate(missing,c));
    assert.throws(()=>H.validate({...p,d:[]},c));
    const wrongYear=V.clone(p);wrongYear.metadata.dataYear=2023;assert.throws(()=>H.validate(wrongYear,c),/år/);
  });
  await check('B använder uppmätt körsträcka per DeSO, därefter kommunvärde och sist riksmedelvärdet',async()=>{
    const p={model:'household',metadata:{dataYear:2024,dataStatus:'observed_register'},d:[
      {kod:'1280C1000',kk:'1280',sd:'1280R1',hh:100,bef:200,bil:100,km:8000,kmStatus:'observed_register',dataYear:2024},
      {kod:'1280C1010',kk:'1280',sd:'1280R1',hh:50,bef:100,bil:50,km:11000,kmStatus:'derived_official',dataYear:2024},
      {kod:'1280C1020',kk:'1280',sd:'1280R1',hh:50,bef:100,bil:50,km:99999,kmStatus:'transferred_assumption',dataYear:2024}
    ]},c=toyConfig();c.household={kmPerCar:12753};
    const d=H.deterministic(p,c);
    near(d.baseMap.get('city|1280').vkm,100*8000+50*11000+50*12753,'Hierarki för körsträcka');
    assert.equal(H.kmLevel(p.d[0],H.config(c)),'deso');assert.equal(H.kmLevel(p.d[1],H.config(c)),'kommun');assert.equal(H.kmLevel(p.d[2],H.config(c)),'riket');
    const national=H.deterministic(p,{...c,household:{kmPerCar:12753,kmMode:'national'}});
    near(national.baseMap.get('city|1280').vkm,200*12753,'Samma riksvärde för alla');
    assert.throws(()=>H.config({...c,household:{kmPerCar:12753,kmMode:'centrum'}}),/Körsträckeläget/);
    const all={...p,d:p.d.map(r=>({...r,km:9000,kmStatus:'observed_register'}))};
    const sim=await H.simulate(all,{...c,iterations:400,household:{kmPerCar:12753,uncertainty:{distanceLocal:.05,allocationLocal:.05}}});
    const city=sim.results.find(r=>r.key==='city|1280');
    assert.ok(city.base.p975/city.base.p025<1.6,'Uppmätt körsträcka ska ge smalare intervall än riksvärdet');
  });
  await check('B tillämpar total körningsförändring utan ett extra bilinnehavspåslag',()=>{
    const p={metadata:{dataYear:2024},d:[{kod:'1280C1000',kk:'1280',sd:'1280R1',hh:100,bef:200,bil:100}]},c=toyConfig();
    c.household={kmPerCar:1000};c.areaScenario={bilpool:{enabled:true,preset:'carsharing_pbl2015'}};
    const d=H.deterministic(p,c),before=d.baseMap.get('city|1280'),after=d.scenarioMap.get('city|1280');
    near(after.cars,70,'B scenario bilar');near(after.vkm,82500,'B scenario fordonskm');near(after.total,before.total*.825,'B scenario LCA');
    c.areaScenario={sparsamkorning:{enabled:true,effects:{cars:0,vkm:0,energy:-.1}}};const energy=H.deterministic(p,c);
    near(energy.scenarioFactors.vehicle,energy.factors.vehicle,'Oförändrad tillverkning per km');near(energy.scenarioFactors.ttw,energy.factors.ttw*.9,'Minskad energi TTW');near(energy.scenarioFactors.wtt,energy.factors.wtt*.9,'Minskad energi WTT');
  });
  await check('B:s lokala körsträckevariation bevarar kommunens aktivitet i varje dragning',async()=>{
    const p={metadata:{dataYear:2024},d:[{kod:'1280C1000',kk:'1280',sd:'1280R1',hh:100,bef:200,bil:100},{kod:'1280C1010',kk:'1280',sd:'1280R2',hh:50,bef:100,bil:50}]},c=toyConfig();
    c.household={kmPerCar:1000,uncertainty:{distance:0,carStock:0,allocation:.5}};
    for(const key of Object.keys(c.uncertainty))if(key!=='mixConcentration')c.uncertainty[key]=0;
    const r=await H.simulate(p,c),draws=r.draws.get('city|1280').base;
    for(let i=0;i<c.iterations;i++){
      near(draws[i],15.45,'B fast kommunaktivitet');
      for(const level of ['deso','district'])near([...r.draws].filter(([key])=>key.startsWith(level+'|1280|')).reduce((sum,[,value])=>sum+value.base[i],0),draws[i],'B dragning '+level);
    }
    const local=Array.from(r.draws.get('deso|1280|1280C1000').base);assert.ok(Math.max(...local)>Math.min(...local));assert.ok(r.maxClosureError<1e-8);
    for(const row of r.results){assert.equal(row.difference.p025,0);assert.equal(row.difference.p975,0);}
  });
  await check('Nya hushåll ger ett separat tillägg i B utan att ändra basfallet',()=>{
    const p={metadata:{dataYear:2024},d:[{kod:'1280C1000',kk:'1280',sd:'1280R1',hh:10,bef:20,bil:5}]},c=toyConfig();
    c.household={kmPerCar:1000};c.exploitation={enabled:true,city:'1280',deso:'1280C1000',newHouseholds:20,carsPerHousehold:.5,kmPerCar:2000};
    const d=H.deterministic(p,c),before=d.baseMap.get('city|1280'),after=d.scenarioMap.get('city|1280');
    near(before.vkm,5000,'Exploatering basfall fordonskm');near(before.households,10,'Exploatering basfall hushåll');near(after.vkm,25000,'Exploatering scenario fordonskm');near(after.households,30,'Exploatering scenario hushåll');near(after.cars,15,'Exploatering scenario bilar');near(after.total,2.575,'Exploatering LCA');
    aggregateClosure(d.scenarioMap,[{id:'1280'}]);
    const bad=V.clone(c);bad.exploitation.deso='1280C9999';assert.throws(()=>H.validate(p,bad),/DeSO/);
    assert.equal(p.d[0].bil,5);assert.equal(p.d[0].hh,10);
  });
  await check('Observerade bilar får positiv körning även när en uttrycklig hushållsproxy är noll',()=>{
    const p={metadata:{dataYear:2024,dataStatus:'register_cars_partial'},d:[{kod:'1280C2850',kk:'1280',sd:'1280R1',hh:0,bef:0,bil:545,bph:null,hhStatus:'spatial_model_assumption',befStatus:'spatial_model_assumption',bilStatus:'observed_register'}]},c=toyConfig();
    c.household={kmPerCar:1000};const d=H.deterministic(p,c),row=d.baseMap.get('city|1280');
    near(row.cars,545,'Observerat bilantal');near(row.vkm,545000,'Körning från bilar utan hushållsproxy');near(row.total,56.135,'LCA från observerade bilar');
    assert.equal(H.explain(p,c,'city|1280').rows[0].carsPerHousehold,null);
    const invalid=V.clone(p);invalid.d[0].hhStatus='observed_register';assert.throws(()=>H.validate(invalid,c),/hushåll/);
    const unknown=V.clone(p);delete unknown.d[0].hhStatus;assert.throws(()=>H.validate(unknown,c),/hushåll/);
    assert.equal(p.d[0].bph,null);assert.equal(p.d[0].bil,545);
  });
  await check('Registerbilar och skattade nämnare har skilda källstatusar i B och CSV',()=>{
    const p=load('kallkod/data/household-project.json'),c=H.config(p.config),d=H.deterministic(p,c),r=H.makeResult(d),observed=r.dataStatus==='observed_register';
    assert.ok(['register_cars_partial','observed_register'].includes(r.dataStatus));assert.equal(c.household.uncertainty.carStock,0);
    // Körsträcka: inläst kommunvärde (RUS/SCB) om det finns, annars riksmedelvärdet 12 753 km.
    const kommunKm=fs.existsSync(path.join(root,'underlag/raw/korstracka_kommun_2024.json'))?JSON.parse(read('underlag/raw/korstracka_kommun_2024.json')).cities:null;
    for(const [city,cars] of [['1280',100524],['1283',58000],['2180',43311]]){
      const km=kommunKm?kommunKm[city].kmPerCar:12753,vkm=cars*km;
      assert.ok(p.d.filter(x=>x.kk===city).every(x=>H.kmOf(x,c)===km),'Körsträcka per bil i '+city);
      const row=d.baseMap.get('city|'+city);near(row.cars,cars,'Kommunens observerade bilar');near(row.vkm,vkm,'Observerade bilar × körsträcka');
      const exported=V.resultCSV(r,city,'city').replace(/^\uFEFF/,'').split(/\r?\n/).map(line=>line.split(';').map(cell=>cell.slice(1,-1).replaceAll('""','"')));
      const headers=exported[0],values=exported[1],cell=name=>{assert.ok(headers.includes(name),'CSV-fält '+name);return values[headers.indexOf(name)];};
      assert.equal(cell('personbilar_bas'),cars.toFixed(3).replace('.',','));assert.equal(cell('personbilar_scenario'),cars.toFixed(3).replace('.',','));
      const est=observed?'observed_register':'spatial_model_assumption';
      assert.equal(cell('bilantal_kallstatus'),'observed_register');assert.equal(cell('hushall_kallstatus'),est);assert.equal(cell('befolkning_kallstatus'),est);
      assert.equal(cell('status'),observed?'REGISTERBASERAD HUSHÅLLSMODELL LCA':'REGISTERBILAR MED SKATTAT HUSHÅLLSUNDERLAG');
      const resultRow=r.results.find(value=>value.key==='city|'+city);assert.deepEqual(resultRow.inputStatus,{cars:'observed_register',households:est,population:est});
    }
    const zeroProxy=d.baseMap.get('deso|1280|1280C2850');near(zeroProxy.cars,545,'Nollproxyområdets observerade bilar');near(zeroProxy.vkm,545*(kommunKm?kommunKm['1280'].kmPerCar:12753),'Nollproxyområdets körning');if(!observed)assert.equal(zeroProxy.households,0);
  });
  await check('B:s aktiva startunderlag är fristående och summerar till kommunnivå',()=>{
    const p=load('kallkod/data/household-project.json'),c=H.config(p.config||json('kallkod/data/config.json')),d=H.deterministic(p,c);
    assert.ok(p.d.length>0);assert.equal(p.metadata.dataYear,c.year);assert.ok(p.d.every(row=>Object.hasOwn(row,'bil')));
    assert.throws(()=>H.validate({...p,d:p.d.slice(1)},c),/samtliga DeSO/);
    aggregateClosure(d.baseMap,[...d.prep.cities.keys()].map(id=>({id})));
    for(const row of d.baseMap.values())near(row.total,V.KEYS.reduce((sum,key)=>sum+row[key],0),'B komponentsumma');
    const result=H.makeResult(d);
    for(const [status,label] of [['constructed_scenario','ILLUSTRATIVT HUSHÅLLSSCENARIO'],['observed_register','REGISTERBASERAD HUSHÅLLSMODELL LCA'],['user_scenario','EGET HUSHÅLLSSCENARIO'],['register_cars_partial','REGISTERBILAR MED SKATTAT HUSHÅLLSUNDERLAG']])assert.ok(V.resultCSV({...result,dataStatus:status},'1280','city').includes(label),'CSV-källstatus '+status);
  });
  await check('Klassfaktorerna återger Trafikverkets nationella direktutsläpp 2024 per fordonskm',()=>{
    const c=V.config(json('kallkod/data/config.json')),f=V.factors(c),T=V.NATIONAL_TTW_2024,N=V.NATIONAL_VKM;
    near(f[0].ttw,T.car,'Personbil',.002);near(f[1].ttw,T.van,'Lätt lastbil',.002);near(f[4].ttw,T.bus,'Buss',.002);
    near((N[2]*f[2].ttw+N[3]*f[3].ttw)/(N[2]+N[3]),T.heavy,'Tung lastbil',.002);near((N[5]*f[5].ttw+N[6]*f[6].ttw)/(N[5]+N[6]),T.mcmoped,'MC och moped',.002);
    near(T.car,9.81e12/67.05e9,'Källvärde personbil');
    const nat=N.reduce((s,v,i)=>s+v*1e9*f[i].ttw,0)/1e12;near(nat,9.81+1.82+4.21+.36+.09,'Nationell summa Mt',.003);
  });
  await check('Personbilens livscykel följer ICCT 2025 per drivlina',()=>{
    const one=type=>{const c=V.config();c.profiles[0].mix={[type]:1};return V.factors(V.config(c))[0];};
    const petrol=one('petrol'),hev=one('hev'),phev=one('phev'),diesel=one('diesel');
    near(petrol.vehicle,7200*1000/240000,'Förbränningsbil 7,2 t');near(hev.vehicle,7200*1000/240000,'Elhybrid 7,2 t');near(phev.vehicle,7200*1.097*1000/240000,'Laddhybrid 7,9 t');
    near(phev.battery,13.3*72.8*1000/240000,'Laddhybridens batteri 13,3 kWh');near(hev.battery,0,'Elhybridens batteri ingår i fordonet');
    near(diesel.maintenance,7,'Diesel underhåll 7 g/km');near(petrol.maintenance,5,'Bensin underhåll 5 g/km');
    near(hev.ttw/petrol.ttw,(.768*2.512*.92*73.4+1)/(2.512*.92*73.4+1),'Elhybridens relativa förbrukning 5,3/6,9');
    const b=V.config({phevElectric:.47}),a=V.config();assert.ok(V.factors(b)[0].ttw<V.factors(a)[0].ttw,'Högre elandel för privata laddhybrider i B');
  });
  await check('Fordonsandelar följer Trafikverkets normalvärden per vägtyp och DeSO-typ',()=>{
    const sh=(cls,ctx)=>V.sharesForRoad({id:'x',roadClass:cls},ctx);
    const m=sh('motorway','rural');near(m[2]+m[4],.06,'Europaväg lastbil utan släp + buss');near(m[3],.08,'Europaväg med släp');
    const t=sh('trunk','rural');near(t[2]+t[4],.04,'Riksväg utan släp + buss');near(t[3],.04,'Riksväg med släp');
    const r=sh('secondary','rural');near(r[2]+r[4],.025,'Sekundär länsväg');near(r[3],.025,'Sekundär länsväg med släp');
    const u=sh('secondary','urban');near(u[2]+u[4],.04,'Tätort utan släp + buss');near(u[3],.03,'Tätort med släp');
    for(const cls of Object.keys(V.ROAD_DEFAULTS))for(const ctx of ['urban','rural'])near(sh(cls,ctx).reduce((a,b)=>a+b,0),1,'Andelar summerar '+cls+' '+ctx);
    assert.equal(V.contextOf('2180A0010'),'rural');assert.equal(V.contextOf('1280C1010'),'urban');assert.equal(V.envOf('motorway','urban'),'r');assert.equal(V.envOf('tertiary','urban'),'u');
  });
  await check('Stad/landsbygd-faktorer är normerade till nationellt genomsnitt',()=>{
    const c=V.config(),u=V.factors(c,{},null,false,'u'),r=V.factors(c,{},null,false,'r'),avg=V.factors(c),s=c.environment.urbanShare;
    for(let i=0;i<7;i++)near(s*u[i].ttw+(1-s)*r[i].ttw,avg[i].ttw,'Vägt genomsnitt '+c.profiles[i].id,.01);
    const pc=V.config();pc.profiles[0].mix={petrol:1};pc.profiles[0].other=0;const pu=V.factors(V.config(pc),{},null,false,'u')[0],pr=V.factors(V.config(pc),{},null,false,'r')[0];near(pu.ttw/pr.ttw,187/173,'Bensinbil stad/landsbygd enligt Trafikverket (HBEFA 4.2)');
    assert.ok(u[0].ttw>r[0].ttw&&u[3].ttw>r[3].ttw,'Stadstrafik har högre direktutsläpp per km');
  });
  await check('Packade projektfiler är förlustfria och delar områdesgeometri',()=>{
    const raw=json('kallkod/data/project.json');assert.equal(raw.areas.ref,'omraden');assert.equal(raw.roads.packing,'vagvis-pack-1');
    const p=load('kallkod/data/project.json'),again=V.unpackProject(JSON.parse(JSON.stringify(V.packProject(p,{areasRef:'omraden'}))),V.packAreas(p.areas));
    assert.equal(JSON.stringify(again),JSON.stringify(p));
    const district=p.areas.find(a=>a.level==='district'),members=p.areas.filter(a=>a.level==='deso'&&district.members.includes(a.id));
    assert.equal(district.geometry.coordinates.length,members.reduce((n,a)=>n+(a.geometry.type==='Polygon'?1:a.geometry.coordinates.length),0));
    assert.equal(V.unpackProject(fixture()).roads.length,1,'Ej packade projekt passerar oförändrade');
  });
  await check('Kalibrerat läge träffar kommunreferensen och skalar inte uppmätta länkar',()=>{
    const p=load('kallkod/data/project.json'),c=V.config(p.config),d=V.deterministic(p,c);
    assert.equal(c.mode,'calibrated');
    for(const city of p.cities){near(d.base.agg.get('city|'+city.id).ttw,city.reference.groups.all,'TTW '+city.name,1e-6);}
    const bridge=p.roads.filter(r=>r.measurementId==='ORESUNDSBRON-2024');assert.equal(bridge.length,11);for(const r of bridge){assert.equal(r.quality,'measured');near(r.aadt,10346,'Öresundsbron per körbana');}
    const net=V.deterministic(p,{...c,mode:'network'}),info=d.base.calibration['1280|all'];
    near(info.measured+info.assumed,net.base.agg.get('city|1280').ttw,'Mätt + antagen TTW');
    assert.ok(info.measured>0&&Math.abs(info.scale-(info.target-info.measured)/info.assumed)<1e-12,'Endast antagen trafik skalas');
  });
  await check('B använder populationskonsistent körsträcka och privat laddhybridandel',()=>{
    const b=load('kallkod/data/household-project.json'),c=H.config(b.config);
    assert.equal(c.household.kmPerCar,12753);near(10950*(66.15e9/11410)/4977791,12753,'Härledning 10 950 × 5,80/4,98 miljoner',1e-4);
    assert.equal(c.phevElectric,.47);assert.equal(c.household.uncertainty.distance,.15);
  });
  const output={version:V.VERSION,executedAt:new Date().toISOString(),runtime:process.version,passed:reports.length,checks:reports,scope:'Numerik och källkod i Node. Ingen körning av grafiskt gränssnitt eller Streamlit.'};
  fs.mkdirSync(path.join(root,'testresultat'),{recursive:true});fs.writeFileSync(path.join(root,'testresultat/modell.json'),JSON.stringify(output,null,2)+'\n');
  console.log(reports.length+' kontroller godkända.');
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
