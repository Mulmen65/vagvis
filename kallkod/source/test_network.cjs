/* Kontroller av OSM-hämtningen med simulerade Overpass-svar. Inga riktiga nätverksanrop. */
const assert=require('node:assert'),V=require('./core.js'),N=require('./network.js');
N.setSleep(()=>Promise.resolve());
const area=(city,x0,y0,x1,y1)=>({id:city+'A0010',name:'t',city,level:'deso',version:'2025',geometry:{type:'Polygon',coordinates:[[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]]]}});
const areas=[area('1280',12.9,55.5,13.2,55.7),area('1283',12.6,55.95,12.9,56.2)];
const way=(id,lon,lat,hw)=>({type:'way',id,tags:{highway:hw||'primary'},geometry:[{lon,lat},{lon:lon+0.01,lat:lat+0.01}]});
let ok=0;const check=(namn,f)=>Promise.resolve().then(f).then(()=>{ok++;console.log('OK',namn);});
function svar(body,status=200){return {ok:status<400,status,text:async()=>JSON.stringify(body)};}
(async()=>{
await check('reservserver används när första servern inte svarar (Failed to fetch)',async()=>{const anrop=[];global.fetch=async(url,o)=>{anrop.push(url);if(anrop.length===1)throw new TypeError('Failed to fetch');return svar({elements:[way(1,13,55.6)]});};
 const roads=await N.osm('1280',areas,()=>{});assert.ok(roads.length===1);assert.ok(anrop[1].includes('kumi'));});
await check('429 och 504 ger nytt försök, servicevägar är frivilliga',async()=>{let n=0;global.fetch=async(url,o)=>{n++;const q=decodeURIComponent(o.body);if(q.includes('service'))return svar({},429);if(n%2)return svar({},504);return svar({elements:[way(2,13.05,55.6),way(3,13.1,55.65,'residential')]});};
 const roads=await N.osm('1280',areas,()=>{});assert.strictEqual(new Set(roads.map(r=>r.id)).size,roads.length);assert.ok(roads.noter.length>0);});
await check('ofullständigt svar (remark) underkänns',async()=>{global.fetch=async()=>svar({remark:'runtime error: Query timed out',elements:[]});await assert.rejects(()=>N.osm('1280',areas,()=>{}),/ofullständigt|webbläsaren|Inga/);});
await check('alla servrar blockerade ger begripligt fel',async()=>{global.fetch=async()=>{throw new TypeError('Failed to fetch');};await assert.rejects(()=>N.osm('1280',areas,()=>{}),/webbläsaren fick inget svar/);});
await check('rutor täcker kommunen och frågorna är små',async()=>{const t=N.tiles([12.7,55.48,13.16,55.69],'1280',[area('1280',12.7,55.48,13.16,55.69)],0.16);assert.ok(t.length>=4&&t.length<=12);const q=N.osmQuery(t[0],'^service$');assert.ok(q.includes('out tags geom qt'));});
await check('direktlänk är en GET-fråga till Overpass för kommunens område',async()=>{const u=N.downloadUrl('1283',areas);assert.ok(u.startsWith('https://overpass-api.de/api/interpreter?data='));const q=decodeURIComponent(u.split('data=')[1]);assert.ok(q.includes('55.95000,12.60000,56.20000,12.90000'));assert.ok(q.includes('service'));});
await check('importerad OSM-fil: kommun gissas och vägarna godkänns av projektvalideringen',async()=>{const data={elements:[way(10,12.7,56.05),way(11,12.72,56.06,'motorway'),way(10,12.7,56.05)]};const city=N.guessCity(data,areas,'1280');assert.strictEqual(city,'1283');const roads=N.fromOverpass(data,city,'test');assert.strictEqual(roads.length,2);assert.ok(roads.find(r=>r.roadClass==='motorway').oneway);
 const p=V.emptyProject();p.areas=areas.map(a=>({...a}));p.roads=roads;p.isDemo=false;V.validateProject(p);});
console.log(ok+' nätverkskontroller passerade (simulerade svar, inga riktiga anrop).');
})().catch(e=>{console.error('FEL',e);process.exit(1);});
