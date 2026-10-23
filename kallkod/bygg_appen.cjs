/* Complete deterministic build. Node built-ins only; no npm install or network. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const V=require('./source/core.js'),H=require('./source/households.js');
const p=JSON.parse(read('kallkod/data/project.json')),b=JSON.parse(read('kallkod/data/household-project.json')),c=V.config(JSON.parse(read('kallkod/data/config.json')));
V.validateProject(p);H.validate(b,V.config(b.config));
const evidence=JSON.parse(read('underlag/evidensregister.json'));
const E=require('./source/evidence.js').create(evidence);
if(evidence.version!=='2.0.9')throw Error('Fel version i evidensregister');
let template=read('kallkod/source/shell.html');
const r=JSON.parse(read('kallkod/data/result.json'));
// Numeric baseline is the reviewed 2.0.8 result. Refresh only its identity token.
r.version=V.VERSION;r.fingerprint=V.fingerprint(p,c);r.baselineVersion='2.0.8';
const safe=x=>JSON.stringify(x).replaceAll('<','\\u003c');
const values={'kallkod/data/result.json':safe(r),'kallkod/data/config.json':safe(c)};
const html=template.replace(/\{\{([^}]+)\}\}/g,(_,file)=>{
  const value=values[file]??read(file);
  return file.endsWith('.json')?safe(JSON.parse(value)):file.endsWith('.js')?value.replace(/<\/script/gi,'<\\/script'):value;
});
if(/\{\{[^}]+\}\}/.test(html))throw Error('En byggmarkör saknar innehåll');
fs.mkdirSync(path.join(root,'app'),{recursive:true});
fs.writeFileSync(path.join(root,'app/Vagvis.html'),html);
const a=read('kallkod/source/app.js'),m=a.match(/const METHOD=(`[^`]+`);/s);
if(!m)throw Error('Metodtext saknas');
let legacy=Function('return '+m[1])();
const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
legacy=legacy.replace('<div id="source-list"></div>',V.SOURCES.map(s=>'<div class="source"><strong>'+esc(s.title)+'</strong><p>'+esc(s.use)+'</p>'+(s.url?'<a href="'+esc(s.url)+'">Öppna källa</a>':'Modellbedömning')+'</div>').join(''));
const method='<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vägvis 2.0.9 metod och källor</title><style>'+read('kallkod/source/style.css')+'body{display:block;max-width:1080px;margin:24px auto;padding:20px}.card{margin:20px 0}h1{font-size:36px}a{overflow-wrap:anywhere}@media print{body{padding:0;margin:0}.card{break-inside:auto}}</style></head><body><h1>Vägvis 2.0.9 metod och källor</h1><p>23 oktober 2026. Två modeller med olika systemgränser.</p>'+E.render(V.config(b.config),b)+legacy+'</body></html>';
fs.writeFileSync(path.join(root,'app/Metod_och_anvandning.html'),method);
const traffic='<!doctype html><html lang="sv"><meta charset="utf-8"><title>Trafikdata</title><style>body{font:17px/1.6 system-ui;max-width:1000px;margin:30px auto;padding:20px}pre{white-space:pre-wrap}</style><h1>Underlag för trafikmodellen</h1><pre>'+esc(read('dokument/Trafikdata_till_Malmo.txt'))+'</pre></html>';
fs.writeFileSync(path.join(root,'app/Trafikdata_till_Malmo.html'),traffic);
const files=[...fs.readdirSync(path.join(root,'app')).filter(f=>f.endsWith('.html')).map(f=>'app/'+f),'streamlit_app.py','vagvis_sidor.py','requirements.txt','underlag/evidensregister.json',...fs.readdirSync(path.join(root,'kallkod/source')).map(f=>'kallkod/source/'+f),...fs.readdirSync(path.join(root,'kallkod/data')).map(f=>'kallkod/data/'+f)];
const sha=Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]));
fs.writeFileSync(path.join(root,'underlag/SHA256.json'),JSON.stringify(sha,null,2)+'\n');
console.log('Byggd Vägvis '+V.VERSION+': '+Buffer.byteLength(html)+' byte. Grundresultat 2.0.8 bevarat.');
