/* Kalibrerar termisk energianvändning (MJ/km) per fordonsklass så att modellens direktutsläpp (TTW)
   i nationellt genomsnitt motsvarar Trafikverkets reviderade siffror för 2024
   (PM Vägtrafikens utsläpp 2025, tabell 1 och 2). TTW är linjär i MJ/km: TTW = a × MJ + b.
   Kör: node verktyg/kalibrera_fordonsfaktorer.cjs [--skriv]   (--skriv uppdaterar kallkod/data/config.json) */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),V=require(path.join(root,'kallkod/source/core.js'));
const T=V.NATIONAL_TTW_2024,N=V.NATIONAL_VKM;
function ttwAt(cfg,ids,mjs){const c=V.clone(cfg);ids.forEach((id,k)=>{c.profiles.find(p=>p.id===id).mj=mjs[k];});const f=V.factors(V.config(c));return Object.fromEntries(c.profiles.map((p,i)=>[p.id,f[i].ttw]));}
function solve(cfg,ids,base,weights,target){
  // mj_i = base_i × k; weighted TTW linear in k
  const w=weights.map(x=>x/weights.reduce((a,b)=>a+b,0));
  const at=k=>{const t=ttwAt(cfg,ids,base.map(b=>b*k));return ids.reduce((s,id,j)=>s+w[j]*t[id],0);};
  const t0=at(0),t1=at(1),k=(target-t0)/(t1-t0);return {k,mj:base.map(b=>b*k),check:at(k)};
}
const cfg=V.config(JSON.parse(fs.readFileSync(path.join(root,'kallkod/data/config.json'),'utf8')));
const out={
  car:solve(cfg,['car'],[1],[1],T.car),
  van:solve(cfg,['van'],[1],[1],T.van),
  heavy:solve(cfg,['rigid','artic'],[9,12],[N[2],N[3]],T.heavy),
  bus:solve(cfg,['bus'],[1],[1],T.bus),
  mcmoped:solve(cfg,['mc','moped'],[1.7,.9],[N[5],N[6]],T.mcmoped)
};
const mj={car:out.car.mj[0],van:out.van.mj[0],rigid:out.heavy.mj[0],artic:out.heavy.mj[1],bus:out.bus.mj[0],mc:out.mcmoped.mj[0],moped:out.mcmoped.mj[1]};
const rounded=Object.fromEntries(Object.entries(mj).map(([k,v])=>[k,Math.round(v*1000)/1000]));
console.log(JSON.stringify({phevElectric:cfg.phevElectric,targets_g_per_vkm:T,mj_per_km:rounded,checks:Object.fromEntries(Object.entries(out).map(([k,v])=>[k,Math.round(v.check*100)/100]))},null,2));
if(process.argv.includes('--skriv')){const file=path.join(root,'kallkod/data/config.json'),c=JSON.parse(fs.readFileSync(file,'utf8'));for(const p of c.profiles)p.mj=rounded[p.id];fs.writeFileSync(file,JSON.stringify(c,null,2)+'\n');console.log('Skrev '+file);}
