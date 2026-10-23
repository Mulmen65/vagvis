/* Vägvis 2.0.8 – Gävle i modell A.  node source/test_gavle.cjs  (skriver gavle-tests.txt)
   - Gävle har DeSO 2025, stadsdelsområden ur Bilmodell v7, vägnät och en egen slumpström.
   - Kalibreringen ger exakt referensens direktutsläpp för lätt trafik och tunga lastbilar.
   - Malmö och Helsingborg får exakt samma resultat och osäkerhetsdragningar med och utan Gävle. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert');
const V=require('./core.js'),A=JSON.parse(fs.readFileSync(path.join(__dirname,'geodata_project.json'),'utf8'));
const ref=JSON.parse(fs.readFileSync(path.join(__dirname,'../underlag/Referens_Gavle_2024.json'),'utf8')).reference;
const log=[],ok=t=>{log.push('OK  '+t);console.log('OK',t);};
(async()=>{const t0=Date.now();
 const g=A.cities.find(c=>c.id==='2180'),n=l=>A.areas.filter(a=>a.city==='2180'&&a.level===l).length,roads=A.roads.filter(r=>r.city==='2180');
 assert.ok(g&&g.separateStream&&g.reference&&g.reference.groups.heavy>0);assert.deepEqual(g.reference,ref);
 assert.equal(n('deso'),55);assert.equal(n('district'),9);assert.ok(roads.length>9000&&roads.every(r=>r.aadt==null&&r.quality==='assumed'&&/ODbL/.test(r.source)));
 ok('Gävle: 55 DeSO 2025, 9 stadsdelsområden, '+roads.length+' OSM-länkar med schablon-ÅDT, egen slumpström, referens enligt underlag/Referens_Gavle_2024.json.');
 const c=V.config(A.config),d=V.deterministic(A,c),f=V.factors(c);let light=0,heavy=0;
 for(const r of d.prep.rows){if(r.city!=='2180'||r.scenarioOnly)continue;for(let i=0;i<7;i++){const grp=c.profiles[i].group,s=d.base.scales['2180|'+grp]??1,t=r.vkm[i]*s*f[i].ttw/1e6;if(grp==='light')light+=t;else if(grp==='rigid'||grp==='artic')heavy+=t;}}
 assert.ok(Math.abs(light-ref.groups.light)<1e-6*ref.groups.light&&Math.abs(heavy-ref.groups.heavy)<1e-6*ref.groups.heavy,light+' '+heavy);
 assert.equal(d.base.scales['2180|rigid'],d.base.scales['2180|artic']);
 ok('Kalibrering: lätt trafik '+light.toFixed(0)+' ton och tunga lastbilar '+heavy.toFixed(0)+' ton = referensen. Faktorer: lätt '+d.base.scales['2180|light'].toFixed(3)+', tunga '+d.base.scales['2180|rigid'].toFixed(3)+'.');
 const utan=V.clone(A);utan.cities=utan.cities.filter(x=>x.id!=='2180');utan.areas=utan.areas.filter(x=>x.city!=='2180');utan.roads=utan.roads.filter(x=>x.city!=='2180');
 const cc={...A.config,iterations:300},a=await V.simulate(utan,V.config(cc)),b=await V.simulate(A,V.config(cc));let m=0,diff=0;
 for(const x of a.results){const y=b.results.find(z=>z.key===x.key);for(const w of ['central','base','scenario','difference'])for(const k of Object.keys(x[w]||{})){m++;if(x[w][k]!==y?.[w]?.[k])diff++;}}
 assert.equal(diff,0,'Malmö/Helsingborg ändrades av Gävle');
 ok('Malmö och Helsingborg: '+m+' värden identiska med och utan Gävle (centralvärden och intervall, 300 simuleringar).');
 const gc=b.results.find(x=>x.key==='city|2180');assert.ok(gc.base.p025<gc.central.total&&gc.central.total<gc.base.p975);
 ok('Gävle 2024: '+(gc.central.ttw/1000).toFixed(1)+' kton direkt, '+(gc.central.total/1000).toFixed(1)+' kton livscykel.');
 const msg=log.join('\n')+'\nAlla kontroller godkända ('+((Date.now()-t0)/1000).toFixed(0)+' s).';fs.writeFileSync(path.join(__dirname,'gavle-tests.txt'),msg+'\n');console.log(msg.split('\n').pop());
})().catch(e=>{console.error('FEL:',e.message);process.exit(1);});
