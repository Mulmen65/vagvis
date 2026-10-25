/* Packar byggda projekt förlustfritt (vagvis-pack-1) och kontrollerar att uppackning ger exakt
   samma JSON som indata. Används av verktyg/bygg_underlag.py.
   node verktyg/packa_projekt.cjs --territorial A.json --household B.json --out kallkod/data */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),V=require(path.join(root,'kallkod/source/core.js'));
const arg=name=>{const i=process.argv.indexOf(name);if(i<0||!process.argv[i+1])throw Error('Saknar '+name);return process.argv[i+1];};
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const a=read(arg('--territorial')),b=read(arg('--household')),out=path.resolve(root,arg('--out'));
if(!out.startsWith(root+path.sep))throw Error('Utdata måste ligga i paketet.');
if(JSON.stringify(a.areas)!==JSON.stringify(b.areas))throw Error('A och B ska använda exakt samma områdesgeometri.');
const omraden=V.packAreas(a.areas);
const pa=V.packProject(a,{areasRef:'omraden'}),pb=V.packProject(b,{areasRef:'omraden'});
for(const [orig,packed,name] of [[a,pa,'A'],[b,pb,'B']]){
  const back=V.unpackProject(JSON.parse(JSON.stringify(packed)),JSON.parse(JSON.stringify(omraden)));
  if(JSON.stringify(back)!==JSON.stringify(orig))throw Error('Packningen av '+name+' är inte förlustfri.');
}
const write=(file,value)=>fs.writeFileSync(path.join(out,file),JSON.stringify(value)+'\n');
write('omraden.json',omraden);write('project.json',pa);write('household-project.json',pb);
console.log(JSON.stringify({omraden:fs.statSync(path.join(out,'omraden.json')).size,project:fs.statSync(path.join(out,'project.json')).size,household:fs.statSync(path.join(out,'household-project.json')).size}));
