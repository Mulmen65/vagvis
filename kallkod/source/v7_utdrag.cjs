/* Plockar ut Bilmodell v7:s beräkningskod ordagrant, utan dess sidlayout, så att Vägvis räknar
   åtgärder och referenskontroll med exakt samma kod som v7. Används av build.cjs, som skriver
   resultatet till source/v7_berakning.js och bäddar in det i appen.
   Utdrag:
   - app.js:      blocket "Åtgärdsberäkning" (nyttAtgTillstand, tillstandFranForval, atgardseffekt, tillampa)
                  och formatfunktionen pct som blocket använder.
   - klimat.js:   AR, STANDARD, arPost och efStandard (utsläpp per km för referenskontrollens EF-fall).
   - kontroll.js: "Utvärdering av kontrollfallen" fram till window.KONTROLL (inte dialogrutorna). */
const fs = require('node:fs'), path = require('node:path');
function between(text, start, end, file) {
  const i = text.indexOf(start); if (i < 0) throw Error('Hittar inte "' + start + '" i ' + file);
  const j = text.indexOf(end, i + start.length); if (j < 0) throw Error('Hittar inte "' + end + '" i ' + file);
  return text.slice(i, j);
}
function v7Berakning(v7dir) {
  const read = f => fs.readFileSync(path.join(v7dir, f), 'utf8');
  const app = read('app.js'), klimat = read('klimat.js'), kontroll = read('kontroll.js');
  const format = between(app, '  /* ---------- Format ---------- */', '  function esc(s)', 'app.js');
  const atgard = between(app, '  /* ================= Åtgärdsberäkning ================= */', '  /* ---------- Tillstånd ---------- */', 'app.js');
  const ar = between(klimat, '  var AR = [', '  var KVOT = ', 'klimat.js');
  const arPost = between(klimat, '  function arPost(id)', '  function andelar(kk)', 'klimat.js');
  const efStd = between(klimat, '  function efStandard(kk, arId, par) {', '  window.KLIMAT = ', 'klimat.js');
  const kontrollDel = between(kontroll, '(function () {', '  /* ================= Dialogrutor ================= */', 'kontroll.js');
  if (!/window\.KONTROLL = \{/.test(kontrollDel)) throw Error('window.KONTROLL saknas i utdraget ur kontroll.js');
  return '/* Genererad av source/v7_utdrag.cjs ur Bilmodell_v7 – ändra inte för hand.\n' +
    '   Ordagranna utdrag ur app.js, klimat.js och kontroll.js; bara omslagen nedan är tillagda av Vägvis. */\n' +
    '(function () {\n  \'use strict\';\n  var ATG = window.ATGARDER;\n  if (!ATG) return;\n' + format + atgard +
    '  window.BILMODELL = { atgardseffekt: atgardseffekt, tillstandFranForval: tillstandFranForval, tillampa: tillampa, nyttAtgTillstand: nyttAtgTillstand, atgBefintliga: function () { return nyttAtgTillstand(); }, pct: pct };\n})();\n' +
    '(function () {\n  \'use strict\';\n' + ar + arPost + efStd + '  window.KLIMAT = window.KLIMAT || { efStandard: efStandard };\n})();\n' +
    kontrollDel + '  /* Tillagt av Vägvis: gör v7:s egna hjälpfunktioner för täckning och statustext åtkomliga. */\n  window.KONTROLL.tackning = tackningMedOverforing; window.KONTROLL.statusText = statusText; window.KONTROLL.STATUS = STATUS; window.KONTROLL.pubMitt = pubMitt;\n})();\n';
}
module.exports = { v7Berakning };
