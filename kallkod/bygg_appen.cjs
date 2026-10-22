/* Bygger Vägvis ur källkoden och lägger de publicerade filerna där Streamlit-appen läser dem.
   Kör från arkivets översta mapp:   node kallkod/bygg_appen.cjs
   Kräver Node.js 18 eller senare, inga paket och inget nät.
   1. source/build.cjs bygger Vagvis_2.0.html, metodsidan och startresultatet (1–3 min om motorn ändrats).
   2. Filerna kopieras till app/ och dokumenten till dokument/.
   Ändra aldrig filerna i app/ för hand: de skrivs över nästa gång appen byggs. */
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const K = __dirname, REPO = path.resolve(K, '..'), APP = path.join(REPO, 'app'), DOK = path.join(REPO, 'dokument');
if (!fs.existsSync(path.join(REPO, 'streamlit_app.py')) || !fs.existsSync(APP))
  throw Error('Kör skriptet i GitHub-arkivet: mappen kallkod ska ligga bredvid streamlit_app.py och app/.');
execFileSync(process.execPath, [path.join(K, 'source', 'build.cjs')], { stdio: 'inherit' });
const kopiera = (fran, till) => {
  fs.copyFileSync(path.join(K, fran), till);
  console.log('  ' + path.relative(REPO, path.join(K, fran)) + ' → ' + path.relative(REPO, till));
};
fs.mkdirSync(DOK, { recursive: true });
kopiera('Vagvis_2.0.html', path.join(APP, 'Vagvis.html'));
for (const f of ['Metod_och_anvandning.html', 'Trafikdata_till_Malmo.html', 'Trafikdata_till_Malmo.txt']) kopiera(f, path.join(APP, f));
for (const f of ['Andringar_2.0.txt', 'Kontrollresultat.txt', 'LAS_MIG_FORST.txt']) kopiera(f, path.join(DOK, f));
const version = (fs.readFileSync(path.join(APP, 'Vagvis.html'), 'utf8').match(/Vägvis (\d+\.\d+\.\d+) · ton per kalenderår/) || [])[1];
console.log('Klart: app/Vagvis.html är Vägvis ' + (version || '(okänd version)') + '.');
console.log('Kontrollera:  node kallkod/source/test_core.cjs  och  python -m pytest tests');
console.log('Committa sedan kallkod/, app/ och dokument/ tillsammans.');
