/* Genererad av source/v7_utdrag.cjs ur Bilmodell_v7 – ändra inte för hand.
   Ordagranna utdrag ur app.js, klimat.js och kontroll.js; bara omslagen nedan är tillagda av Vägvis. */
(function () {
  'use strict';
  var ATG = window.ATGARDER;
  if (!ATG) return;
  /* ---------- Format ---------- */
  var f2 = new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var f1 = new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var f0 = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 });
  function bph(v) { return f2.format(v); }
  function km(v) { return f0.format(Math.round(v / 10) * 10); }
  function heltal(v) { return f0.format(Math.round(v)); }
  function intervall(a, b, fmt) { return fmt(Math.min(a, b)) + '–' + fmt(Math.max(a, b)); }
  function pct(x) {
    var v = x * 100, a = Math.abs(v);
    if (a < 0.05) return '0 %';
    var s = a < 1 ? f1.format(v) : f0.format(Math.round(v));
    return (v > 0 ? '+' : '') + s + ' %';
  }
  /* ================= Åtgärdsberäkning ================= */
  function nyttAtgTillstand() {
    var o = {};
    ATG.lista.forEach(function (m) { o[m.id] = { pa: false, niva: m.typ === 'binar' ? 1 : m.standard }; });
    return o;
  }
  function tillstandFranForval(id) {
    var o = nyttAtgTillstand(), f = ATG.forval.filter(function (x) { return x.id === id; })[0];
    if (!f) return o;
    ATG.lista.forEach(function (m) {
      var v = f.val[m.id];
      o[m.id].pa = v != null;
      o[m.id].niva = m.typ === 'binar' ? 1 : (v != null ? v : m.standard);
    });
    return o;
  }
  function antalAktiva(atg) { return ATG.lista.filter(function (m) { return atg[m.id].pa; }).length; }
  var SV = ATG.samverkan || { overlapp: ATG.overlapp, pullUtanPush: [1, 1, 1] };
  var NOLL = [0, 0, 0];

  /* kontext: andelNy   = andel av hushållen som bor i ny bebyggelse (1 i ett nytt område),
              tathet    = relativ ökning av antalet bostäder (förtätning), 0 om ingen,
              pushExtra = 1 om ett parkeringstal begränsar bilinnehavet (räknas som push).
     Samverkan enligt IVL C820: pull-åtgärder räknas med faktorn pullUtanPush när inget i paketet
     gör bilen mindre attraktiv, och med full effekt när en push-åtgärd genomförs fullt ut.
     Retur: fB, fV, fC = faktorer [central, minst, mest] för bilar per hushåll, fordonskm per hushåll
     och CO2 per fordonskm. */
  function atgardseffekt(atg, kontext) {
    var aktiva = [];
    ATG.lista.forEach(function (m) {
      var st = atg[m.id];
      if (!st || !st.pa) return;
      var w = m.typ === 'binar' ? 1 : st.niva / 100;
      if (m.endastNy) w *= kontext.andelNy;
      if (!(w > 0)) return;
      aktiva.push({ m: m, w: w });
    });
    var push = Math.min(1, kontext.pushExtra || 0);
    aktiva.forEach(function (a) { if (a.m.roll === 'push') push = Math.max(push, Math.min(1, a.w)); });
    var roller = { push: push > 0, pull: false, stod: false };
    aktiva.forEach(function (a) { if (a.m.roll === 'pull') roller.pull = true; if (a.m.roll === 'stod') roller.stod = true; });
    var kPull = [0, 1, 2].map(function (k) { return 1 - (1 - SV.pullUtanPush[k]) * (1 - push); });

    var perGrupp = {}, poster = [];
    aktiva.forEach(function (a) {
      var m = a.m, w = a.w, kf = m.roll === 'pull' ? kPull : [1, 1, 1];
      var e = { id: m.id, namn: m.namn, roll: m.roll,
        B: m.eB.map(function (x, k) { return x * w * kf[k]; }),
        V: m.eV.map(function (x, k) { return x * w * kf[k]; }),
        C: (m.eC || NOLL).map(function (x) { return x * w; }),
        effB: 0, effV: 0, effC: 0 };
      (perGrupp[m.grupp] = perGrupp[m.grupp] || []).push(e);
      poster.push(e);
    });
    var f = { B: [1, 1, 1], V: [1, 1, 1], C: [1, 1, 1] };
    Object.keys(perGrupp).forEach(function (g) {
      var lst = perGrupp[g];
      [0, 1, 2].forEach(function (k) {
        ['B', 'V', 'C'].forEach(function (p) {
          var sorterad = lst.slice().sort(function (a, b) { return a[p][k] - b[p][k]; });
          var sum = 0;
          sorterad.forEach(function (e, i) {
            var bidrag = (i === 0 ? 1 : SV.overlapp) * e[p][k];
            sum += bidrag;
            if (k === 0) e['eff' + p] = bidrag;
          });
          f[p][k] *= 1 + Math.max(sum, -0.9);
        });
      });
    });
    if (kontext.tathet > 0) {
      var F = ATG.fortatning, t = kontext.tathet;
      var dB = [0, 1, 2].map(function (k) { return Math.pow(1 + t, F.elB[k]) - 1; });
      var dV = [0, 1, 2].map(function (k) { return Math.pow(1 + t, F.elV[k]) - 1; });
      [0, 1, 2].forEach(function (k) { f.B[k] *= 1 + dB[k]; f.V[k] *= 1 + dV[k]; });
      poster.push({ id: 'fortatning', namn: 'Förtätning, ' + pct(t) + ' bostäder', roll: 'tathet', effB: dB[0], effV: dV[0], effC: 0 });
    }
    return { fB: f.B, fV: f.V, fC: f.C, poster: poster, aktiv: poster.length > 0, push: push, roller: roller, kPull: kPull };
  }

  // Tillämpa åtgärder på ett utgångsläge. tak = parkeringstal (valfritt).
  // Cv = fordonskm × CO2-faktor (fordonskm-ekvivalenter), så att CO2 = Cv × utsläpp per km.
  function tillampa(B0, km0, E, tak) {
    var V0 = B0 * km0;
    var B = E.fB.map(function (f) { return B0 * f; });
    var V = E.fV.map(function (f) { return V0 * f; });
    var K = V.map(function (v, k) { return v / B[k]; });
    var harTak = tak > 0;
    var Bt = B.map(function (b) { return harTak ? Math.min(b, tak) : b; });
    var Vt = Bt.map(function (b, k) { return b * K[k]; });
    var Ct = Vt.map(function (v, k) { return v * E.fC[k]; });
    return {
      B0: B0, km0: km0, V0: V0, B: Bt[0], km: K[0], V: Vt[0], Cv: Ct[0], Bfore: B[0], takBinder: harTak && B[0] > tak,
      Bmin: Math.min(Bt[1], Bt[2]), Bmax: Math.max(Bt[1], Bt[2]),
      kmMin: Math.min(K[0], K[1], K[2]), kmMax: Math.max(K[0], K[1], K[2]),
      Vmin: Math.min(Vt[1], Vt[2]), Vmax: Math.max(Vt[1], Vt[2]),
      CvMin: Math.min(Ct[1], Ct[2]), CvMax: Math.max(Ct[1], Ct[2])
    };
  }

  window.BILMODELL = { atgardseffekt: atgardseffekt, tillstandFranForval: tillstandFranForval, tillampa: tillampa, nyttAtgTillstand: nyttAtgTillstand, atgBefintliga: function () { return nyttAtgTillstand(); }, pct: pct };
})();
(function () {
  'use strict';
  var AR = [
    { id: '2025', namn: '2025 (Trafikanalys)', andelar: {
      '1280': { el: 11865 / 126890, lh: 10995 / 126890, kalla: 'Trafikanalys: 126 890 personbilar i trafik i Malmö vid årsskiftet 2025/26, varav 11 865 elbilar och 10 995 laddhybrider.' },
      '1283': { el: 5320 / 66804, lh: 4931 / 66804, kalla: 'Trafikanalys: 66 804 personbilar i trafik i Helsingborg vid årsskiftet 2025/26, varav 5 320 elbilar och 4 931 laddhybrider.' },
      '2180': { el: 2819 / 47944, lh: 3157 / 47944, kalla: 'Trafikanalys: 47 944 personbilar i trafik i Gävle i slutet av 2025, varav 2 819 elbilar och 3 157 laddhybrider.' } } },
    { id: '2023', namn: '2023 (framräknad)', andelar: {
      '1280': { el: 0.068, lh: 0.068, kalla: 'Framräknad från Skånes andelar 2023 (Trafikanalys) och Malmös andelar i januari 2022 (Power Circle) och 2025 (Trafikanalys).' },
      '1283': { el: 0.060, lh: 0.058, kalla: 'Framräknad från Skånes andelar 2023 och Helsingborgs andelar 2025 (Trafikanalys).' },
      '2180': { el: 0.045, lh: 0.040, kalla: 'Framräknad från Gävleborgs läns andelar 2023 (Trafikanalys) och Gävles kvot mot länet 2025.' } } }
  ];
  var STANDARD = { eldrift: 0.40, efIce: 0.15, efEv: 0.02 };
  function arPost(id) { for (var i = 0; i < AR.length; i++) if (AR[i].id === id) return AR[i]; return AR[0]; }
  function efStandard(kk, arId, par) {
    var a = arPost(arId).andelar[kk], p = par || { ice: 1, ev: 1, eld: 1 };
    var ev = Math.min(1, a.el + STANDARD.eldrift * p.eld * a.lh);
    return (1 - ev) * STANDARD.efIce * p.ice + ev * STANDARD.efEv * p.ev;
  }
  window.KLIMAT = window.KLIMAT || { efStandard: efStandard };
})();
(function () {
  'use strict';
  var ATG = window.ATGARDER, OS = window.OSAKERHET, MC = window.MC, BM = window.BILMODELL;
  if (!ATG || !OS || !MC || !BM) return;
  var KONTROLLER = OS.kontroller, P = OS.parametrar, TXT = OS.text;
  var REF = {};
  Object.keys(ATG.referenser).forEach(function (k) { REF[k] = ATG.referenser[k]; });
  Object.keys(OS.referenser || {}).forEach(function (k) { REF[k] = OS.referenser[k]; });
  var EPS = 1e-9;

  /* ---------- Format ---------- */
  var f0 = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 });
  var f1 = new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var f2 = new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var f3 = new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  function minus(s) { return s.replace(/-/g, '−'); }
  function tal(v, dec) { return minus((dec === 3 ? f3 : dec === 2 ? f2 : dec === 1 ? f1 : f0).format(v)); }
  function proc(v) { var a = Math.abs(v); return tal(v, a < 10 && Math.round(a * 10) % 10 !== 0 ? 1 : 0) + ' %'; }
  function ton(v) { var s = Math.abs(v) >= 10000 ? 100 : 10; return tal(Math.round(v / s) * s) + ' ton'; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function kommunNamn(kk) { return window.MODELL_META.kommuner[kk].namn; }

  /* ================= Utvärdering av kontrollfallen ================= */
  function tillstandFranVal(val) {
    var o = {};
    ATG.lista.forEach(function (m) {
      var v = val[m.id];
      o[m.id] = { pa: v != null, niva: m.typ === 'binar' ? 1 : (v != null ? v : m.standard) };
    });
    return o;
  }
  function uppstallning(k, pushExtra) {
    var mo = k.modell;
    if (mo.utfall === 'EF') return { ef: true };
    return {
      atg: mo.forval ? BM.tillstandFranForval(mo.forval) : tillstandFranVal(mo.val),
      kontext: { andelNy: mo.andelNy || 0, tathet: 0, pushExtra: pushExtra != null ? pushExtra : (mo.pushExtra || 0) }
    };
  }
  function varde(k, f, par) {
    var mo = k.modell;
    if (mo.utfall === 'EF') return window.KLIMAT.efStandard(mo.kk, mo.ar, par);
    var x = ({ B: f.fB, V: f.fV, C: f.fC, CO2: f.fV * f.fC })[mo.utfall] - 1;
    if (mo.omrakning === 'pendling') x /= par.pend;
    return x * 100;
  }
  function pubSpann(pub) {
    if (pub.lo == null) return [pub.v, pub.v];
    return [Math.min(pub.lo, pub.hi), Math.max(pub.lo, pub.hi)];
  }
  function pubMitt(pub) { var s = pubSpann(pub); return pub.v != null ? pub.v : (s[0] + s[1]) / 2; }
  function status(k, c, s) {
    var pub = k.pub;
    if (k.typ === 'riktning') return (c < 0) === (pub.riktning < 0) ? 'riktning' : 'fel';
    if (k.typ === 'ovre') return Math.abs(c) <= Math.max(Math.abs(pub.lo), Math.abs(pub.hi)) + EPS ? 'ovre' : 'over';
    var sp = pubSpann(pub), lo = sp[0], hi = sp[1];
    var tol = pub.tol != null ? pub.tol : (pub.lo == null ? Math.max(2, 0.2 * Math.abs(pub.v)) : 0);
    if (c >= lo - tol - EPS && c <= hi + tol + EPS) return 'inom';
    if (s.p5 <= hi + EPS && s.p95 >= lo - EPS) return 'forenligt';
    var negativ = lo < 0 || hi < 0;
    return (negativ ? c < lo : c > hi) ? 'over' : 'under';
  }
  var STATUS = {
    inom: { text: 'Inom studiens intervall', punkt: 'Nära studiens värde', klass: 'ok', ikon: '✓' },
    forenligt: { text: 'Förenligt', klass: 'nara', ikon: '≈' },
    under: { text: 'Underskattar', klass: 'avvik', ikon: '↓' },
    over: { text: 'Överskattar', klass: 'avvik', ikon: '↑' },
    riktning: { text: 'Samma riktning', klass: 'ok', ikon: '✓' },
    ovre: { text: 'Under övre gränsen', klass: 'ok', ikon: '✓' },
    fel: { text: 'Fel riktning', klass: 'avvik', ikon: '✗' }
  };
  function statusText(k, st) {
    var S = STATUS[st];
    var t = st === 'inom' && k.pub.lo == null ? S.punkt : S.text;
    return t + (k.proxy ? ' (proxy)' : '');
  }

  var SIMCACHE = {};   // samma inställning i flera kontroller simuleras en gång
  function utvardera(k, sigmaS) {
    var u = uppstallning(k), cp = MC.centralPar(), central, sim, vals = [];
    if (u.ef) {
      central = varde(k, null, cp);
      var r = MC.rng(OS.mc.seed);
      for (var i = 0; i < OS.mc.n; i++) vals.push(varde(k, null, MC.dragPar(r, OS.mc.rho, sigmaS || 0)));
    } else {
      central = varde(k, MC.effekt(u.atg, u.kontext, cp), cp);
      var nyckel = JSON.stringify([k.modell.forval, k.modell.val, u.kontext, sigmaS || 0]);
      sim = SIMCACHE[nyckel] || (SIMCACHE[nyckel] = MC.simulera(u.atg, u.kontext, { sigmaS: sigmaS || 0 }));
      for (var j = 0; j < sim.n; j++) vals.push(varde(k, { fB: sim.fB[j], fV: sim.fV[j], fC: sim.fC[j] }, sim.par[j]));
    }
    var s = MC.sammanfatta(vals);
    var res = { k: k, central: central, s: s, status: status(k, central, s) };
    if (!u.ef) {
      var E = BM.atgardseffekt(u.atg, u.kontext);
      if (E.roller.pull && E.push < 1) {
        var u2 = uppstallning(k, 1);
        res.medPush = varde(k, MC.effekt(u2.atg, u2.kontext, cp), cp);
        res.kPull = E.kPull[0];
      }
    }
    return res;
  }

  // Överföringsosäkerhet: spridning i log(studie/modell) för oberoende kontroller, minus modellens egen osäkerhet
  function skattaOverforing(rader) {
    var d = [], d2 = 0, sp2 = 0;
    rader.forEach(function (r) {
      var k = r.k;
      if (k.kategori !== 'oberoende' || k.typ !== 'varde') return;
      var p = pubMitt(k.pub);
      if (!(p < 0 && r.central < 0 && r.s.p5 < 0 && r.s.p95 < 0)) return;
      var x = Math.log(p / r.central);
      d.push(x); d2 += x * x;
      var sp = Math.log(r.s.p5 / r.s.p95) / (2 * 1.6448536);
      sp2 += sp * sp;
    });
    var n = d.length;
    var sorterad = d.slice().sort(function (a, b) { return a - b; });
    return {
      n: n, sigma: Math.sqrt(Math.max(0, d2 / n - sp2 / n)), medel: d.reduce(function (a, b) { return a + b; }, 0) / n,
      median: MC.kvantil(sorterad, 0.5), rms: Math.sqrt(d2 / n), param: Math.sqrt(sp2 / n)
    };
  }

  var RES = null;
  function resultat() {
    if (RES) return RES;
    var rader = KONTROLLER.map(function (k) { return utvardera(k, 0); });
    var ov = skattaOverforing(rader);
    // täckning med och utan överföringsosäkerhet (oberoende kontroller med värde)
    var obe = rader.filter(function (r) { return r.k.kategori === 'oberoende' && r.k.typ === 'varde'; });
    var tack = obe.filter(function (r) { var m = pubMitt(r.k.pub); return m >= r.s.p5 - EPS && m <= r.s.p95 + EPS; }).length;
    RES = { rader: rader, ov: ov, tackning: { n: obe.length, inne: tack, inneS: null } };
    return RES;
  }
  // Täckning med överföringsosäkerheten (räknas först när dialogrutan öppnas)
  function tackningMedOverforing() {
    var R = resultat();
    if (R.tackning.inneS == null) {
      R.tackning.inneS = R.rader.filter(function (r) {
        if (r.k.kategori !== 'oberoende' || r.k.typ !== 'varde') return false;
        var r2 = utvardera(r.k, R.ov.sigma), m = pubMitt(r.k.pub);
        r.s2 = r2.s;
        return m >= r2.s.p5 - EPS && m <= r2.s.p95 + EPS;
      }).length;
    }
    return R.tackning;
  }
  window.KONTROLL = { resultat: resultat, sigmaS: function () { return resultat().ov.sigma; } };

  /* Tillagt av Vägvis: gör v7:s egna hjälpfunktioner för täckning och statustext åtkomliga. */
  window.KONTROLL.tackning = tackningMedOverforing; window.KONTROLL.statusText = statusText; window.KONTROLL.STATUS = STATUS; window.KONTROLL.pubMitt = pubMitt;
})();
