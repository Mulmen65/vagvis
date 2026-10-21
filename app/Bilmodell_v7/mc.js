/* Monte Carlo-osäkerhet för åtgärdseffekter och utsläpp.
   Fördelningar och inställningar: osakerhet.js. Åtgärder och samverkansregler: atgarder.js.
   Samma beräkning finns i Python (osakerhet.py) och ger samma resultat med samma frö.

   En dragning:
   - Varje åtgärds effekt på bilinnehav och fordonskm dras ur en triangelfördelning [minst, centralt, mest]
     via en gemensam faktor (korrelation rho mellan åtgärder) och en egen faktor. Effekten på CO₂ per km
     (hastighet, körsätt) dras oberoende.
   - Överlapp inom grupp, pull utan push, förtätningens elasticiteter, utsläppsfaktorer, laddhybridernas
     eldrift, bilmodellens fordonskm och (i referenskontrollen) pendlingsandelen dras också.
   Ordningen på slumptalen är fast, så resultaten går att återskapa. */
(function () {
  'use strict';
  var ATG = window.ATGARDER, OS = window.OSAKERHET;
  if (!ATG || !OS) return;
  var P = OS.parametrar, SV = ATG.samverkan, F = ATG.fortatning, NOLL = [0, 0, 0];

  /* ---------- Slumptal och fördelningar ---------- */
  // mulberry32: liten, snabb och lätt att återskapa i Python
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normal(r) { var u1 = 1 - r(), u2 = r(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); }
  // Standardnormalfördelningens fördelningsfunktion (Abramowitz & Stegun 26.2.17, fel < 7,5e-8)
  function phi(x) {
    var t = 1 / (1 + 0.2316419 * Math.abs(x));
    var d = 0.3989422804014327 * Math.exp(-x * x / 2);
    var p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return x > 0 ? 1 - p : p;
  }
  // Invers (Acklam), används bara för tornadodiagrammet
  function probit(p) {
    var a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.3577518672690, -30.66479806614716, 2.506628277459239];
    var b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    var c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    var d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    var q, r;
    if (p < 0.02425) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - 0.02425) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  function triKvantil(a, c, b, u) {
    if (!(b > a)) return a;
    var Fc = (c - a) / (b - a);
    return u < Fc ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c));
  }
  // v = [centralt, minst, mest]; u = 0 ger minst effekt, u = 1 mest
  function drag(v, u) {
    var lo = Math.min(v[1], v[2]), hi = Math.max(v[1], v[2]);
    if (!(hi > lo)) return v[0];
    var c = Math.min(hi, Math.max(lo, v[0]));
    return triKvantil(lo, c, hi, v[2] < v[1] ? 1 - u : u);
  }
  function kvantil(sorterad, p) {
    var n = sorterad.length; if (!n) return NaN;
    var h = (n - 1) * p, i = Math.floor(h);
    return i + 1 < n ? sorterad[i] + (h - i) * (sorterad[i + 1] - sorterad[i]) : sorterad[n - 1];
  }
  function sammanfatta(x) {
    var s = Array.prototype.slice.call(x).sort(function (a, b) { return a - b; });
    return { p5: kvantil(s, 0.05), p50: kvantil(s, 0.5), p95: kvantil(s, 0.95), min: s[0], max: s[s.length - 1] };
  }

  /* ---------- Parametrar ---------- */
  var OV = [SV.overlapp, P.overlapp.v[1], P.overlapp.v[2]];
  var PUP = SV.pullUtanPush;
  function sigmaBas(kk) {
    var b = P.fordonskm.kommuner[kk];
    return b ? Math.log(b.p95 / b.p5) / (2 * 1.6448536) : 0;
  }
  function centralPar() {
    var e = {};
    ATG.lista.forEach(function (m) { e[m.id] = { B: m.eB[0], V: m.eV[0], C: (m.eC || NOLL)[0] }; });
    return { e: e, ov: SV.overlapp, pup: PUP[0], elB: F.elB[0], elV: F.elV[0], ice: 1, ev: 1, eld: 1, zb: 0, pend: P.pendling.v[0] };
  }
  /* sigmaS = överföringsosäkerhet: en log-normal faktor per åtgärd på effekten på bilinnehav och fordonskm,
     skattad från avvikelsen mellan oberoende studier och modellen (kontroll.js). 0 = bara parameterosäkerhet.
     Slumptalen för den dras sist, så att övriga dragningar blir desamma oavsett sigmaS. */
  function dragPar(r, rho, sigmaS) {
    var sr = Math.sqrt(rho), s1 = Math.sqrt(1 - rho);
    var z0 = normal(r), e = {};
    ATG.lista.forEach(function (m) {
      var u = phi(sr * z0 + s1 * normal(r));
      var uc = phi(normal(r));
      e[m.id] = { B: drag(m.eB, u), V: drag(m.eV, u), C: drag(m.eC || NOLL, uc) };
    });
    var uf = phi(sr * z0 + s1 * normal(r));
    var par = { e: e, elB: drag(F.elB, uf), elV: drag(F.elV, uf) };
    par.ov = drag(OV, r());
    par.pup = drag(PUP, r());
    par.ice = drag(P.efIce.v, r()) / P.efIce.v[0];
    par.ev = drag(P.efEv.v, r()) / P.efEv.v[0];
    par.eld = drag(P.eldrift.v, r()) / P.eldrift.v[0];
    par.zb = normal(r);
    par.pend = drag(P.pendling.v, r());
    var zs0 = normal(r);
    ATG.lista.forEach(function (m) {
      var s = Math.exp((sigmaS || 0) * (sr * zs0 + s1 * normal(r)));
      e[m.id].B *= s; e[m.id].V *= s;
    });
    return par;
  }
  // En parameter på kvantilen q, övriga centrala (tornadodiagram)
  function parMedKvantil(namn, q) {
    var par = centralPar(), del = namn.split(':');
    if (del[0] === 'atg') {
      var m = ATG.lista.filter(function (x) { return x.id === del[1]; })[0];
      par.e[m.id] = { B: drag(m.eB, q), V: drag(m.eV, q), C: drag(m.eC || NOLL, q) };
    } else if (namn === 'ov') par.ov = drag(OV, q);
    else if (namn === 'pup') par.pup = drag(PUP, q);
    else if (namn === 'tathet') { par.elB = drag(F.elB, q); par.elV = drag(F.elV, q); }
    else if (namn === 'ice') par.ice = drag(P.efIce.v, q) / P.efIce.v[0];
    else if (namn === 'ev') par.ev = drag(P.efEv.v, q) / P.efEv.v[0];
    else if (namn === 'eld') par.eld = drag(P.eldrift.v, q) / P.eldrift.v[0];
    else if (namn === 'bas') par.zb = probit(q);
    else if (namn === 'pend') par.pend = drag(P.pendling.v, q);
    return par;
  }
  function basFaktor(par, kk) { return Math.exp(sigmaBas(kk) * par.zb); }

  /* ---------- Effekt av ett åtgärdspaket med givna parametrar (samma regler som app.js) ---------- */
  function effekt(atg, kontext, par) {
    var aktiva = [];
    ATG.lista.forEach(function (m) {
      var st = atg[m.id];
      if (!st || !st.pa) return;
      var w = m.typ === 'binar' ? 1 : st.niva / 100;
      if (m.endastNy) w *= kontext.andelNy || 0;
      if (!(w > 0)) return;
      aktiva.push({ m: m, w: w });
    });
    var push = Math.min(1, kontext.pushExtra || 0);
    aktiva.forEach(function (a) { if (a.m.roll === 'push') push = Math.max(push, Math.min(1, a.w)); });
    var kPull = 1 - (1 - par.pup) * (1 - push);
    var grupper = {};
    aktiva.forEach(function (a) {
      var e = par.e[a.m.id], kf = a.m.roll === 'pull' ? kPull : 1;
      (grupper[a.m.grupp] = grupper[a.m.grupp] || []).push({ B: e.B * a.w * kf, V: e.V * a.w * kf, C: e.C * a.w });
    });
    var f = { B: 1, V: 1, C: 1 };
    Object.keys(grupper).forEach(function (g) {
      ['B', 'V', 'C'].forEach(function (p) {
        var v = grupper[g].map(function (x) { return x[p]; }).sort(function (a, b) { return a - b; });
        var sum = 0;
        v.forEach(function (x, i) { sum += (i === 0 ? 1 : par.ov) * x; });
        f[p] *= 1 + Math.max(sum, -0.9);
      });
    });
    var t = kontext.tathet || 0;
    if (t > 0) { f.B *= Math.pow(1 + t, par.elB); f.V *= Math.pow(1 + t, par.elV); }
    return { fB: f.B, fV: f.V, fC: f.C };
  }

  /* ---------- Simulering ---------- */
  function simulera(atg, kontext, opt) {
    opt = opt || {};
    var n = opt.n || OS.mc.n, rho = opt.rho != null ? opt.rho : OS.mc.rho;
    var r = rng(opt.seed != null ? opt.seed : OS.mc.seed);
    var ut = { n: n, fB: new Float64Array(n), fV: new Float64Array(n), fC: new Float64Array(n), par: [] };
    for (var i = 0; i < n; i++) {
      var par = dragPar(r, rho, opt.sigmaS || 0), e = effekt(atg, kontext, par);
      ut.fB[i] = e.fB; ut.fV[i] = e.fV; ut.fC[i] = e.fC;
      ut.par.push({ ice: par.ice, ev: par.ev, eld: par.eld, zb: par.zb, pend: par.pend });
    }
    return ut;
  }

  // Utsläpp per fordonskm med dragna faktorer kring användarens antaganden
  function efDragen(bas, p) {
    var ev = Math.min(1, bas.el + bas.eldrift * p.eld * bas.lh);
    return (1 - ev) * bas.efIce * p.ice + ev * bas.efEv * p.ev;
  }

  // Område: bilar per hushåll, km per bil, fordonskm och CO₂-ekvivalenta fordonskm med åtgärder (tak = p-tal)
  function omrade(atg, kontext, B0, km0, tak, opt) {
    var s = simulera(atg, kontext, opt), n = s.n;
    var B = new Float64Array(n), K = new Float64Array(n), V = new Float64Array(n), Cv = new Float64Array(n);
    var V0 = B0 * km0;
    for (var i = 0; i < n; i++) {
      var b = B0 * s.fB[i], v = V0 * s.fV[i], k = v / b, bt = tak > 0 ? Math.min(b, tak) : b;
      B[i] = bt; K[i] = k; V[i] = bt * k; Cv[i] = bt * k * s.fC[i];
    }
    return { B: sammanfatta(B), K: sammanfatta(K), V: sammanfatta(V), Cv: sammanfatta(Cv), V0: V0 };
  }

  window.MC = {
    rng: rng, normal: normal, phi: phi, probit: probit, drag: drag, kvantil: kvantil, sammanfatta: sammanfatta,
    centralPar: centralPar, dragPar: dragPar, parMedKvantil: parMedKvantil, basFaktor: basFaktor,
    effekt: effekt, simulera: simulera, omrade: omrade, efDragen: efDragen
  };
})();
