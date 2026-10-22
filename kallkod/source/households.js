/* Modell B · hushållens bilar. Bilarnas hela körning hänförs till hushållets hemområde, oavsett var bilen
   körs. Får aldrig läggas ihop med den territoriella modellen A.
   Direkt CO₂ räknas exakt som fliken Klimatpåverkan i Bilmodell v7 (klimat.js):
     CO₂ [kg] = hushåll × bilar per hushåll × km per bil × ((1 − elandel) × efIce + elandel × efEv)
     elandel  = elbilar + eldrift × laddhybrider (andelar av bilparken)
   Livscykeln = v7:s direkta CO₂ + bränslets tidigare led + fordon + batteri + underhåll + slutbehandling,
   med samma LCA-formler (core.js) som modell A. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'));else root.VagvisHouseholds=factory(root.Vagvis);})(typeof globalThis!=='undefined'?globalThis:this,function(V){
'use strict';
const FIELDS=[...V.KEYS,'electricity','fuelUpstream','direct','credit','biogenic','total','net'];
const Z90=1.6448536;
function shareYears(c){return Object.keys(c.household.shares).sort().reverse();}
function sharesFor(c,kk){const h=c.household;if(h.shareYear==='egna'){const o=h.own?.[kk];if(o)return {el:o.el,lh:o.lh,source:'Egna värden.'};const d=h.shares[shareYears(c)[0]].cities[kk];return {el:d.el,lh:d.lh,source:'Egna värden (utgår från '+h.shares[shareYears(c)[0]].name+').'};}return h.shares[h.shareYear].cities[kk];}
function validate(project,c){
 const p=V.validateProject(project),h=c.household;
 if(p.model!=='household'||!Array.isArray(p.households)||!h)throw Error('Hushållsunderlag och hushållsinställningar krävs.');
 const ids=new Set();for(const r of p.households){
  if(ids.has(r.kod))throw Error('Dubbelt hushållsområde: '+r.kod);ids.add(r.kod);
  if(!p.cities.some(x=>x.id===r.kk)||!p.areas.some(a=>a.city===r.kk&&a.level==='deso'&&a.id===r.kod))throw Error('Hushållsområdet saknar kommun eller DeSO-geometri: '+r.kod);
  if(!p.areas.some(a=>a.city===r.kk&&a.level==='district'&&a.id===r.sd))throw Error('Hushållsområdet saknar modellområde: '+r.kod);
  for(const k of ['hh','bph','km','bef'])if(!Number.isFinite(r[k])||r[k]<0)throw Error('Ogiltigt hushållsvärde '+k+' i '+r.kod);
 }
 if(!h.shares||!(h.shareYear==='egna'||h.shares[h.shareYear]))throw Error('Okänt år för elbilsandelar: '+h.shareYear);
 for(const city of p.cities){
  const s=sharesFor(c,city.id),a=h.activity?.[city.id];
  if(!s||!Number.isFinite(s.el)||!Number.isFinite(s.lh)||s.el<0||s.lh<0||s.el+s.lh>1)throw Error('Elbilar och laddhybrider i '+city.name+' ska tillsammans vara 0–100 %.');
  if(!a||!(a.p5>0)||!(a.p95>=a.p5))throw Error('Fordonskm-intervall från Bilmodell v7 saknas för '+city.name+'.');
 }
 for(const k of ['efIce','efEv'])if(!Number.isFinite(h[k])||h[k]<0||h[k]>2)throw Error('Ogiltig utsläppsfaktor '+k+'.');
 if(!Number.isFinite(h.eldrift)||h.eldrift<0||h.eldrift>1)throw Error('Laddhybridernas eldrift ska vara 0–1.');
 for(const k of ['efIce','efEv','eldrift']){const v=h.ranges?.[k];if(!Array.isArray(v)||v.length!==3||v.some(x=>!Number.isFinite(x)||x<0))throw Error('Ogiltigt intervall för '+k+'.');}
 if(!Number.isFinite(h.spatialCV)||h.spatialCV<0||h.spatialCV>3)throw Error('Ogiltig lokal fördelningsosäkerhet.');
 const ice=Object.values(h.iceMix);if(ice.some(x=>!Number.isFinite(x)||x<0)||Math.abs(ice.reduce((a,b)=>a+b,0)-1)>1e-8)throw Error('Fördelningen inom förbränningsbilar ska summera till 1.');
 const M=h.measures;if(M){if(M.state!=null&&typeof M.state!=='object')throw Error('Ogiltigt åtgärdstillstånd.');if(M.newDwellings!=null&&!(Number(M.newDwellings)>=0&&Number(M.newDwellings)<=1e6))throw Error('Antalet nya bostäder ska vara 0–1 000 000.');if(M.sigmaS!=null&&!(Number(M.sigmaS)>=0&&Number(M.sigmaS)<=3))throw Error('Ogiltig överföringsosäkerhet.');const sc=M.scope;if(sc&&!['all','city','district','deso'].includes(sc.level))throw Error('Okänd omfattning för åtgärderna.');if(sc&&sc.level!=='all'&&!p.cities.some(x=>x.id===sc.city))throw Error('Åtgärdernas kommun finns inte i underlaget.');}
 validateArea(p,c);
 if(p.households.length>2000)throw Error('För många hushållsområden för denna version.');
 return p;
}
/* Bilparken per kommun: elbilar, laddhybrider och övriga bilar fördelade på bensin, diesel och biogas.
   Scenariots ökade elandel flyttar bilar från övriga drivlinor till el (samma regel som modell A). */
function fleet(c,kk,scenario){const s=sharesFor(c,kk),ice=1-s.el-s.lh,mix={};for(const [k,v]of Object.entries(c.household.iceMix))mix[k]=v*ice;mix.bev=s.el;mix.phev=s.lh;return scenario?V.scenarioMix(mix,c.electrify):mix;}
/* Bränslets tidigare led i förhållande till avgasutsläppen, ur Vägvis bränslefaktorer och fördelningen
   bensin/diesel/biogas. Läggs på v7:s avgasfaktor så att livscykeln vilar på samma bränsleåtgång. */
function wttRatio(c){let w=0,t=0;for(const [k,share]of Object.entries(c.household.iceMix)){const f=c.fuels[k];if(!f)continue;w+=share*(f.fossil*f.wtt+(1-f.fossil)*f.bio);t+=share*f.fossil*f.ttw;}return t?w/t:0;}
function lcaBase(c,mix){const x=V.clone(c);x.profiles[0].mix=mix;const f=V.factors(V.config(x))[0];return {vehicle:f.vehicle,battery:f.battery,maintenance:f.maintenance,endoflife:f.endoflife,credit:f.credit};}
/* g per fordonskm. d = v7:s dragna faktorer (ice, ev, eld; 1 = centralt), m = Vägvis LCA-faktorer. */
function perKm(c,kk,base,mix,ratio,d={},m={}){
 const h=c.household,el=mix.bev||0,lh=mix.phev||0,ev=Math.min(1,el+h.eldrift*(d.eld??1)*lh);
 const ttw=(1-ev)*h.efIce*(d.ice??1)*1000,electricity=ev*h.efEv*(d.ev??1)*1000,fuelUpstream=ttw*ratio*(m.upstream??1);
 const pl=(m.production??1)/(m.life??1),il=1/(m.life??1);
 const o={ttw,electricity,fuelUpstream,wtt:electricity+fuelUpstream,vehicle:base.vehicle*pl,battery:base.battery*pl,maintenance:base.maintenance,endoflife:base.endoflife*il,credit:base.credit*il,biogenic:0,direct:ttw+electricity,ev,el,lh};
 o.total=V.KEYS.reduce((s,k)=>s+o[k],0);o.net=o.total-o.credit;return o;
}
function prepare(project,cfg){
 const c=V.config(cfg),p=validate(project,c),meta=new Map(),approx=new Set(p.areas.filter(a=>a.approximate).map(a=>a.level+'|'+a.city+'|'+a.id));
 for(const x of p.cities)meta.set('city|'+x.id,{key:'city|'+x.id,city:x.id,id:x.id,name:x.name,level:'city',version:'2018'});
 for(const a of p.areas){const key=a.level+'|'+a.city+'|'+a.id;meta.set(key,{key,city:a.city,id:a.id,name:a.name,level:a.level,version:a.version,...(approx.has(key)?{approximate:true}:{})});}
 const rows=p.households.map(r=>({...r,vkm:r.hh*r.bph*r.km,keys:['city|'+r.kk,'deso|'+r.kk+'|'+r.kod,'district|'+r.kk+'|'+r.sd]}));
 const ratio=wttRatio(c),cities={};
 for(const x of p.cities){const bm=fleet(c,x.id,false),sm=fleet(c,x.id,true),a=c.household.activity[x.id];cities[x.id]={baseMix:bm,scenarioMix:sm,base:lcaBase(c,bm),scenario:lcaBase(c,sm),sigma:Math.log(a.p95/a.p5)/(2*Z90)};}
 const area=areaSetup(p,c,rows);
 return {c,p,meta,rows,ratio,cities,area,measures:measureSetup(p,c,rows,area)};
}
/* Mobilitetsåtgärder (2.0.4) med Bilmodell v7:s egen kod (mc.js: effekt, centralPar, dragPar) och v7:s
   åtgärdsdata (atgarder.js). Åtgärderna påverkar bara scenariot. Omfattning: alla kommuner, en kommun,
   ett stadsdelsområde eller en DeSO. Nya bostäder (förtätning) räknas som i v7:s flik Befintliga områden:
   fler hushåll med områdets utgångsläge, täthetseffekt och åtgärder som bara gäller nya bostäder. */
const G=typeof globalThis!=='undefined'?globalThis:{};
function v7(){const w=G.window||G;return {MC:w.MC||G.MC,ATG:w.ATGARDER||G.ATGARDER,OS:w.OSAKERHET||G.OSAKERHET};}
function inScope(r,sc){if(!sc||sc.level==='all')return true;if(r.kk!==sc.city)return false;if(sc.level==='city')return true;if(sc.level==='district')return r.sd===sc.id;if(sc.level==='deso')return r.kod===sc.id;return false;}
function anyActive(st){return !!st&&Object.values(st).some(x=>x&&x.pa);}
function measureSetup(p,c,rows,area=null){
 const M=c.household.measures;if(!M)return null;const nya=Math.max(0,Number(M.newDwellings)||0);if(!anyActive(M.state)&&!(nya>0))return null;
 const {MC}=v7();if(!MC||typeof MC.effekt!=='function')throw Error('Åtgärderna räknas med Bilmodell v7:s mc.js, som inte är inläst.');
 const sc=M.scope||{level:'all'},mask=rows.map(r=>inScope(r,sc));if(!mask.some(Boolean))throw Error('Åtgärdernas område finns inte i underlaget.');
 const hh=rows.reduce((s,r,i)=>s+(mask[i]?r.hh:0),0),kontext={andelNy:nya>0?nya/(hh+nya):0,tathet:nya>0?nya/hh:0,pushExtra:0},state=M.state||{};
 if(area)mask[area.idx]=false; // Områdesscenariot (2.0.5) gäller i sin DeSO; åtgärderna här gäller övriga områden.
 const e=MC.effekt(state,kontext,MC.centralPar());
 return {mask,scope:sc,state,kontext,households:hh,newDwellings:nya,growth:1+(nya>0?nya/hh:0),fB:e.fB,fV:e.fV,fC:e.fC,sigmaS:Number(M.sigmaS)||0};
}
/* fC (hastighet, körsätt) ändrar utsläppen per km från bränsle och el, inte tillverkningen. */
function scaleDirect(f,cf){if(cf===1)return f;const o={...f};for(const k of ['ttw','electricity','fuelUpstream','wtt','direct'])o[k]=f[k]*cf;o.total=V.KEYS.reduce((s,k)=>s+o[k],0);o.net=o.total-o.credit;return o;}
function factors(prep,d,m,scenario){return Object.fromEntries(Object.entries(prep.cities).map(([id,x])=>[id,perKm(prep.c,id,scenario?x.scenario:x.base,scenario?x.scenarioMix:x.baseMix,prep.ratio,d,m)]));}
function zero(){return Object.fromEntries([...FIELDS,'vkm','hh','bef','cars'].map(k=>[k,0]));}
function aggregate(prep,efs,activity,scenario){
 const ms=scenario?prep.measures:null,efIn=ms?Object.fromEntries(Object.entries(efs).map(([k,f])=>[k,scaleDirect(f,ms.fC)])):null;
 const as=scenario?prep.area:null,tc=scenario?1+prep.c.trafficChange:1;
 const a=new Map();for(let i=0;i<prep.rows.length;i++){
  if(as&&i===as.idx){const r=prep.rows[i],x=areaParts(as,r,efs[r.kk],activity?.[i]??1,tc);addPart(a,r.keys,x.old);if(x.nu)addPart(a,r.keys,x.nu);continue;}
  const r=prep.rows[i],inM=!!(ms&&ms.mask[i]),g=inM?ms.growth:1,km=r.vkm*(activity?.[i]??1)*(scenario?1+prep.c.trafficChange:1)*(inM?g*ms.fV:1),f=inM?efIn[r.kk]:efs[r.kk];
  for(const key of r.keys){if(!a.has(key))a.set(key,zero());const z=a.get(key);z.vkm+=km;z.hh+=r.hh*g;z.bef+=r.bef*g;z.cars+=r.hh*g*r.bph*(inM?ms.fB:1);
   for(const k of FIELDS)z[k]+=km*f[k]/1e6;
  }
 }return a;
}
/* Områdesscenario (2.0.5): en DeSO med ny bebyggelse och mobilitetsåtgärder, som Bilmodell v7:s flikar
   Befintliga områden och Nya områden. Gäller bara scenariot; basfallet är oförändrat.
   Utgångsläge för de nya hushållen:
   - area:   som området i dag (v7 Befintliga områden, förtätning): fler hushåll med områdets bilinnehav och
             körsträcka, täthetseffekt, åtgärder för alla hushåll och åtgärder för nya bostäder vägda med deras andel.
   - analog: som ett annat befintligt område (v7 Nya områden): hushållsvägt bilinnehav och bilvägd körsträcka.
   - own:    egna värden, till exempel målnivåer i en mobilitetsstrategi.
   I analog och own räknas de nya hushållen som i v7 Nya områden: alla åtgärder gäller dem fullt ut (andelNy = 1),
   parkeringstalet är ett tak för bilar per hushåll och räknas som push när det begränsar. De befintliga hushållen
   får åtgärderna bara om applyExisting är satt (då utan åtgärder som bara gäller nya bostäder).
   De nya hushållens bilpark kan ges egna andelar elbilar och laddhybrider. */
const AS_MODES=['area','analog','own'],ONE={fB:1,fV:1,fC:1};
function aggRows(rows){let hh=0,bef=0,bilar=0,kmBil=0;for(const r of rows){hh+=r.hh;bef+=r.bef;bilar+=r.bph*r.hh;kmBil+=r.km*r.bph*r.hh;}return {n:rows.length,hh,bef,bph:hh?bilar/hh:0,km:bilar?kmBil/bilar:0};}
function analogRows(p,a){if(!a)return [];return a.kod?p.households.filter(r=>r.kod===a.kod):p.households.filter(r=>r.kk===a.kk&&r.sd===a.sd);}
function tillampaNy(B0,km0,e,cap){if(!(B0>0))return {B:0,K:km0,V:0,Bfore:0,takBinder:false};const B=B0*e.fB,K=B0*km0*e.fV/B,Bt=cap>0?Math.min(B,cap):B;return {B:Bt,K,V:Bt*K,Bfore:B,takBinder:cap>0&&B>cap};}
function validateArea(p,c){
 const s=c.areaScenario;if(s==null)return;if(typeof s!=='object'||Array.isArray(s))throw Error('Ogiltigt områdesscenario.');if(!s.active)return;
 const r=p.households.find(x=>x.kk===s.city&&x.kod===s.deso);if(!r)throw Error('Områdesscenariots DeSO finns inte i hushållsunderlaget: '+s.deso);
 const N=Number(s.newDwellings??0),mode=s.base?.mode||'area',fin=(v,lo,hi,t)=>{if(!(Number.isFinite(Number(v))&&Number(v)>=lo&&Number(v)<=hi))throw Error(t);};
 fin(N,0,1e6,'Antalet nya bostäder ska vara 0–1 000 000.');if(s.persons!=null)fin(s.persons,.5,10,'Invånare per ny bostad ska vara 0,5–10.');
 if(!AS_MODES.includes(mode))throw Error('Okänt utgångsläge för de nya hushållen.');
 if(mode==='analog'&&!analogRows(p,s.base.analog).length)throw Error('Det motsvarande området finns inte i underlaget.');
 if(mode==='own'){fin(s.base.bph,0,5,'Bilar per hushåll ska vara 0–5.');fin(s.base.km,0,100000,'Körsträcka per bil ska vara 0–100 000 km.');}
 if(s.parking!=null)fin(s.parking,0,5,'Parkeringstalet ska vara 0–5 platser per bostad.');
 const el=s.ev?.el,lh=s.ev?.lh;if(el!=null)fin(el,0,1,'Elbilsandelen ska vara 0–100 %.');if(lh!=null)fin(lh,0,1,'Laddhybridandelen ska vara 0–100 %.');
 if(el!=null||lh!=null){const sh=sharesFor(c,s.city);if((el??sh.el)+(lh??sh.lh)>1+1e-9)throw Error('Elbilar och laddhybrider bland de nya hushållens bilar ska tillsammans vara högst 100 %.');}
 if(s.measures?.state!=null&&typeof s.measures.state!=='object')throw Error('Ogiltigt åtgärdstillstånd i områdesscenariot.');
 if(s.newCV!=null)fin(s.newCV,0,2,'Ogiltig osäkerhet för de nya hushållens utgångsläge.');if(s.sigmaS!=null)fin(s.sigmaS,0,3,'Ogiltig överföringsosäkerhet.');
}
function newMix(c,kk,s){const sh=sharesFor(c,kk),el=s.ev?.el??sh.el,lh=s.ev?.lh??sh.lh,ice=1-el-lh,mix={};for(const [k,v]of Object.entries(c.household.iceMix))mix[k]=v*ice;mix.bev=el;mix.phev=lh;return {mix,el,lh};}
function areaSetup(p,c,rows){
 const s=c.areaScenario;if(!s||!s.active)return null;const {MC}=v7();if(!MC||typeof MC.effekt!=='function')throw Error('Områdesscenariot räknas med Bilmodell v7:s mc.js, som inte är inläst.');
 const idx=rows.findIndex(r=>r.kk===s.city&&r.kod===s.deso);if(idx<0)throw Error('Områdesscenariots DeSO finns inte i underlaget: '+s.deso);
 const r=rows[idx],N=Math.max(0,Math.round(Number(s.newDwellings)||0)),mode=s.base?.mode||'area',state=s.measures?.state||{},any=anyActive(state),C=MC.centralPar();
 const out={idx,row:r,city:r.kk,deso:r.kod,mode,N,persons:s.persons!=null&&Number(s.persons)>0?Number(s.persons):r.bef/r.hh,state,anyMeasures:any,sigmaS:Number(s.sigmaS)||0,newCV:s.newCV!=null?Number(s.newCV):.2,presetId:s.presetId||'egen'};
 if(mode==='area'){const kontext={andelNy:N>0?N/(r.hh+N):0,tathet:N>0?N/r.hh:0,pushExtra:0},e=MC.effekt(state,kontext,C);out.area={kontext,growth:1+(N>0?N/r.hh:0),fB:e.fB,fV:e.fV,fC:e.fC};return out;}
 const apply=!!s.applyExisting&&any,kOld={andelNy:0,tathet:0,pushExtra:0},eo=apply?MC.effekt(state,kOld,C):ONE;out.old={apply,kontext:kOld,fB:eo.fB,fV:eo.fV,fC:eo.fC};
 let bph0,km0,source;if(mode==='analog'){const a=s.base.analog,A=aggRows(analogRows(p,a));bph0=A.bph;km0=A.km;source={...a,n:A.n,hh:A.hh};}else{bph0=Number(s.base.bph);km0=Number(s.base.km);source=null;}
 const cap=s.parking!=null&&Number(s.parking)>0?Number(s.parking):0,kNew={andelNy:1,tathet:0,pushExtra:cap>0&&cap<bph0?1:0},en=MC.effekt(state,kNew,C),t=tillampaNy(bph0,km0,en,cap);
 const nm=newMix(c,r.kk,s),smix=V.scenarioMix(nm.mix,c.electrify),lca=lcaBase(c,smix);
 out.nu={kontext:kNew,bph0,km0,source,cap,fB:en.fB,fV:en.fV,fC:en.fC,...t,el:nm.el,lh:nm.lh,mix:smix,lca,ef:null};
 return out;
}
/* Områdets DeSO i scenariot: befintliga hushåll (old) och nya hushåll (nu). eff = dragna effekter i simuleringen. */
function areaParts(as,r,ef,act,tc,eff=null){
 if(as.mode==='area'){const e=eff?.area||as.area,g=as.area.growth;return {old:{km:r.vkm*act*tc*g*e.fV,f:scaleDirect(ef,e.fC),hh:r.hh*g,bef:r.bef+as.N*as.persons,cars:r.hh*g*r.bph*e.fB},nu:null};}
 const eo=eff?.old||as.old,old={km:r.vkm*act*tc*eo.fV,f:scaleDirect(ef,eo.fC),hh:r.hh,bef:r.bef,cars:r.hh*r.bph*eo.fB};if(!(as.N>0))return {old,nu:null};
 const en=eff?.nu||as.nu,t=eff?tillampaNy(as.nu.bph0,as.nu.km0,en,as.nu.cap):as.nu,u=eff?.uN??1,z=eff?.zf??1;
 return {old,nu:{km:as.N*t.V*u*z*tc,f:scaleDirect(eff?.efNew||as.nu.ef,en.fC),hh:as.N,bef:as.N*as.persons,cars:as.N*t.B*u}};
}
function addPart(a,keys,x){for(const key of keys){if(!a.has(key))a.set(key,zero());const z=a.get(key);z.vkm+=x.km;z.hh+=x.hh;z.bef+=x.bef;z.cars+=x.cars;for(const k of FIELDS)z[k]+=x.km*x.f[k]/1e6;}}
function areaEf(prep){const as=prep.area;if(as&&as.nu&&!as.nu.ef)as.nu.ef=perKm(prep.c,as.city,as.nu.lca,as.nu.mix,prep.ratio);}
function sumPart(x){const o={vkm:x.km,hh:x.hh,bef:x.bef,cars:x.cars};for(const k of FIELDS)o[k]=x.km*x.f[k]/1e6;return o;}
/* Detaljer för vyn Områdesscenario: områdets DeSO i dag och i scenariot, uppdelat på befintliga och nya hushåll. */
function areaDetail(project,cfg){
 const d=deterministic(project,cfg),prep=d.prep,as=prep.area;if(!as)return null;const r=as.row,kk=as.city,tc=1+prep.c.trafficChange;
 const base=sumPart({km:r.vkm,f:d.factors[kk],hh:r.hh,bef:r.bef,cars:r.hh*r.bph}),x=areaParts(as,r,d.scenarioFactors[kk],1,tc),old=sumPart(x.old),nu=x.nu?sumPart(x.nu):null,scen={};
 for(const k of Object.keys(old))scen[k]=old[k]+(nu?nu[k]:0);
 return {as,prep,base,old,nu,scen,keys:r.keys,deterministic:d,factors:{base:d.factors[kk],scenario:d.scenarioFactors[kk],nu:as.nu?.ef||null}};
}
/* Snabb osäkerhet för vyn (90 %, direkt CO₂ som i Bilmodell v7): åtgärdernas effekter, utsläppsfaktorer, eldrift och
   kommunens fordonskm dras med v7:s mc.js; de nya hushållens utgångsläge med en log-normal faktor (CV newCV). */
function areaMC(project,cfg,opt={}){
 const prep=prepare(project,cfg),as=prep.area;if(!as)return null;const {MC,OS}=v7(),c=prep.c,h=c.household,kk=as.city,r=as.row,cm=prep.cities[kk],tc=1+c.trafficChange;
 const bas=(mix)=>({el:mix.bev||0,lh:mix.phev||0,eldrift:h.eldrift,efIce:h.efIce,efEv:h.efEv}),b0=bas(cm.baseMix),b1=bas(cm.scenarioMix),bN=as.nu?bas(as.nu.mix):null;
 const n=opt.n||OS.mc.n,rng=MC.rng(opt.seed??OS.mc.seed),A={base:[],scen:[],diff:[],B:[],K:[],V:[],perPers:[]};
 for(let i=0;i<n;i++){const par=MC.dragPar(rng,OS.mc.rho,as.sigmaS),f=MC.basFaktor(par,kk),t0=r.vkm*f*MC.efDragen(b0,par)/1000;let t1;
  if(as.mode==='area'){const e=MC.effekt(as.state,as.area.kontext,par);t1=r.vkm*f*tc*as.area.growth*e.fV*e.fC*MC.efDragen(b1,par)/1000;}
  else{const eo=as.old.apply?MC.effekt(as.state,as.old.kontext,par):ONE;t1=r.vkm*f*tc*eo.fV*eo.fC*MC.efDragen(b1,par)/1000;
   if(as.N>0){const en=MC.effekt(as.state,as.nu.kontext,par),t=tillampaNy(as.nu.bph0,as.nu.km0,en,as.nu.cap),u=V.lognormal(as.newCV,rng),tn=as.N*t.V*u*f*tc*en.fC*MC.efDragen(bN,par)/1000;t1+=tn;A.B.push(t.B*u);A.K.push(t.K);A.V.push(t.V*u);A.perPers.push(tn*1000/(as.N*as.persons));}}
  A.base.push(t0);A.scen.push(t1);A.diff.push(t1-t0);}
 const q=a=>a.length?MC.sammanfatta(a):null;return {n,base:q(A.base),scen:q(A.scen),diff:q(A.diff),nu:as.N>0&&as.nu?{B:q(A.B),K:q(A.K),V:q(A.V),perPers:q(A.perPers)}:null};
}
function deterministic(project,cfg){const prep=prepare(project,cfg),ef=factors(prep,{},{},false),sf=factors(prep,{},{},true);areaEf(prep);return {prep,base:aggregate(prep,ef,null,false),scenario:aggregate(prep,sf,null,true),factors:ef,scenarioFactors:sf};}
/* Triangelfördelning [centralt, minst, mest] som drag() i Bilmodell v7:s mc.js. */
function tri(v,u){const lo=Math.min(v[1],v[2]),hi=Math.max(v[1],v[2]);if(!(hi>lo))return v[0];const c=Math.min(hi,Math.max(lo,v[0])),F=(c-lo)/(hi-lo),x=v[2]<v[1]?1-u:u;return x<F?lo+Math.sqrt(x*(hi-lo)*(c-lo)):hi-Math.sqrt((1-x)*(hi-lo)*(hi-c));}
function normal(r){return Math.sqrt(-2*Math.log(Math.max(1e-12,r())))*Math.cos(2*Math.PI*r());}
function directStats(a){const s=Float64Array.from(a).sort(),q=p=>{const h=(s.length-1)*p,i=Math.floor(h);return i+1<s.length?s[i]+(h-i)*(s[i+1]-s[i]):s[s.length-1];};return {mean:Array.from(a).reduce((t,x)=>t+x,0)/a.length,p025:q(.025),p05:q(.05),p50:q(.5),p95:q(.95),p975:q(.975)};}
async function simulate(project,cfg,onProgress=()=>{}){
 const d=deterministic(project,cfg),p=d.prep,c=p.c,h=c.household,n=Math.floor(c.iterations),r=V.rng(c.seed),draws=new Map();
 if(d.base.size*n>1e7)throw Error('För många områden och simuleringar. Minska antalet simuleringar.');
 const keys=Array.from(d.base.keys()),K=keys.length,kidx=new Map(keys.map((k,i)=>[k,i])),rowIdx=p.rows.map(r=>r.keys.map(k=>kidx.get(k)));
 const groups=p.p.cities.map(x=>({id:x.id,city:kidx.get('city|'+x.id),deso:keys.map((k,i)=>k.startsWith('deso|'+x.id+'|')?i:-1).filter(i=>i>=0),district:keys.map((k,i)=>k.startsWith('district|'+x.id+'|')?i:-1).filter(i=>i>=0)}));
 const B=keys.map(()=>new Float64Array(n)),S=keys.map(()=>new Float64Array(n)),D=keys.map(()=>new Float64Array(n)),tc=1+c.trafficChange,ms=p.measures,rM=V.rng((c.seed^0x2545F491)>>>0),tools=v7();
 // Områdesscenariot (2.0.5) dras i en egen slumpström, så att basfallets och åtgärdernas dragningar är oförändrade.
 const as=p.area,rA=as?V.rng((c.seed^0x5851F42D)>>>0):null;
 let maxClosureError=0;
 for(let k=0;k<n;k++){
  const u=c.uncertainty,m={production:V.lognormal(u.production,r),life:V.lognormal(u.life,r),upstream:V.lognormal(u.upstream,r)};
  const dv={ice:tri(h.ranges.efIce,r())/h.ranges.efIce[0],ev:tri(h.ranges.efEv,r())/h.ranges.efEv[0],eld:tri(h.ranges.eldrift,r())/h.ranges.eldrift[0]},zb=normal(r);
  const ef=factors(p,dv,m,false),sf=factors(p,dv,m,true),act=new Float64Array(p.rows.length),totals={},weighted={};
  // Åtgärdernas effekt dras med v7:s dragPar i en egen slumpström, så att basfallets dragningar är desamma med och utan åtgärder.
  let mV=1,mC=1,sfIn=null;if(ms){const e=tools.MC.effekt(ms.state,ms.kontext,tools.MC.dragPar(rM,tools.OS.mc.rho,ms.sigmaS));mV=ms.growth*e.fV;mC=e.fC;sfIn=Object.fromEntries(Object.entries(sf).map(([id,f])=>[id,scaleDirect(f,mC)]));}
  let eff=null;if(as){const par=tools.MC.dragPar(rA,tools.OS.mc.rho,as.sigmaS);if(as.mode==='area')eff={area:tools.MC.effekt(as.state,as.area.kontext,par)};else{eff={old:as.old.apply?tools.MC.effekt(as.state,as.old.kontext,par):ONE,nu:tools.MC.effekt(as.state,as.nu.kontext,par),uN:V.lognormal(as.newCV,rA),efNew:perKm(c,as.city,as.nu.lca,as.nu.mix,p.ratio,dv,m)};eff.zf=Math.exp(p.cities[as.city].sigma*zb);}}
  for(const x of p.p.cities){totals[x.id]=0;weighted[x.id]=0;}
  for(let j=0;j<p.rows.length;j++){const row=p.rows[j];act[j]=V.lognormal(h.spatialCV,r);totals[row.kk]+=row.vkm;weighted[row.kk]+=row.vkm*act[j];}
  // Lokal fördelning flyttar körning mellan områden utan att ändra kommunens fordonskm. Kommunens
  // fordonskm varierar som i Bilmodell v7: exp(sigma × z), sigma ur v7:s P5–P95, gemensamt z i dragningen.
  const tot=new Float64Array(K),dir=new Float64Array(K),sc=new Float64Array(K);
  for(let j=0;j<p.rows.length;j++){const row=p.rows[j],km=row.vkm*act[j]*(weighted[row.kk]?totals[row.kk]/weighted[row.kk]:1)*Math.exp(p.cities[row.kk].sigma*zb),t=km*ef[row.kk].total/1e6,dd=km*ef[row.kk].direct/1e6,ss=as&&j===as.idx?(()=>{const x=areaParts(as,row,sf[row.kk],km/row.vkm,tc,eff);return x.old.km*x.old.f.total/1e6+(x.nu?x.nu.km*x.nu.f.total/1e6:0);})():ms&&ms.mask[j]?km*tc*mV*sfIn[row.kk].total/1e6:km*tc*sf[row.kk].total/1e6;for(const i of rowIdx[j]){tot[i]+=t;dir[i]+=dd;sc[i]+=ss;}}
  for(let i=0;i<K;i++){B[i][k]=tot[i];D[i][k]=dir[i];S[i][k]=sc[i];}
  for(const g of groups)for(const level of ['deso','district']){let s=0;for(const i of g[level])s+=tot[i];maxClosureError=Math.max(maxClosureError,Math.abs(s-tot[g.city]));}
  if(k%50===0){onProgress(k/n);await new Promise(resolve=>setTimeout(resolve,0));}
 }
 for(let i=0;i<K;i++){const diff=new Float64Array(n);for(let k=0;k<n;k++)diff[k]=S[i][k]-B[i][k];draws.set(keys[i],{base:B[i],scenario:S[i],difference:diff,direct:D[i]});}
 const results=[];for(const [key,meta]of p.meta){const x=draws.get(key);results.push({...meta,central:d.base.get(key)||null,scenarioCentral:d.scenario.get(key)||null,base:x?V.stats(x.base):null,direct:x?directStats(x.direct):null,scenario:x?V.stats(x.scenario):null,difference:x?V.stats(x.difference):null});}
 const perCity=Object.fromEntries(p.p.cities.map(x=>{const f=d.factors[x.id],s=sharesFor(c,x.id);return [x.id,{gPerKmDirect:f.direct,gPerKmLifecycle:f.total,electricShareOfKm:f.ev,el:s.el,lh:s.lh,shareSource:s.source}];}));
 const warnings=['Hushållsmodell: bilarnas hela körning hänförs till hemområdet. Ingen territoriell fördelning och ingen tung trafik.','Direkt CO₂ är samma beräkning som fliken Klimatpåverkan i Bilmodell v7. Elbilsandelar: '+(h.shareYear==='egna'?'egna värden':h.shares[h.shareYear].name)+'. Aktivitetsdata: 2023, DeSO 2018.','Livscykeltillägget använder Vägvis LCA-formler för fordon, batteri, underhåll och slutbehandling. Bränslets tidigare led räknas i proportion till v7:s avgasfaktor. Elens utsläpp ingår redan i v7:s faktor för elbilar.','Osäkerheten använder Bilmodell v7:s fördelningar för utsläppsfaktorer, eldrift och kommunens fordonskm. Lokal fördelnings-CV och LCA-faktorernas CV är Vägvis antaganden.','Fasta fordonsandelar har ingen egen statistiskt skattad osäkerhet här. Intervallet omfattar inte alla möjliga systematiska fel.'];
 if(as)warnings.push('Scenariot innehåller ett områdesscenario för DeSO '+as.deso+(as.N>0?' med '+as.N+' nya bostäder':'')+' ('+({area:'utgångsläge som området, som v7 Befintliga områden',analog:'utgångsläge från ett motsvarande område, som v7 Nya områden',own:'egna värden för de nya hushållen'})[as.mode]+'). Effekterna dras med v7:s fördelningar i en egen slumpström'+(as.mode!=='area'&&as.N>0?', och de nya hushållens utgångsläge med en log-normal faktor (CV '+as.newCV+')':'')+'. Basfallet påverkas inte.'+(ms?' Åtgärderna under Åtgärder & underlag gäller övriga områden.':''));
 if(ms)warnings.push('Scenariot innehåller mobilitetsåtgärder'+(ms.newDwellings>0?' och '+ms.newDwellings+' nya bostäder':'')+', räknade med Bilmodell v7:s åtgärdsmodell (mc.js). Effekten dras med v7:s fördelningar'+(ms.sigmaS>0?' och överföringsosäkerheten från referenskontrollen':'')+'. Basfallet påverkas inte.');
 if(c.year!==p.p.metadata.dataYear)warnings.push('Beräkningsår '+c.year+' har valts men hushållsunderlaget avser fortfarande '+p.p.metadata.dataYear+'. Ingen automatisk årsframskrivning.');
 onProgress(1);return {model:'household',dataYear:p.p.metadata.dataYear,version:V.VERSION,created:new Date().toISOString(),config:c,projectTitle:p.p.title,isDemo:false,reference:[],metrics:{totalVkm:p.rows.reduce((s,x)=>s+x.vkm,0),households:p.rows.reduce((s,x)=>s+x.hh,0),householdAreas:p.rows.length,wttRatio:p.ratio,perCity,areaScenario:as?{city:as.city,deso:as.deso,mode:as.mode,newDwellings:as.N,persons:as.persons,presetId:as.presetId,newBph:as.nu?.B??null,newKm:as.nu?.K??null,parking:as.nu?.cap||null}:null,measures:ms?{scope:ms.scope,kontext:ms.kontext,households:ms.households,newDwellings:ms.newDwellings,growth:ms.growth,fB:ms.fB,fV:ms.fV,fC:ms.fC,sigmaS:ms.sigmaS,packageId:h.measures?.packageId||'egna'}:null},warnings,scales:{},results,maxClosureError,draws};
}
/* Bilmodell v7:s eget 90-procentsintervall för hela kommunen, utan åtgärder, med v7:s mc.js (window.MC):
   samma n, frö och dragningar som fliken Klimatpåverkan i v7. */
function v7Interval(project,cfg,MC){
 if(!MC||typeof MC.simulera!=='function')return null;const c=V.config(cfg),p=validate(project,c),h=c.household,s=MC.simulera({},{andelNy:0,tathet:0},{sigmaS:0}),out={};
 for(const x of p.cities){const fkm=p.households.filter(r=>r.kk===x.id).reduce((a,r)=>a+r.hh*r.bph*r.km,0),sh=sharesFor(c,x.id),bas={el:sh.el,lh:sh.lh,eldrift:h.eldrift,efIce:h.efIce,efEv:h.efEv},t=[];
  for(let i=0;i<s.n;i++)t.push(fkm*MC.basFaktor(s.par[i],x.id)*MC.efDragen(bas,s.par[i])/1000);
  const q=MC.sammanfatta(t);out[x.id]={p5:q.p5,p50:q.p50,p95:q.p95,n:s.n};}
 return out;
}
function csvCell(x){let s=String(x??'');if(/^[=+\-@]/.test(s)&&!Number.isFinite(Number(s)))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
function resultCSV(r,city,level){const h=r.config.household,yr=h.shareYear==='egna'?'egna värden':h.shares[h.shareYear].name,head=['modell','underlagsar','elbilsandelar','kommun','niva','omrade_id','namn','ungefarlig_yta','status','invanare','hushall','bilar','fordonskm','direkt_tCO2_som_bilmodell_v7','direkt_kgCO2_per_invanare','direkt_kgCO2_per_hushall','direkt_P2_5','direkt_P5','direkt_P95','direkt_P97_5','avgaser_tCO2','el_tCO2','bransle_tidigare_led_tCO2e','fordon_tCO2e','batteri_tCO2e','underhall_tCO2e','slutbehandling_tCO2e','livscykel_tCO2e','livscykel_P2_5','livscykel_P97_5','scenario_livscykel_tCO2e','scenario_direkt_tCO2','skillnad_P2_5','skillnad_P97_5','potentiell_atervinningskredit_separat_tCO2e'],lines=[head.map(csvCell).join(';')];
 for(const x of r.results.filter(x=>(!city||x.city===city)&&(!level||x.level===level))){const c=x.central,d=x.direct,a=['household',String(r.dataYear),yr,x.city,x.level,x.id,x.name,x.approximate?'ja':'',c?'HUSHÅLLSMODELL · DIREKT SOM BILMODELL V7 + LCA':'SAKNAR HUSHÅLLSUNDERLAG',c?.bef,c?.hh,c?.cars,c?.vkm,c?.direct,c&&c.bef?c.direct*1000/c.bef:null,c&&c.hh?c.direct*1000/c.hh:null,d?.p025,d?.p05,d?.p95,d?.p975,c?.ttw,c?.electricity,c?.fuelUpstream,c?.vehicle,c?.battery,c?.maintenance,c?.endoflife,c?.total,x.base?.p025,x.base?.p975,x.scenarioCentral?.total,x.scenarioCentral?.direct,x.difference?.p025,x.difference?.p975,c?.credit];lines.push(a.map(v=>csvCell(typeof v==='number'?v.toFixed(3).replace('.',','):v)).join(';'));}
 return '\ufeff'+lines.join('\r\n');}
/* Avrundning som i Bilmodell v7 (klimat.js avrunda): 100 över 10 000, 10 över 100, annars 1. */
function v7Round(v){if(v==null||!Number.isFinite(v))return v;const step=v>=10000?100:(v>=100?10:1);return Math.floor(v/step+0.5)*step;}
return {validate,prepare,deterministic,simulate,inScope,v7Interval,v7Round,resultCSV,sharesFor,shareYears,wttRatio,perKm,FIELDS,areaDetail,areaMC,aggRows,analogRows,tillampaNy};
});
