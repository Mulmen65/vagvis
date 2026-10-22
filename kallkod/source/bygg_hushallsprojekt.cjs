/* Bygger modell B:s underlag (household_project.json) direkt ur Bilmodell v7:s egna filer:
   data.js (hushåll, bilar per hushåll, km per bil), geo.js (DeSO- och stadsdelsytor, klippta mot land),
   klimat.js (elbilsandelar per år och utsläppsfaktorer) och osakerhet.js (fördelningar).
   Körs: node source/bygg_hushallsprojekt.cjs   (därefter node source/build.cjs) */
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const { root, V7: v7 } = require('./sokvagar.cjs');
const sandbox = { window: {} };
vm.createContext(sandbox);
for (const f of ['data.js', 'geo.js', 'osakerhet.js']) vm.runInContext(fs.readFileSync(path.join(v7, f), 'utf8'), sandbox, { filename: f });
const W = sandbox.window, META = W.MODELL_META, DESO = W.DESO, GEO = W.GEO, OS = W.OSAKERHET;

// Antagandena i klimat.js står i koden (var AR = [...]; var STANDARD = {...}). Läs dem ur filen i stället för att skriva av dem.
const klimat = fs.readFileSync(path.join(v7, 'klimat.js'), 'utf8');
const grab = name => { const m = klimat.match(new RegExp('var ' + name + ' = ([\\s\\S]*?);\\n')); if (!m) throw Error('Hittar inte ' + name + ' i klimat.js'); return Function('return ' + m[1])(); };
const AR = grab('AR'), STANDARD = grab('STANDARD'), KVOT = grab('KVOT'), FARGER = grab('FARGER');

const cities = Object.entries(META.kommuner).map(([id, k]) => ({ id, name: k.namn, reference: null }));
const areas = [];
for (const c of cities) {
  const G = GEO.kommuner[c.id];
  if (!G) throw Error('Ytor saknas för ' + c.id);
  const approx = new Set(G.ungefarliga || []);
  const namn = Object.fromEntries(DESO.filter(r => r.kk === c.id).map(r => [r.kod, r.rs]));
  for (const f of G.deso.features) {
    const id = f.properties.kod;
    if (!namn[id]) throw Error('DeSO utan hushållsdata: ' + id);
    areas.push({ id, name: namn[id], city: c.id, level: 'deso', version: '2018', geometry: f.geometry, ...(approx.has(id) ? { approximate: true } : {}) });
  }
  for (const f of G.sd.features) areas.push({ id: f.properties.sd, name: f.properties.sd, city: c.id, level: 'district', version: 'v7-modellgruppering', geometry: f.geometry });
}
const households = DESO.map(r => ({ ...r }));

const shares = {};
for (const a of AR) shares[a.id] = { name: a.namn, cities: Object.fromEntries(Object.entries(a.andelar).map(([kk, x]) => [kk, { el: x.el, lh: x.lh, source: x.kalla }])) };
const P = OS.parametrar;
const config = {
  year: META.referensar, desoVersion: '2018', mode: 'network', iterations: 3000, seed: 19062026,
  household: {
    shareYear: AR[0].id,               // samma startval som Bilmodell v7 (S.ar)
    shares,
    own: {},
    eldrift: STANDARD.eldrift, efIce: STANDARD.efIce, efEv: STANDARD.efEv,
    ranges: { efIce: P.efIce.v, efEv: P.efEv.v, eldrift: P.eldrift.v },
    activity: P.fordonskm.kommuner,
    spatialCV: 0.2,
    iceMix: { petrol: 0.5487804878048781, diesel: 0.4268292682926829, biogas: 0.024390243902439025 },
    v7mc: { n: OS.mc.n, seed: OS.mc.seed },
    classes: { kvot: KVOT, colors: FARGER },
    measures: { packageId: 'inga', state: null, scope: { level: 'city', city: '1280', id: null }, newDwellings: 0, sigmaS: 0 }
  }
};
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(v7, f))).digest('hex');
const project = {
  schema: 'vagvis-1', model: 'household', title: 'Hushållens bilar · Malmö, Helsingborg och Gävle', isDemo: false,
  metadata: {
    desoVersion: '2018', dataYear: META.referensar, sourceFile: 'Bilmodell_v7 (data.js, geo.js, klimat.js, osakerhet.js, mc.js)',
    v7: { modelVersion: META.modellversion, extracted: META.uttagsdatum, files: Object.fromEntries(['data.js', 'geo.js', 'klimat.js', 'osakerhet.js', 'mc.js'].map(f => [f, sha(f)])) },
    notes: [
      'Hushåll, bilinnehav, körsträckor och ytor kommer från den bifogade Bilmodell v7. Aktivitetsdata avser 2023 och DeSO 2018.',
      'Direkt CO₂ räknas med samma formel och antaganden som fliken Klimatpåverkan i Bilmodell v7: fordonskm × ((1 − elandel) × 0,15 + elandel × 0,02) kg CO₂ per km.',
      'Livscykeln är Bilmodell v7:s direkta CO₂ plus bränslets tidigare led, fordons- och batteritillverkning, underhåll och slutbehandling.',
      'Körsträckan är modellerad. Körningen kan ske inom och utanför hemkommunen.',
      'Fem DeSO i Gävle saknas i SCB:s gränsfil och har ungefärliga ytor (streckad kant), som i Bilmodell v7.'
    ]
  },
  cities, areas, roads: [], households, config
};
fs.writeFileSync(path.join(__dirname, 'household_project.json'), JSON.stringify(project));
fs.writeFileSync(path.join(root, 'underlag/Hushall_bilmodell_v7.json'), JSON.stringify({ metadata: META, households, v7Assumptions: { shares, standard: STANDARD, distributions: { efIce: P.efIce, efEv: P.efEv, eldrift: P.eldrift, fordonskm: P.fordonskm }, mc: OS.mc } }, null, 1));
console.log('Hushållsprojekt: ' + cities.map(c => c.name + ' ' + households.filter(r => r.kk === c.id).length + ' DeSO').join(', ') + '; ' + areas.length + ' ytor.');
