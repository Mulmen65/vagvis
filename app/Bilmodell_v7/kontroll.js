/* Referenskontroll, osäkerhetsanalys och referenslista (dialogrutor).
   Kontrollfall och fördelningar: osakerhet.js. Simulering: mc.js. Samma beräkning i Python: osakerhet.py. */
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

  /* ================= Dialogrutor ================= */
  function oppna(dlg) {
    if (dlg.open) return;
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    document.documentElement.classList.add('dialog-oppen');
  }
  function stang(dlg) {
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  }
  function kopplaDialog(dlg) {
    dlg.addEventListener('close', function () { document.documentElement.classList.remove('dialog-oppen'); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) stang(dlg); });
    Array.prototype.forEach.call(dlg.querySelectorAll('[data-stang]'), function (b) { b.addEventListener('click', function () { stang(dlg); }); });
  }
  function flikar(rot, onByt) {
    var knappar = rot.querySelectorAll('[role="tab"]');
    function valj(i, fokus) {
      Array.prototype.forEach.call(knappar, function (b, j) {
        var v = i === j;
        b.setAttribute('aria-selected', v); b.tabIndex = v ? 0 : -1;
        $(b.getAttribute('aria-controls')).hidden = !v;
      });
      if (fokus) knappar[i].focus();
      if (onByt) onByt(knappar[i].getAttribute('aria-controls'));
    }
    Array.prototype.forEach.call(knappar, function (b, i) {
      b.addEventListener('click', function () { valj(i); });
      b.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        valj((i + (e.key === 'ArrowRight' ? 1 : knappar.length - 1)) % knappar.length, true);
      });
    });
    return valj;
  }

  /* ================= Referenskontroll ================= */
  var KS = { filter: 'alla', sok: '', ritad: false, osak: { kk: '1280', paket: 'stad_ivl' } };
  var valjKFlik = null;

  function oppnaKontroll(flik, markera) {
    var dlg = $('dlg-kontroll');
    oppna(dlg);
    if (!KS.ritad) { $('kk-laddar').hidden = false; }
    setTimeout(function () {
      resultat();
      if (!KS.ritad) { byggKontroll(); KS.ritad = true; $('kk-laddar').hidden = true; }
      if (flik) valjKFlik(flik === 'osakerhet' ? 1 : flik === 'metod' ? 2 : 0);
      else ritaDiagram();
      if (markera) {
        KS.filter = 'alla'; KS.sok = ''; $('kk-sok').value = ''; synkaFilter(); ritaDiagram();
        var rad = document.querySelector('.kk-rad[data-id="' + markera + '"]');
        if (rad) { rad.scrollIntoView({ block: 'center' }); rad.classList.add('markerad'); setTimeout(function () { rad.classList.remove('markerad'); }, 1800); }
      }
    }, 20);
  }

  function byggKontroll() {
    var R = resultat();
    valjKFlik = flikar($('kk-flikar'), function (id) {
      document.querySelector('#dlg-kontroll .dlg-kropp').scrollTop = 0;
      if (id === 'kk-vy-studier') ritaDiagram();
      if (id === 'kk-vy-osakerhet') ritaOsakerhet();
    });
    // sammanfattning
    var rader = R.rader, n = rader.length;
    var per = function (kat) { return rader.filter(function (r) { return kat === 'alla' || r.k.kategori === kat; }); };
    var okSt = function (st) { return st === 'inom' || st === 'forenligt' || st === 'riktning' || st === 'ovre'; };
    var obe = per('oberoende'), kal = per('kalibrering');
    var okObe = obe.filter(function (r) { return okSt(r.status); }).length;
    var okKal = kal.filter(function (r) { return okSt(r.status); }).length;
    var inomObe = obe.filter(function (r) { return r.status === 'inom'; }).length;
    var ov = R.ov, T = tackningMedOverforing();
    var faktor = Math.exp(ov.median);
    var under = obe.filter(function (r) { return r.status === 'under'; }).length, over = obe.filter(function (r) { return r.status === 'over'; }).length;
    $('kk-nyckel').innerHTML =
      ruta(n + ' kontroller', 'studie mot modell: ' + kal.length + ' kalibrering, ' + obe.length + ' oberoende, ' + per('baslinje').length + ' baslinje') +
      ruta(okObe + ' av ' + obe.length, 'oberoende studier inom eller förenliga med modellens intervall (' + inomObe + ' inom studiens intervall)') +
      ruta(T.inne + ' av ' + T.n, 'oberoende studievärden ligger inom modellens 90-procentsintervall') +
      ruta((faktor >= 1 ? '+' : '−') + f0.format(Math.abs(faktor - 1) * 100) + ' %', 'studierna visar i median ' + (faktor >= 1 ? 'större' : 'mindre') + ' effekt än modellens centrala värde (oberoende)');
    var avvKal = kal.filter(function (r) { return !okSt(r.status); });
    $('kk-tolkning').innerHTML =
      '<p><b>Kalibreringskontrollerna</b> visar att modellen återger sitt underlag: ' + okKal + ' av ' + kal.length + ' ligger inom eller är förenliga med studiernas resultat.' +
      (avvKal.length ? ' Undantagen är ' + uppr(avvKal) + ', där modellen ger ' + (avvKal.every(function (r) { return r.status === 'under'; }) ? 'mindre' : 'en annan') + ' effekt än studien.' + pullNot(avvKal) : '') + '</p>' +
      '<p><b>De oberoende kontrollerna</b> är det bästa måttet på träffsäkerheten. ' + okObe + ' av ' + obe.length + ' är förenliga med modellen.' +
      (under ? ' I ' + uppr(obe.filter(function (r) { return r.status === 'under'; })) + ' visar studien större effekt än modellen' : '') +
      (over ? (under ? ', i ' : ' I ') + uppr(obe.filter(function (r) { return r.status === 'over'; })) + ' mindre' : '') + (under || over ? '.' : '') +
      pullNot(obe.filter(function (r) { return r.status === 'under'; })) + '</p>' +
      '<p><b>Osäkerheten är större än spannen i underlaget.</b> Modellens 90-procentsintervall innehåller bara ' + T.inne + ' av ' + T.n + ' studievärden, vilket betyder att skillnaderna mellan städer och studier är större än parameterosäkerheten i modellen. ' +
      'Avvikelsen motsvarar en överföringsosäkerhet på σ = ' + tal(ov.sigma, 2) + ' på log-skala, det vill säga en faktor ' + tal(Math.exp(ov.sigma), 1).replace('−', '') + ' åt båda hållen (en standardavvikelse). ' +
      'Med den inräknad täcker intervallet ' + T.inneS + ' av ' + T.n + ' (i samma jämförelser som skattningen bygger på). Osäkerhetsanalysen visar resultaten både med och utan överföringsosäkerheten.</p>' +
      '<p class="kk-not">Skattningen bygger på ' + ov.n + ' jämförelser, flera med proxymått, och är därför grov. Modellen är i genomsnitt något försiktig: oberoende studier visar oftare större än mindre effekt.</p>';
    // filter
    var kat = [['alla', 'Alla ' + n], ['oberoende', 'Oberoende ' + obe.length], ['kalibrering', 'Kalibrering ' + kal.length], ['baslinje', 'Baslinje ' + per('baslinje').length]];
    $('kk-filter').innerHTML = kat.map(function (x) { return '<button type="button" data-kat="' + x[0] + '" aria-pressed="false">' + esc(x[1]) + '</button>'; }).join('');
    Array.prototype.forEach.call($('kk-filter').querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () { KS.filter = b.getAttribute('data-kat'); synkaFilter(); ritaDiagram(); });
    });
    $('kk-sok').addEventListener('input', function (e) { KS.sok = e.target.value.trim().toLowerCase(); ritaDiagram(); });
    synkaFilter();
    $('kk-svg').addEventListener('click', laddaSvg);
    $('kk-csv').addEventListener('click', laddaCsv);
    // osäkerhet: val
    var stadsPaket = (ATG.forval || []).filter(function (f) { return f.stad; });
    $('ko-paket').innerHTML = stadsPaket.map(function (f) { return '<option value="' + esc(f.id) + '">' + esc(f.namn) + '</option>'; }).join('') +
      '<option value="befintliga">Åtgärderna i fliken Befintliga områden</option>';
    $('ko-paket').value = KS.osak.paket;
    $('ko-paket').addEventListener('change', function (e) { KS.osak.paket = e.target.value; ritaOsakerhet(); });
    $('ko-stad').innerHTML = Object.keys(window.MODELL_META.kommuner).map(function (kk) {
      return '<label><input type="radio" name="ko-stad" value="' + kk + '"' + (kk === KS.osak.kk ? ' checked' : '') + '><span>' + esc(kommunNamn(kk)) + '</span></label>';
    }).join('');
    Array.prototype.forEach.call($('ko-stad').querySelectorAll('input'), function (inp) {
      inp.addEventListener('change', function () { if (inp.checked) { KS.osak.kk = inp.value; ritaOsakerhet(); } });
    });
    byggMetod();
    byggParametrar();
    window.addEventListener('resize', function () { if ($('dlg-kontroll').open) { ritaDiagram(); if (!$('kk-vy-osakerhet').hidden) ritaOsakerhet(); } });
  }
  function kortStudie(k) { return k.studie.split(', via')[0].split(', IVL')[0]; }
  function uppr(rader) {
    var t = rader.map(function (r) { return r.k.id + ' ' + kortStudie(r.k); });
    return t.length > 1 ? t.slice(0, -1).join(', ') + ' och ' + t[t.length - 1] : t[0];
  }
  // Förklaring när pull-regeln (utan push) bidrar till en underskattning
  function pullNot(rader) {
    var m = rader.filter(function (r) { return r.medPush != null; });
    if (!m.length) return '';
    return ' För ' + m.map(function (r) { return r.k.id; }).join(', ').replace(/, ([^,]*)$/, ' och $1') + ' beror en del av skillnaden på att pull-åtgärder räknas med ' +
      f0.format(ATG.samverkan.pullUtanPush[0] * 100) + ' % när staden saknar push-åtgärder. Med push i bakgrunden, som parkeringsavgifter, ger modellen ' +
      m.map(function (r) { return vardeText(r.k, r.medPush) + ' (' + r.k.id + ')'; }).join(', ').replace(/, ([^,]*)$/, ' och $1') + '.';
  }
  function ruta(v, t) { return '<div><span class="kk-tal">' + esc(v) + '</span><span class="kk-tal-text">' + esc(t) + '</span></div>'; }
  function synkaFilter() {
    Array.prototype.forEach.call($('kk-filter').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-kat') === KS.filter); });
  }

  function synliga() {
    return resultat().rader.filter(function (r) {
      if (KS.filter !== 'alla' && r.k.kategori !== KS.filter) return false;
      if (!KS.sok) return true;
      var k = r.k, ms = (k.modell.val ? Object.keys(k.modell.val) : []).map(function (id) { var m = ATG.lista.filter(function (x) { return x.id === id; })[0]; return m ? m.namn : ''; });
      return [k.id, k.studie, k.plats, k.jamforelse, k.matt, k.tema, k.modelltext].concat(ms).join(' ').toLowerCase().indexOf(KS.sok) >= 0;
    });
  }

  // Gemensam skala för procentraderna
  function doman(rader) {
    var lo = 0, hi = 0;
    rader.forEach(function (r) {
      if (r.k.pub.enhet) return;
      var v = [r.central, r.s.p5, r.s.p95];
      if (r.k.typ !== 'riktning') { var sp = pubSpann(r.k.pub); v.push(sp[0], sp[1]); }
      v.forEach(function (x) { lo = Math.min(lo, x); hi = Math.max(hi, x); });
    });
    return [Math.floor((lo - 1) / 5) * 5, Math.max(0, Math.ceil((hi + 0.5) / 5) * 5)];
  }
  function farger(export_) {
    if (export_) return { ink: '#13222c', ink2: '#44545d', muted: '#6b7a82', line: '#d2dbd9', line2: '#e5eae8', sel: '#e0581f', panel: '#ffffff', pubFill: 'rgba(19,34,44,0.16)' };
    var ink = cssVar('--ink');
    return { ink: ink, ink2: cssVar('--ink-2'), muted: cssVar('--muted'), line: cssVar('--line'), line2: cssVar('--line-2'), sel: cssVar('--sel'), panel: cssVar('--panel'),
      pubFill: 'color-mix(in srgb, ' + ink + ' 18%, transparent)' };
  }

  // En rad i diagrammet som SVG-element (utan yttre <svg>). Studien ritas i övre fältet, modellen i det undre.
  function radSvg(r, x0, x1, y, dom, C) {
    var k = r.k, enhet = k.pub.enhet, d = dom, yp = y - 7, ym = y + 7;
    if (enhet) {
      var v = [r.central, r.s.p5, r.s.p95, k.pub.v];
      d = [Math.floor(Math.min.apply(null, v) * 100 - 1) / 100, Math.ceil(Math.max.apply(null, v) * 100 + 1) / 100];
    }
    var X = function (v) { return x0 + (v - d[0]) / (d[1] - d[0]) * (x1 - x0); };
    var s = '';
    if (!enhet && d[0] < 0 && d[1] >= 0) s += '<line x1="' + X(0).toFixed(1) + '" x2="' + X(0).toFixed(1) + '" y1="' + (y - 15) + '" y2="' + (y + 15) + '" stroke="' + C.muted + '" stroke-dasharray="2 3"/>';
    if (enhet) {
      [d[0], d[1]].forEach(function (t, i) {
        s += '<text x="' + X(t).toFixed(1) + '" y="' + (y + 28) + '" font-size="10.5" fill="' + C.muted + '" text-anchor="' + (i ? 'end' : 'start') + '">' + tal(t, 2) + ' kg/km</text>';
      });
      s += '<line x1="' + x0 + '" x2="' + x1 + '" y1="' + (y + 16) + '" y2="' + (y + 16) + '" stroke="' + C.line + '"/>';
    }
    var pub = k.pub;
    if (k.typ === 'riktning') {
      var xa = X(0), xb = Math.max(x0 + 4, xa - 46);
      s += '<line x1="' + xa.toFixed(1) + '" x2="' + (xb + 6).toFixed(1) + '" y1="' + yp + '" y2="' + yp + '" stroke="' + C.ink + '" stroke-width="2"/>' +
        '<path d="M' + xb.toFixed(1) + ' ' + yp + ' l8 -5 v10 z" fill="' + C.ink + '"/>';
    } else if (k.typ === 'ovre') {
      var b = -Math.max(Math.abs(pub.lo), Math.abs(pub.hi));
      s += '<rect x="' + X(b).toFixed(1) + '" y="' + (yp - 5) + '" width="' + (X(0) - X(b)).toFixed(1) + '" height="10" fill="none" stroke="' + C.ink + '" stroke-dasharray="3 2"/>';
      var sp0 = pubSpann(pub);
      s += '<rect x="' + X(sp0[0]).toFixed(1) + '" y="' + (yp - 5) + '" width="' + Math.max(2, X(sp0[1]) - X(sp0[0])).toFixed(1) + '" height="10" style="fill:' + C.pubFill + '" stroke="' + C.ink + '"/>';
    } else {
      var sp = pubSpann(pub);
      if (sp[1] > sp[0]) s += '<rect x="' + X(sp[0]).toFixed(1) + '" y="' + (yp - 5) + '" width="' + (X(sp[1]) - X(sp[0])).toFixed(1) + '" height="10" rx="2" style="fill:' + C.pubFill + '" stroke="' + C.ink + '"/>';
      if (pub.v != null) { var xv = X(pub.v); s += '<path d="M' + xv.toFixed(1) + ' ' + (yp - 6) + ' l6 6 l-6 6 l-6 -6 z" fill="' + C.ink + '" stroke="' + C.panel + '" stroke-width="1"/>'; }
    }
    // modellen
    var a = X(r.s.p5), bb = X(r.s.p95), c = X(r.central);
    s += '<line x1="' + a.toFixed(1) + '" x2="' + bb.toFixed(1) + '" y1="' + ym + '" y2="' + ym + '" stroke="' + C.sel + '" stroke-width="2.5"/>' +
      '<line x1="' + a.toFixed(1) + '" x2="' + a.toFixed(1) + '" y1="' + (ym - 4) + '" y2="' + (ym + 4) + '" stroke="' + C.sel + '" stroke-width="2"/>' +
      '<line x1="' + bb.toFixed(1) + '" x2="' + bb.toFixed(1) + '" y1="' + (ym - 4) + '" y2="' + (ym + 4) + '" stroke="' + C.sel + '" stroke-width="2"/>' +
      '<circle cx="' + c.toFixed(1) + '" cy="' + ym + '" r="5" fill="' + C.sel + '" stroke="' + C.panel + '" stroke-width="1.5"/>';
    return s;
  }
  function axel(x0, x1, dom, C, nedre) {
    var X = function (v) { return x0 + (v - dom[0]) / (dom[1] - dom[0]) * (x1 - x0); };
    var steg = dom[1] - dom[0] > 40 ? 10 : 5, s = '', y = nedre ? 6 : 20;
    for (var t = Math.ceil(dom[0] / steg) * steg; t <= dom[1] + 1e-9; t += steg) {
      s += '<line x1="' + X(t).toFixed(1) + '" x2="' + X(t).toFixed(1) + '" y1="' + (nedre ? 0 : 24) + '" y2="' + (nedre ? 4 : 28) + '" stroke="' + C.muted + '"/>' +
        '<text x="' + X(t).toFixed(1) + '" y="' + (nedre ? 17 : y) + '" font-size="11.5" fill="' + C.ink2 + '" text-anchor="middle">' + (t === 0 ? '0' : tal(t)) + ' %</text>';
    }
    return s;
  }

  function ritaDiagram() {
    if (!KS.ritad && !RES) return;
    var rader = synliga(), alla = resultat().rader, dom = doman(alla), C = farger(false);
    var mal = $('kk-rader');
    if (!rader.length) { mal.innerHTML = '<p class="kk-tom">Inga kontroller matchar sökningen.</p>'; $('kk-axel').innerHTML = ''; $('kk-tabell').innerHTML = ''; return; }
    var w = Math.max(160, ($('kk-axel').clientWidth || 300));
    $('kk-axel').innerHTML = '<svg width="' + w + '" height="30" aria-hidden="true">' + axel(8, w - 8, dom, C, false) + '</svg>';
    var tema = null, h = '';
    rader.forEach(function (r) {
      var k = r.k, S = STATUS[r.status];
      if (k.tema !== tema) { tema = k.tema; h += '<h4 class="kk-tema">' + esc(tema) + '</h4>'; }
      var aria = k.id + ', ' + k.studie + ': publicerat ' + k.pub.text + '; modellen ' + vardeText(k, r.central) + ' (90 %: ' + vardeText(k, r.s.p5) + ' till ' + vardeText(k, r.s.p95) + '). ' + statusText(k, r.status) + '.';
      h += '<div class="kk-rad" data-id="' + k.id + '">' +
        '<div class="kk-etikett"><span class="kk-id">' + k.id + '</span> <span class="kk-kat kat-' + k.kategori + '">' + katNamn(k.kategori) + '</span>' +
        '<b>' + esc(k.studie) + '</b><span class="kk-sub">' + esc(k.plats) + ' · ' + esc(k.matt) + '</span></div>' +
        '<div class="kk-plot"><svg width="' + w + '" height="' + (k.pub.enhet ? 54 : 36) + '" role="img" aria-label="' + esc(aria) + '">' + radSvg(r, 8, w - 8, 18, dom, C) + '</svg></div>' +
        '<div class="kk-status"><span class="status st-' + S.klass + '"><span aria-hidden="true">' + S.ikon + '</span> ' + esc(statusText(k, r.status)) + '</span>' +
        '<span class="kk-varden">Studien ' + esc(k.pub.text) + ' · modellen ' + esc(vardeText(k, r.central)) + '</span></div></div>';
    });
    mal.innerHTML = h;
    $('kk-axel-ned').innerHTML = '<svg width="' + w + '" height="22" aria-hidden="true">' + axel(8, w - 8, dom, C, true) + '</svg>';
    $('kk-antal').textContent = rader.length === alla.length ? 'Alla ' + alla.length + ' kontroller' : rader.length + ' av ' + alla.length + ' kontroller';
    ritaTabell(rader);
  }
  function katNamn(k) { return { kalibrering: 'Kalibrering', oberoende: 'Oberoende', baslinje: 'Baslinje' }[k] || k; }
  function vardeText(k, v) { return k.pub.enhet ? tal(v, 3) + ' kg/km' : proc(v); }

  function ritaTabell(rader) {
    $('kk-tabell-antal').textContent = rader.length;
    $('kk-tabell').innerHTML = rader.map(function (r) {
      var k = r.k, ref = REF[k.ref];
      var not = [k.proxy || '', k.not || ''];
      if (r.medPush != null) not.push('Utan push räknas pull-åtgärderna med ' + f0.format(r.kPull * 100) + ' %. Om staden redan har push-åtgärder blir modellvärdet ' + vardeText(k, r.medPush) + '.');
      return '<tr><td class="kk-nr">' + k.id + '</td>' +
        '<td><b>' + esc(k.studie) + '</b>' + (ref && ref.url ? ' <a href="' + esc(ref.url) + '" target="_blank" rel="noopener">Källa</a>' : '') +
        '<span class="kk-sub">' + esc(k.plats) + '. ' + esc(k.jamforelse) + '. Mått: ' + esc(k.matt) + '.</span></td>' +
        '<td class="tal">' + esc(k.pub.text) + '</td>' +
        '<td class="tal">' + esc(vardeText(k, r.central)) + '</td>' +
        '<td class="tal">' + esc(vardeText(k, r.s.p5)) + ' till ' + esc(vardeText(k, r.s.p95)) + '</td>' +
        '<td><span class="status st-' + STATUS[r.status].klass + '">' + esc(statusText(k, r.status)) + '</span>' +
        (not.join(' ').trim() ? '<span class="kk-sub">' + esc(not.join(' ').trim()) + '</span>' : '') + '</td>' +
        '<td>' + katNamn(k.kategori) + '</td><td class="kk-inst">' + esc(k.modelltext) + '</td></tr>';
    }).join('');
  }

  /* ---------- Export ---------- */
  function ladda(namn, text, typ) {
    var blob = new Blob([text], { type: typ });
    var l = document.createElement('a');
    l.href = URL.createObjectURL(blob); l.download = namn;
    document.body.appendChild(l); l.click(); document.body.removeChild(l);
    setTimeout(function () { URL.revokeObjectURL(l.href); }, 1000);
  }
  function laddaSvg() {
    var rader = synliga(), dom = doman(resultat().rader), C = farger(true);
    var W = 1100, L = 330, Rw = 230, x0 = L, x1 = W - Rw - 10, top = 86, rh = 40, H = top + rader.length * rh + 60;
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" font-family="Barlow, Arial, sans-serif">' +
      '<rect width="100%" height="100%" fill="#ffffff"/>' +
      '<text x="20" y="30" font-size="20" font-weight="600" fill="' + C.ink + '">Referenskontroll: publicerade studier mot modellen</text>' +
      '<text x="20" y="52" font-size="13" fill="' + C.ink2 + '">◆ studiens värde, ▬ studiens intervall, ● modellens centrala värde, — modellens 90-procentsintervall. Effekt i procent; negativt = minskning.</text>' +
      '<g transform="translate(0,' + (top - 30) + ')">' + axel(x0, x1, dom, C, false) + '</g>';
    rader.forEach(function (r, i) {
      var y = top + i * rh + 18, k = r.k;
      if (i % 2 === 0) s += '<rect x="10" y="' + (y - 18) + '" width="' + (W - 20) + '" height="' + rh + '" fill="#f4f7f6"/>';
      s += '<text x="20" y="' + (y - 2) + '" font-size="12.5" font-weight="600" fill="' + C.ink + '">' + esc(trunk(k.id + ' ' + k.studie, 50)) + '</text>' +
        '<text x="20" y="' + (y + 13) + '" font-size="11" fill="' + C.ink2 + '">' + esc(trunk(katNamn(k.kategori) + ' · ' + k.matt, 58)) + '</text>' +
        radSvg(r, x0, x1, y, dom, C) +
        '<text x="' + (W - Rw) + '" y="' + (y + 4) + '" font-size="12" fill="' + C.ink + '">' + esc(statusText(k, r.status)) + '</text>';
    });
    s += '<text x="20" y="' + (H - 20) + '" font-size="11" fill="' + C.muted + '">Monte Carlo ' + OS.mc.n + ' dragningar, korrelation ' + tal(OS.mc.rho, 1) + '. Modellversion ' + esc(OS.version) + '.</text></svg>';
    ladda('referenskontroll.svg', s, 'image/svg+xml');
  }
  function laddaCsv() {
    var rad = function (a) { return a.map(function (v) { return typeof v === 'number' ? String(Math.round(v * 1000) / 1000).replace('.', ',') : '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(';'); };
    var ut = [rad(['Nr', 'Kategori', 'Tema', 'Studie', 'Plats', 'Jämförelse', 'Mått', 'Publicerat', 'Modell centralt', 'Modell P5', 'Modell P50', 'Modell P95', 'Tolkning', 'Modellinställning', 'Proxy'])];
    resultat().rader.forEach(function (r) {
      var k = r.k;
      ut.push(rad([k.id, katNamn(k.kategori), k.tema, k.studie, k.plats, k.jamforelse, k.matt, k.pub.text, r.central, r.s.p5, r.s.p50, r.s.p95, statusText(k, r.status), k.modelltext, k.proxy || '']));
    });
    ladda('referenskontroll.csv', '﻿' + ut.join('\r\n'), 'text/csv;charset=utf-8');
  }

  /* ================= Osäkerhetsanalys ================= */
  function paketTillstand(id) { return id === 'befintliga' ? BM.atgBefintliga() : BM.tillstandFranForval(id); }
  function stadsdata(kk) {
    var fkm = 0;
    window.DESO.forEach(function (r) { if (r.kk === kk) fkm += r.hh * r.bph * r.km; });
    return { fkm: fkm, bas: window.KLIMAT.bas(kk) };
  }
  function tonFor(D, kk, par, f) {
    var t0 = D.fkm * MC.basFaktor(par, kk) * MC.efDragen(D.bas, par) / 1000;
    return { t0: t0, t: t0 * f.fV * f.fC };
  }
  function simuleraStad(kk, atg, opt) {
    var D = stadsdata(kk), s = MC.simulera(atg, { andelNy: 0, tathet: 0 }, opt), n = s.n;
    var t0 = [], t = [], m = [], p = [];
    for (var i = 0; i < n; i++) {
      var x = tonFor(D, kk, s.par[i], { fV: s.fV[i], fC: s.fC[i] });
      t0.push(x.t0); t.push(x.t); m.push(x.t0 - x.t); p.push((s.fV[i] * s.fC[i] - 1) * 100);
    }
    return { t0: MC.sammanfatta(t0), t: MC.sammanfatta(t), m: MC.sammanfatta(m), p: MC.sammanfatta(p) };
  }

  function ritaOsakerhet() {
    var kk = KS.osak.kk, id = KS.osak.paket, atg = paketTillstand(id), K = kommunNamn(kk);
    var E = BM.atgardseffekt(atg, { andelNy: 0, tathet: 0 });
    var D = stadsdata(kk), cp = MC.centralPar();
    var c = tonFor(D, kk, cp, MC.effekt(atg, { andelNy: 0, tathet: 0 }, cp));
    var sigma = resultat().ov.sigma;
    var A = simuleraStad(kk, atg, {}), B = simuleraStad(kk, atg, { sigmaS: sigma });
    var namn = id === 'befintliga' ? 'åtgärderna i fliken Befintliga områden' : ((ATG.forval.filter(function (f) { return f.id === id; })[0] || {}).namn || id);
    if (!E.aktiv) {
      $('ko-resultat').innerHTML = '<p>Inga åtgärder är valda i fliken Befintliga områden. Välj ett paket ovan.</p>';
      $('ko-jamfor').innerHTML = ''; $('ko-tornado').innerHTML = ''; return;
    }
    var iv = function (s, f) { return f(s.p5) + ' till ' + f(s.p95); };
    var negp = function (v) { return proc(-v); };
    var KOL = ['Utan åtgärder', 'Med paketet', 'Minskning', 'Minskning, %'];
    var rad = function (namn, v) { return '<tr><th scope="row">' + namn + '</th>' + v.map(function (x, i) { return '<td class="tal" data-etikett="' + KOL[i] + '">' + x + '</td>'; }).join('') + '</tr>'; };
    $('ko-resultat').innerHTML =
      '<p class="ko-ingress">Hushållens bilar i ' + esc(K) + ' med ' + (id === 'befintliga' ? esc(namn) : 'paketet ”' + esc(namn) + '”') + ' genomfört lika i alla områden. Antagandena om elbilar och utsläpp är desamma som i fliken Klimatpåverkan.</p>' +
      '<div class="tabell-rull ko-stapla"><table class="ko-tabell"><thead><tr><th scope="col"><span class="sr-only">Värde</span></th>' + KOL.map(function (k) { return '<th scope="col" class="tal">' + k + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rad('Centralt värde', [ton(c.t0), ton(c.t), ton(c.t0 - c.t), negp((E.fV[0] * E.fC[0] - 1) * 100)]) +
      rad('Median', [ton(A.t0.p50), ton(A.t.p50), ton(A.m.p50), negp(A.p.p50)]) +
      rad('90 %, parametrar', [iv(A.t0, ton), iv(A.t, ton), iv(A.m, ton), negp(A.p.p95) + ' till ' + negp(A.p.p5)]) +
      rad('90 %, inklusive överföring', [iv(B.t0, ton), iv(B.t, ton), iv(B.m, ton), negp(B.p.p95) + ' till ' + negp(B.p.p5)]) +
      '</tbody></table></div>' +
      '<p class="falt-hjalp">Centralt värde är modellens vanliga resultat. Fördelningen är skev: underlaget har en längre svans mot stora effekter, så medianen ligger något över det centrala värdet. Överföringsosäkerheten (σ = ' + tal(sigma, 2) + ') är skattad från de oberoende kontrollerna.</p>';

    // Jämförelse av intervall
    var rader = [];
    rader.push({ t: 'Gamla spannet: alla åtgärder lägst respektive högst', lo: (Math.max(E.fV[1] * E.fC[1], E.fV[2] * E.fC[2]) - 1) * 100, hi: (Math.min(E.fV[1] * E.fC[1], E.fV[2] * E.fC[2]) - 1) * 100, med: null });
    (OS.mc.rhoTest || [0, 0.5, 1]).forEach(function (rho) {
      var s = MC.simulera(atg, { andelNy: 0, tathet: 0 }, { rho: rho }), v = [];
      for (var i = 0; i < s.n; i++) v.push((s.fV[i] * s.fC[i] - 1) * 100);
      var q = MC.sammanfatta(v);
      rader.push({ t: 'Korrelation ' + tal(rho, 1) + (rho === OS.mc.rho ? ' (standard)' : ''), lo: q.p95, hi: q.p5, med: q.p50, std: rho === OS.mc.rho });
    });
    rader.push({ t: 'Inklusive överföringsosäkerhet', lo: B.p.p95, hi: B.p.p5, med: B.p.p50 });
    var central = (E.fV[0] * E.fC[0] - 1) * 100;
    $('ko-jamfor').innerHTML = intervallDiagram(rader, central);

    // Tornado
    $('ko-tornado').innerHTML = tornado(kk, atg, E, D, c.t0 - c.t);
  }

  function intervallDiagram(rader, central) {
    var C = farger(false), w = Math.max(280, $('ko-jamfor').clientWidth || 600), L = Math.min(250, w * 0.42), x0 = L + 10, x1 = w - 14, rh = 30;
    var lo = Math.min.apply(null, rader.map(function (r) { return Math.min(r.lo, r.hi); }).concat([central])), hi = Math.max.apply(null, rader.map(function (r) { return Math.max(r.lo, r.hi); }).concat([0]));
    var dom = [Math.floor((lo - 1) / 5) * 5, Math.max(0, Math.ceil(hi / 5) * 5)];
    var X = function (v) { return x0 + (v - dom[0]) / (dom[1] - dom[0]) * (x1 - x0); };
    var H = rader.length * rh + 48;
    var s = '<svg width="' + w + '" height="' + H + '" role="img" aria-label="Minskning av CO₂ i procent, 90-procentsintervall med olika antaganden">';
    s += '<line x1="' + X(central).toFixed(1) + '" x2="' + X(central).toFixed(1) + '" y1="4" y2="' + (rader.length * rh + 8) + '" stroke="' + C.ink + '" stroke-dasharray="3 3"/>';
    rader.forEach(function (r, i) {
      var y = i * rh + 20, a = X(Math.min(r.lo, r.hi)), b = X(Math.max(r.lo, r.hi));
      s += '<text x="0" y="' + (y + 4) + '" font-size="12.5" fill="' + (r.std ? C.ink : C.ink2) + '"' + (r.std ? ' font-weight="600"' : '') + '>' + esc(trunk(r.t, L / 6.3)) + '</text>' +
        '<rect x="' + a.toFixed(1) + '" y="' + (y - 5) + '" width="' + Math.max(2, b - a).toFixed(1) + '" height="10" rx="3" fill="' + (r.med == null ? 'none' : C.sel) + '" fill-opacity="' + (r.std ? 0.9 : 0.55) + '" stroke="' + C.sel + '"' + (r.med == null ? ' stroke-dasharray="3 2"' : '') + '/>' +
        (r.med != null ? '<circle cx="' + X(r.med).toFixed(1) + '" cy="' + y + '" r="4" fill="' + C.panel + '" stroke="' + C.ink + '" stroke-width="1.5"/>' : '') +
        '<text x="' + (b + 6).toFixed(1) + '" y="' + (y + 4) + '" font-size="11.5" fill="' + C.muted + '">' + (b + 90 < x1 + 14 ? esc(proc(Math.max(r.lo, r.hi)).replace(' %', '') + '…' + proc(Math.min(r.lo, r.hi))) : '') + '</text>';
    });
    var steg = dom[1] - dom[0] > 40 ? 10 : 5, yA = rader.length * rh + 14;
    for (var t = dom[0]; t <= dom[1] + 1e-9; t += steg) s += '<text x="' + X(t).toFixed(1) + '" y="' + (yA + 14) + '" font-size="11.5" fill="' + C.ink2 + '" text-anchor="middle">' + (t === 0 ? '0' : tal(t)) + ' %</text><line x1="' + X(t).toFixed(1) + '" x2="' + X(t).toFixed(1) + '" y1="' + yA + '" y2="' + (yA + 4) + '" stroke="' + C.muted + '"/>';
    s += '</svg>';
    return s + '<p class="falt-hjalp">Staplarna visar 5:e till 95:e percentilen av förändringen i CO₂, ringen medianen och den streckade linjen modellens centrala värde (' + proc(central) + '). Det gamla spannet är streckat: där får alla åtgärder sin lägsta respektive högsta effekt samtidigt.</p>';
  }
  function trunk(s, n) { n = Math.floor(n); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function tornado(kk, atg, E, D, mc0) {
    var params = [];
    E.poster.forEach(function (p) { if (p.id !== 'fortatning') params.push({ id: 'atg:' + p.id, namn: p.namn }); });
    params.push({ id: 'ov', namn: 'Överlapp inom en åtgärdsgrupp' });
    if (E.roller.pull && E.push < 1) params.push({ id: 'pup', namn: 'Pull-åtgärdernas effekt utan push' });
    params.push({ id: 'ice', namn: P.efIce.namn }, { id: 'ev', namn: P.efEv.namn }, { id: 'eld', namn: P.eldrift.namn }, { id: 'bas', namn: 'Fordonskm i bilmodellen' });
    var kontext = { andelNy: 0, tathet: 0 };
    var ut = params.map(function (p) {
      var v = [0.05, 0.95].map(function (q) {
        var par = MC.parMedKvantil(p.id, q), x = tonFor(D, kk, par, MC.effekt(atg, kontext, par));
        return x.t0 - x.t;
      });
      return { namn: p.namn, lo: Math.min(v[0], v[1]) - mc0, hi: Math.max(v[0], v[1]) - mc0 };
    }).filter(function (x) { return Math.abs(x.hi - x.lo) > 1; })
      .sort(function (a, b) { return (b.hi - b.lo) - (a.hi - a.lo); }).slice(0, 10);
    var C = farger(false), w = Math.max(280, $('ko-tornado').clientWidth || 600), L = Math.min(270, w * 0.45), x0 = L + 10, x1 = w - 60, rh = 28;
    var m = Math.max.apply(null, ut.map(function (x) { return Math.max(Math.abs(x.lo), Math.abs(x.hi)); })) || 1;
    var mid = (x0 + x1) / 2, X = function (v) { return mid + v / m * (x1 - x0) / 2; };
    var H = ut.length * rh + 40;
    var s = '<svg width="' + w + '" height="' + H + '" role="img" aria-label="Tornadodiagram: hur mycket minskningen i ton ändras när en parameter i taget sätts till sin 5:e respektive 95:e percentil">';
    s += '<line x1="' + mid + '" x2="' + mid + '" y1="2" y2="' + (ut.length * rh + 6) + '" stroke="' + C.ink + '"/>';
    ut.forEach(function (x, i) {
      var y = i * rh + 16;
      s += '<text x="0" y="' + (y + 4) + '" font-size="12.5" fill="' + C.ink2 + '">' + esc(trunk(x.namn, L / 6.2)) + '</text>' +
        '<rect x="' + X(x.lo).toFixed(1) + '" y="' + (y - 7) + '" width="' + (mid - X(x.lo)).toFixed(1) + '" height="14" fill="' + C.ink2 + '" fill-opacity="0.55"/>' +
        '<rect x="' + mid + '" y="' + (y - 7) + '" width="' + (X(x.hi) - mid).toFixed(1) + '" height="14" fill="' + C.sel + '" fill-opacity="0.85"/>' +
        '<text x="' + (X(x.hi) + 5).toFixed(1) + '" y="' + (y + 4) + '" font-size="11" fill="' + C.muted + '">' + (x.hi > 0 ? '+' : '') + tal(Math.round(x.hi / 100) * 100) + '</text>';
    });
    s += '<text x="' + mid + '" y="' + (ut.length * rh + 26) + '" font-size="11.5" fill="' + C.ink2 + '" text-anchor="middle">Minskning ' + ton(mc0) + ' per år (centralt)</text></svg>';
    return s + '<p class="falt-hjalp">En parameter i taget sätts till sin 5:e respektive 95:e percentil medan övriga har sina centrala värden. Orange stapel: större minskning, grå: mindre. Utsläppsfaktorn och bilmodellens fordonskm påverkar minskningen i ton men inte i procent.</p>';
  }

  function byggParametrar() {
    var spann = function (v, dec) { return tal(v[1], dec) + ' – ' + tal(v[0], dec) + ' – ' + tal(v[2], dec); };
    var rader = [
      [P.efIce.namn, spann(P.efIce.v, 2) + ' kg/km', P.efIce.text],
      [P.efEv.namn, spann(P.efEv.v, 3) + ' kg/km', P.efEv.text],
      [P.eldrift.namn, spann(P.eldrift.v.map(function (x) { return x * 100; }), 0) + ' %', P.eldrift.text + ' Källa: ' + P.eldrift.kalla + '.'],
      [P.fordonskm.namn, Object.keys(P.fordonskm.kommuner).map(function (kk) { var b = P.fordonskm.kommuner[kk]; return kommunNamn(kk) + ' ' + proc((b.p5 - 1) * 100) + ' till +' + proc((b.p95 - 1) * 100).replace('−', ''); }).join(', '), P.fordonskm.text],
      [P.overlapp.namn, spann([ATG.samverkan.overlapp, P.overlapp.v[1], P.overlapp.v[2]].map(function (x) { return x * 100; }), 0) + ' %', P.overlapp.text],
      [P.pullUtanPush.namn, spann(ATG.samverkan.pullUtanPush.map(function (x) { return x * 100; }), 0) + ' %', P.pullUtanPush.text],
      ['Åtgärdernas effekter', 'Se tabellen nedan', TXT.fordelning],
      ['Korrelation mellan åtgärder', tal(OS.mc.rho, 1), TXT.korrelation]
    ];
    $('ko-parametrar').innerHTML = rader.map(function (r) { return '<tr><th scope="row">' + esc(r[0]) + '</th><td class="tal">' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td></tr>'; }).join('');
    var e = function (v) { return v[0] === 0 && v[1] === 0 && v[2] === 0 ? '–' : proc(v[1] * 100) + ' / ' + proc(v[0] * 100) + ' / ' + proc(v[2] * 100); };
    $('ko-atgarder').innerHTML = ATG.lista.map(function (m) {
      return '<tr><td>' + esc(m.namn) + '</td><td class="tal">' + e(m.eB) + '</td><td class="tal">' + e(m.eV) + '</td><td class="tal">' + e(m.eC || [0, 0, 0]) + '</td><td class="tal">' + esc(m.grad) + '</td></tr>';
    }).join('');
    $('ko-ingar').textContent = TXT.ingar;
    $('ko-ingar-inte').innerHTML = TXT.ingarInte.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
  }

  function byggMetod() {
    var ov = resultat().ov;
    $('km-metod').innerHTML = TXT.metod.map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('');
    $('km-status').innerHTML = ['inom', 'forenligt', 'under', 'over', 'riktning', 'ovre'].map(function (s) {
      return '<li><span class="status st-' + STATUS[s].klass + '">' + esc(STATUS[s].text) + '</span> ' + esc(TXT.status[s]) + '</li>';
    }).join('');
    $('km-overforing').innerHTML = '<p>För varje oberoende kontroll med ett värde räknas avvikelsen d = ln(studiens värde / modellens centrala värde). ' +
      'Medelvärdet av d² är ' + tal(ov.rms * ov.rms, 3) + ' (n = ' + ov.n + '). Modellens egen parameterosäkerhet, räknad från bredden på dess 90-procentsintervall, motsvarar ' + tal(ov.param * ov.param, 3) + '. ' +
      'Skillnaden är överföringsosäkerheten: σ = √(' + tal(ov.rms * ov.rms, 3) + ' − ' + tal(ov.param * ov.param, 3) + ') = <b>' + tal(ov.sigma, 2) + '</b>.</p>' +
      '<p>Den läggs på som en log-normal faktor på varje åtgärds effekt på bilinnehav och fordonskm, med samma korrelation mellan åtgärder som övriga parametrar. Den ingår i raden ”inklusive överföring” i osäkerhetsanalysen och i klimatfliken, men inte i referenskontrollens modellintervall, som ska visa parameterosäkerheten.</p>' +
      '<p>Skattningen bygger på få jämförelser och flera proxymått, där en del av avvikelsen beror på att studien mäter något annat än modellen. Den bör därför ses som en övre bedömning av överföringsosäkerheten.</p>';
  }

  /* ================= Referenser ================= */
  var RS = { filter: 'alla', sok: '', byggd: false };
  function refAnvandning() {
    var atg = {}, kon = {};
    var lagg = function (id, namn, mal) { (atg[id] = atg[id] || []).push({ namn: namn, mal: mal }); };
    ATG.lista.forEach(function (m) { (m.refs || []).forEach(function (r) { lagg(r, m.namn, m.id); }); });
    (ATG.fortatning.refs || []).forEach(function (r) { lagg(r, ATG.fortatning.namn, 'fortatning'); });
    (ATG.ptal.refs || []).forEach(function (r) { lagg(r, ATG.ptal.namn, 'ptal'); });
    (ATG.samverkan.refs || []).forEach(function (r) { lagg(r, 'Samverkan mellan åtgärder', 'samverkan'); });
    KONTROLLER.forEach(function (k) { (kon[k.ref] = kon[k.ref] || []).push(k.id); });
    Object.keys(P).forEach(function (pk) { (P[pk].refs || []).forEach(function (r) { (kon[r] = kon[r] || []); }); });
    return { atg: atg, kon: kon };
  }
  function norden(land) { return /Sverige|Norge|Danmark|Finland|Norden|Island/.test(land || ''); }
  function oppnaReferenser(id) {
    var dlg = $('dlg-ref');
    if (!RS.byggd) byggReferenser();
    oppna(dlg);
    if (id) {
      RS.filter = 'alla'; RS.sok = ''; $('rf-sok').value = ''; ritaReferenser();
      var el = $('rf-' + id);
      if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('markerad'); setTimeout(function () { el.classList.remove('markerad'); }, 1800); }
    }
  }
  function byggReferenser() {
    RS.byggd = true;
    var A = refAnvandning(), ids = Object.keys(REF);
    var antal = {
      alla: ids.length,
      atgarder: ids.filter(function (i) { return A.atg[i]; }).length,
      kontroll: ids.filter(function (i) { return A.kon[i] && A.kon[i].length; }).length,
      norden: ids.filter(function (i) { return norden(REF[i].land); }).length
    };
    var kat = [['alla', 'Alla ' + antal.alla], ['atgarder', 'Underlag för åtgärder ' + antal.atgarder], ['kontroll', 'I referenskontrollen ' + antal.kontroll], ['norden', 'Norden ' + antal.norden]];
    $('rf-filter').innerHTML = kat.map(function (x) { return '<button type="button" data-kat="' + x[0] + '" aria-pressed="' + (x[0] === RS.filter) + '">' + esc(x[1]) + '</button>'; }).join('');
    Array.prototype.forEach.call($('rf-filter').querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () { RS.filter = b.getAttribute('data-kat'); ritaReferenser(); });
    });
    $('rf-sok').addEventListener('input', function (e) { RS.sok = e.target.value.trim().toLowerCase(); ritaReferenser(); });
    RS.A = A;
    ritaReferenser();
  }
  function ritaReferenser() {
    var A = RS.A;
    Array.prototype.forEach.call($('rf-filter').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-kat') === RS.filter); });
    var ids = Object.keys(REF).filter(function (i) {
      var r = REF[i];
      if (RS.filter === 'atgarder' && !A.atg[i]) return false;
      if (RS.filter === 'kontroll' && !(A.kon[i] && A.kon[i].length)) return false;
      if (RS.filter === 'norden' && !norden(r.land)) return false;
      return !RS.sok || (r.text + ' ' + r.fynd + ' ' + r.land).toLowerCase().indexOf(RS.sok) >= 0;
    }).sort(function (a, b) { return REF[a].text.localeCompare(REF[b].text, 'sv'); });
    var res = window.KONTROLL.resultat ? (RES || null) : null;
    $('rf-antal').textContent = ids.length + (ids.length === 1 ? ' referens' : ' referenser');
    $('rf-lista').innerHTML = ids.length ? ids.map(function (i) {
      var r = REF[i], an = A.atg[i] || [], ko = (A.kon[i] || []);
      var konText = ko.map(function (kid) {
        var st = res ? res.rader.filter(function (x) { return x.k.id === kid; })[0] : null;
        return '<button type="button" class="lank-knapp rf-kk" data-kk="' + kid + '">' + kid + (st ? ' ' + esc(statusText(st.k, st.status)).toLowerCase() : '') + '</button>';
      }).join(' ');
      return '<li id="rf-' + esc(i) + '" class="rf-post"><p class="ref-text">' + esc(r.text) + ' <span class="ref-land">' + esc(r.land) + '</span></p>' +
        '<p class="ref-fynd">' + esc(r.fynd) + '</p>' +
        (r.url ? '<p class="ref-url"><a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.url.replace(/^https?:\/\//, '').slice(0, 72)) + (r.url.length > 80 ? '…' : '') + '</a></p>' : '') +
        ((an.length || ko.length) ? '<p class="rf-anv">' +
          (an.length ? '<span>Underlag för: ' + an.map(function (x) { return '<a href="#ref-' + esc(x.mal) + '" data-till-atg="' + esc(x.mal) + '">' + esc(x.namn) + '</a>'; }).join(', ') + '</span>' : '') +
          (ko.length ? '<span>Referenskontroll: ' + konText + '</span>' : '') + '</p>' : '') + '</li>';
    }).join('') : '<li class="kk-tom">Inga referenser matchar sökningen.</li>';
    Array.prototype.forEach.call($('rf-lista').querySelectorAll('[data-till-atg]'), function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); stang($('dlg-ref')); BM.visaReferens(a.getAttribute('data-till-atg')); });
    });
    Array.prototype.forEach.call($('rf-lista').querySelectorAll('[data-kk]'), function (b) {
      b.addEventListener('click', function () { stang($('dlg-ref')); oppnaKontroll('studier', b.getAttribute('data-kk')); });
    });
  }

  /* ================= Start ================= */
  kopplaDialog($('dlg-kontroll'));
  kopplaDialog($('dlg-ref'));
  $('knapp-kontroll').addEventListener('click', function () { oppnaKontroll(); });
  $('knapp-ref').addEventListener('click', function () { oppnaReferenser(); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-oppna]'), function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      var v = el.getAttribute('data-oppna');
      if (v === 'referenser') oppnaReferenser(el.getAttribute('data-ref') || null);
      else oppnaKontroll(v === 'osakerhet' ? 'osakerhet' : v === 'metod' ? 'metod' : null);
    });
  });
  window.KONTROLL.oppnaKontroll = oppnaKontroll;
  window.KONTROLL.oppnaReferenser = oppnaReferenser;
  if (location.hash === '#referenskontroll') oppnaKontroll();
  else if (location.hash === '#osakerhet') oppnaKontroll('osakerhet');
  else if (location.hash === '#referenser') oppnaReferenser();
})();
