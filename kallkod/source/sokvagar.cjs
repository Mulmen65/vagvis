/* Var Bilmodell v7 ligger. I ett komplett Vägvis-paket ligger mappen bredvid source/. I GitHub-arkivet
   för Streamlit ligger källkoden i kallkod/ och Bilmodell v7 i app/Bilmodell_v7, där appen visar den.
   Miljövariabeln VAGVIS_V7 kan peka ut en annan mapp. */
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const kandidater = [process.env.VAGVIS_V7, path.join(root, 'Bilmodell_v7'), path.join(root, '..', 'app', 'Bilmodell_v7')].filter(Boolean);
const V7 = kandidater.find(d => fs.existsSync(path.join(d, 'index.html')) && fs.existsSync(path.join(d, 'atgarder.js')));
if (!V7) throw Error('Hittar inte Bilmodell_v7. Sökte i: ' + kandidater.join(', '));
module.exports = { root, V7 };
