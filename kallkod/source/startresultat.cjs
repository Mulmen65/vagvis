/* Räknar startprojektets resultat med standardinställningarna och sparar det för bygget (build.cjs). */
const fs=require('node:fs'),path=require('node:path'),V=require('./core.js');
const safe=x=>JSON.stringify(x).replaceAll('<','\\u003c'),read=f=>fs.readFileSync(path.join(__dirname,f),'utf8');
const initial=JSON.parse(read('geodata_project.json')),config=V.config(initial.config||{});
const p=V.validateProject(JSON.parse(safe(initial))),c=V.config(JSON.parse(safe(config))),fp=V.fingerprint(p,c);
(async()=>{const t=Date.now();const r=await V.simulate(p,c,()=>{});const {draws,...rest}=r,drawsCity={};
for(const [k,v] of draws)if(k.startsWith('city|'))drawsCity[k]=Array.from(v.base,x=>Math.round(x*10)/10);
const embedded={...rest,fingerprint:fp,drawsCity};
fs.writeFileSync(path.join(__dirname,'startresultat.json'),JSON.stringify({key:process.argv[2]||'',seconds:(Date.now()-t)/1000,embedded}));
console.log('Startresultat klart på '+Math.round((Date.now()-t)/1000)+' s.');})().catch(e=>{console.error(e);process.exit(1);});
