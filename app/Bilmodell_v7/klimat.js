/* Klimatpåverkan från hushållens bilar – fliken Klimatpåverkan.
   CO₂ = hushåll × bilar per hushåll × km per bil × (ICE-andel × 0,15 + EV-andel × 0,02)
   EV-andel = elbilar + eldrift × laddhybrider (andelar av bilparken). Resten räknas som ICE.
   Ytorna i geo.js byggs av klimatmodell.py. Samma siffror som i kartbilderna. */
(function () {
  'use strict';
  var DESO = window.DESO, GEO = window.GEO;

  /* ---------- Antaganden (samma som i klimatmodell.py) ---------- */
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
  var KVOT = [0.6, 0.8, 0.93, 1.07, 1.2, 1.4];
  var KVOTTEXT = ['under 60 %', '60–80 %', '80–93 %', '93–107 %', '107–120 %', '120–140 %', 'över 140 %'];
  var FARGER = ['#1b7a52', '#4fa77a', '#a9d5b8', '#dcd9cf', '#f2b59c', '#df6b55', '#a8232b'];
  var MATT = {
    per_inv: { namn: 'kg CO₂ per invånare', enhet: 'kg CO₂ per invånare och år', kort: 'kg/inv' },
    per_hh: { namn: 'kg CO₂ per hushåll', enhet: 'kg CO₂ per hushåll och år', kort: 'kg/hushåll' },
    totalt: { namn: 'ton CO₂ totalt', enhet: 'ton CO₂ per år', kort: 'ton' }
  };
  var KALLOR = [
    { text: 'Dickinson, J., Hult, C., Lundström, H. & Roth, A. (2024). Snabb omställning av vägtrafiken för minskad klimatpåverkan. IVL Svenska Miljöinstitutet, rapport C820. Underlag för åtgärdspaketen och samverkansreglerna.',
      url: 'https://ivl.diva-portal.org/smash/get/diva2:1840739/FULLTEXT01.pdf' },
    { text: 'Trafikanalys (2026). Allt fler laddbara bilar i trafiken i Skåne län. Pressmeddelande 16 februari 2026, med tabell för Malmö och Helsingborg.',
      url: 'https://www.mynewsdesk.com/se/trafikanalys/pressreleases/allt-fler-laddbara-bilar-i-trafiken-i-skaane-laen-3432596' },
    { text: 'Trafikanalys (2026). Allt fler laddbara bilar i trafiken i Gävleborgs län. Pressmeddelande 16 februari 2026, med tabell för Gävle.',
      url: 'https://www.mynewsdesk.com/se/trafikanalys/pressreleases/allt-fler-laddbara-bilar-i-trafiken-i-gaevleborgs-laen-3432523' },
    { text: 'Trafikanalys (2024). 6 procent av bilarna i Gävleborgs län är laddbara. Pressmeddelande 19 februari 2024 (länet vid årsskiftet 2023/24).',
      url: 'https://www.mynewsdesk.com/se/trafikanalys/pressreleases/6-procent-av-bilarna-i-gaevleborgs-laen-aer-laddbara-3303586' },
    { text: 'Trafikanalys (2024). Var tionde bil är laddbar i Skåne län. Pressmeddelande 19 februari 2024 (Skåne vid årsskiftet 2023/24).',
      url: 'https://www.mynewsdesk.com/se/trafikanalys/pressreleases/var-tionde-bil-aer-laddbar-i-skaane-laen-3303532' },
    { text: 'Newsworthy (2022). Över 11 000 laddbara bilar i Malmö. Siffror från Power Circle, januari 2022.',
      url: 'https://www.newsworthy.se/artikel/137613/%C3%B6ver-11-000-laddbara-bilar-i-malm%C3%B6---men-bara-543-allm%C3%A4nna-laddstolpar' },
    { text: 'ICCT och Fraunhofer ISI (2022). Real-world usage of plug-in hybrid vehicles in Europe. Faktablad: privata laddhybrider körs 45–49 % på el, tjänstebilar 11–15 %.',
      url: 'https://theicct.org/wp-content/uploads/2022/06/fs-real-world-phev-use-jun22.pdf' },
    { text: 'Trafikanalys (2024). Fordon 2023. Statistik 2024:7 (andelar per drivmedel i hela landet).',
      url: 'https://www.trafa.se/globalassets/statistik/vagtrafik/fordon/2024/fordon-2023.pdf' },
    { text: 'SCB. BILPAK – statistikpaket om fordon för kommuner, bland annat per drivmedel och delområde.',
      url: 'https://www.scb.se/vara-tjanster/bestall-data-och-statistik/regionala-statistikprodukter/statistikpaket/bilpak/' }
  ];

  /* ---------- Tillstånd ---------- */
  var S = { kk: '1280', niva: 'deso', matt: 'per_inv', ar: '2025', egna: {}, eldrift: STANDARD.eldrift,
    efIce: STANDARD.efIce, efEv: STANDARD.efEv, vald: null, paket: 'inga' };
  var klar = false, karta = null, ytlager = null, granslager = null, lagerFor = {}, aktuellKey = '';

  function arPost(id) { for (var i = 0; i < AR.length; i++) if (AR[i].id === id) return AR[i]; return AR[0]; }
  function andelar(kk) {
    if (S.ar === 'egna') {
      if (!S.egna[kk]) { var a = arPost('2025').andelar[kk]; S.egna[kk] = { el: a.el, lh: a.lh, kalla: 'Egna värden.' }; }
      return S.egna[kk];
    }
    return arPost(S.ar).andelar[kk];
  }
  function evAndel(kk) { var a = andelar(kk); return Math.min(1, a.el + S.eldrift * a.lh); }
  function ef(kk) { var ev = evAndel(kk); return (1 - ev) * S.efIce + ev * S.efEv; }
  // Antagandena just nu (för osäkerhetsanalysen)
  function bas(kk) { var a = andelar(kk); return { el: a.el, lh: a.lh, eldrift: S.eldrift, efIce: S.efIce, efEv: S.efEv }; }
  // Standardantagandena för ett givet år, med valfria faktorer ur en Monte Carlo-dragning (referenskontrollen)
  function efStandard(kk, arId, par) {
    var a = arPost(arId).andelar[kk], p = par || { ice: 1, ev: 1, eld: 1 };
    var ev = Math.min(1, a.el + STANDARD.eldrift * p.eld * a.lh);
    return (1 - ev) * STANDARD.efIce * p.ice + ev * STANDARD.efEv * p.ev;
  }
  window.KLIMAT = { ef: ef, evAndel: evAndel, bas: bas, efStandard: efStandard, visa: visa };

  /* ---------- Hjälp ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var f0 = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 });
  var f1 = new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var f2 = new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function tal(s) { var v = parseFloat(String(s).replace(/\s/g, '').replace('%', '').replace(',', '.')); return isNaN(v) ? NaN : v; }
  function avrunda(v) { var steg = v >= 10000 ? 100 : (v >= 100 ? 10 : 1); return Math.floor(v / steg + 0.5) * steg; }
  function rund(v) { return f0.format(avrunda(v)); }
  function procent(v, dec) { return (dec ? f1 : f0).format(v * 100) + ' %'; }
  function kommunNamn(kk) { return window.MODELL_META.kommuner[kk].namn; }

  /* ---------- Åtgärdspaket i hela staden (samma beräkning som i flikarna med åtgärder) ---------- */
  function scenario() {
    var M = window.BILMODELL;
    if (S.paket === 'inga' || !M) return null;
    var st = S.paket === 'befintliga' ? M.atgBefintliga() : M.tillstandFranForval(S.paket);
    var E = M.atgardseffekt(st, { andelNy: 0, tathet: 0 });
    if (!E.aktiv) return null;
    var f = [0, 1, 2].map(function (k) { return E.fV[k] * E.fC[k]; });
    return { E: E, f: f, fV: E.fV[0], fC: E.fC[0], namn: paketNamn(S.paket) };
  }
  function paketNamn(id) {
    if (id === 'befintliga') return 'åtgärderna i fliken Befintliga områden';
    var f = (window.ATGARDER.forval || []).filter(function (x) { return x.id === id; })[0];
    return f ? f.namn : id;
  }

  /* ---------- Beräkning ---------- */
  function deso(kk) {
    var e = ef(kk), sc = scenario(), fak = sc ? sc.f[0] : 1;
    return DESO.filter(function (r) { return r.kk === kk; }).map(function (r) {
      var fkm0 = r.hh * r.bph * r.km, ton0 = fkm0 * e / 1000, ton = ton0 * fak;
      return { id: r.kod, namn: r.rs, sub: r.kod + ' · ' + r.sd, bef: r.bef, hh: r.hh, bph: r.bph, km: r.km,
        fkm: fkm0 * (sc ? sc.fV : 1), fkm0: fkm0, ton: ton, ton0: ton0,
        per_inv: ton * 1000 / r.bef, per_hh: ton * 1000 / r.hh, per_inv0: ton0 * 1000 / r.bef, per_hh0: ton0 * 1000 / r.hh };
    });
  }
  function omraden() {
    var d = deso(S.kk);
    if (S.niva === 'deso') return d;
    var g = {}, ordning = [];
    d.forEach(function (o) {
      var sd = o.sub.split(' · ')[1];
      if (!g[sd]) { g[sd] = { id: sd, namn: sd, n: 0, bef: 0, hh: 0, bilar: 0, fkm: 0, fkm0: 0, ton: 0, ton0: 0 }; ordning.push(sd); }
      var x = g[sd]; x.n++; x.bef += o.bef; x.hh += o.hh; x.bilar += o.bph * o.hh; x.fkm += o.fkm; x.fkm0 += o.fkm0; x.ton += o.ton; x.ton0 += o.ton0;
    });
    return ordning.map(function (sd) {
      var x = g[sd];
      x.sub = x.n + ' DeSO'; x.bph = x.bilar / x.hh; x.km = x.fkm0 / x.bilar;
      x.per_inv = x.ton * 1000 / x.bef; x.per_hh = x.ton * 1000 / x.hh;
      x.per_inv0 = x.ton0 * 1000 / x.bef; x.per_hh0 = x.ton0 * 1000 / x.hh;
      return x;
    });
  }
  function summa(lista) {
    var t = { bef: 0, hh: 0, fkm: 0, fkm0: 0, ton: 0, ton0: 0 };
    lista.forEach(function (o) { t.bef += o.bef; t.hh += o.hh; t.fkm += o.fkm; t.fkm0 += o.fkm0; t.ton += o.ton; t.ton0 += o.ton0; });
    t.per_inv = t.ton * 1000 / t.bef; t.per_hh = t.ton * 1000 / t.hh;
    t.per_inv0 = t.ton0 * 1000 / t.bef; t.per_hh0 = t.ton0 * 1000 / t.hh;
    return t;
  }
  // Färgklasserna utgår alltid från snittet utan åtgärder, så att ett åtgärdspaket syns som grönare karta.
  function snitt(lista, T) { return S.matt === 'per_inv' ? T.per_inv0 : (S.matt === 'per_hh' ? T.per_hh0 : T.ton0 / lista.length); }
  function klass(v, sn) { var i = 0; while (i < KVOT.length && v >= sn * KVOT[i]) i++; return i; }
  function varde(o) { return o[S.matt]; }
  function vardeText(v) { return rund(v) + ' ' + MATT[S.matt].kort; }

  /* ---------- Gränssnitt ---------- */
  function segment(el, namn, alt, varde, onChange) {
    el.innerHTML = alt.map(function (a) {
      return '<label><input type="radio" name="' + namn + '" value="' + a.v + '"' + (a.v === varde ? ' checked' : '') + '><span>' + esc(a.t) + '</span></label>';
    }).join('');
    Array.prototype.forEach.call(el.querySelectorAll('input'), function (inp) {
      inp.addEventListener('change', function () { if (inp.checked) onChange(inp.value); });
    });
  }
  function satt(el, v) { Array.prototype.forEach.call(el.querySelectorAll('input'), function (inp) { inp.checked = inp.value === v; }); }

  function init() {
    klar = true;
    segment($('k-stad'), 'k-stad', Object.keys(window.MODELL_META.kommuner).map(function (kk) { return { v: kk, t: kommunNamn(kk) }; }), S.kk,
      function (v) { S.kk = v; S.vald = null; render(true); });
    segment($('k-niva'), 'k-niva', [{ v: 'deso', t: 'DeSO' }, { v: 'sd', t: 'Stadsdelsområde' }], S.niva,
      function (v) { S.niva = v; S.vald = null; render(true); });
    $('k-matt').innerHTML = Object.keys(MATT).map(function (k) { return '<option value="' + k + '">' + MATT[k].namn + '</option>'; }).join('');
    $('k-matt').value = S.matt;
    $('k-matt').addEventListener('change', function (e) { S.matt = e.target.value; render(false); });
    $('k-ar').innerHTML = AR.map(function (a) { return '<option value="' + a.id + '">' + esc(a.namn) + '</option>'; }).join('') +
      '<option value="egna">Egna värden</option>';
    $('k-ar').value = S.ar;
    $('k-ar').addEventListener('change', function (e) {
      if (e.target.value === 'egna') { var a = andelar(S.kk); S.egna[S.kk] = { el: a.el, lh: a.lh, kalla: 'Egna värden.' }; }
      S.ar = e.target.value; render(false);
    });
    var falt = [
      ['k-el', function (v) { return v >= 0 && v <= 100; }, function (v) { var a = andelar(S.kk); S.egna[S.kk] = { el: v / 100, lh: a.lh, kalla: 'Egna värden.' }; S.ar = 'egna'; }],
      ['k-lh', function (v) { return v >= 0 && v <= 100; }, function (v) { var a = andelar(S.kk); S.egna[S.kk] = { el: a.el, lh: v / 100, kalla: 'Egna värden.' }; S.ar = 'egna'; }],
      ['k-eldrift', function (v) { return v >= 0 && v <= 100; }, function (v) { S.eldrift = v / 100; }],
      ['k-efice', function (v) { return v >= 0 && v <= 1; }, function (v) { S.efIce = v; }],
      ['k-efev', function (v) { return v >= 0 && v <= 1; }, function (v) { S.efEv = v; }]
    ];
    falt.forEach(function (f) {
      var el = $(f[0]);
      el.addEventListener('change', function () {
        var v = tal(el.value);
        var ok = !isNaN(v) && f[1](v);
        if (ok && (f[0] === 'k-el' || f[0] === 'k-lh')) {
          var a = andelar(S.kk), el2 = f[0] === 'k-el' ? v / 100 : a.el, lh2 = f[0] === 'k-lh' ? v / 100 : a.lh;
          ok = el2 + lh2 <= 1;
        }
        el.setAttribute('aria-invalid', ok ? 'false' : 'true');
        $('k-fel').hidden = ok;
        if (!ok) return;
        f[2](v);
        render(false);
      });
    });
    $('k-aterstall').addEventListener('click', function () {
      S.ar = '2025'; S.egna = {}; S.eldrift = STANDARD.eldrift; S.efIce = STANDARD.efIce; S.efEv = STANDARD.efEv;
      ['k-el', 'k-lh', 'k-eldrift', 'k-efice', 'k-efev'].forEach(function (id) { $(id).setAttribute('aria-invalid', 'false'); });
      $('k-fel').hidden = true;
      render(false);
    });
    $('k-ladda').addEventListener('click', laddaNer);
    var stadsPaket = (window.ATGARDER.forval || []).filter(function (f) { return f.stad; });
    $('k-paket').innerHTML = '<option value="inga">Inga åtgärder</option><option value="befintliga">Samma som i fliken Befintliga områden</option>' +
      stadsPaket.map(function (f) { return '<option value="' + esc(f.id) + '">' + esc(f.namn) + '</option>'; }).join('');
    $('k-paket').value = S.paket;
    $('k-paket').addEventListener('change', function (e) { S.paket = e.target.value; render(false); });
    $('k-kallor').innerHTML = KALLOR.map(function (k) {
      return '<li>' + esc(k.text) + ' <a href="' + esc(k.url) + '" target="_blank" rel="noopener">Länk</a></li>';
    }).join('');
    initKarta();
  }

  function initKarta() {
    if (!window.L || !GEO) { $('k-karta-saknas').hidden = false; return; }
    try {
      karta = L.map('k-karta', { scrollWheelZoom: false, zoomSnap: 0.25 });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(karta);
      karta.setView([55.58, 13.0], 11);
    } catch (e) {
      karta = null; $('k-karta-saknas').hidden = false;
    }
  }

  function byggLager() {
    var key = S.kk + '|' + S.niva;
    if (key === aktuellKey) return false;
    aktuellKey = key;
    if (ytlager) karta.removeLayer(ytlager);
    if (granslager) { karta.removeLayer(granslager); granslager = null; }
    lagerFor = {};
    var G = GEO.kommuner[S.kk];
    var fc = S.niva === 'deso' ? G.deso : G.sd;
    var nyckel = S.niva === 'deso' ? 'kod' : 'sd';
    ytlager = L.geoJSON(fc, {
      style: function (f) { return { color: '#ffffff', weight: S.niva === 'deso' ? 0.6 : 1.6, fillOpacity: 0.82, fillColor: FARGER[3], dashArray: f.properties.ungef ? '4 4' : null }; },
      onEachFeature: function (f, lager) {
        var id = f.properties[nyckel];
        lagerFor[id] = lager;
        lager.bindTooltip(function () { return tooltip(id); }, { sticky: true, className: 'kartetikett', direction: 'top', offset: [0, -6] });
        lager.on('mouseover', function () { if (S.vald !== id) lager.setStyle({ weight: 2.4, color: '#13222c' }); lager.bringToFront(); markeraValt(); });
        lager.on('mouseout', function () { stilFor(id, lager); markeraValt(); });
        lager.on('click', function () { valj(id, false); });
      }
    }).addTo(karta);
    if (S.niva === 'deso') {
      granslager = L.geoJSON(G.sd, { style: { fill: false, color: '#2b2b29', weight: 1.6, opacity: 0.9 }, interactive: false }).addTo(karta);
    }
    return true;
  }

  var CACHE = { lista: [], idx: {}, sn: 1 };
  function stilFor(id, lager) {
    var o = CACHE.idx[id];
    var vald = S.vald === id;
    lager.setStyle({
      fillColor: o ? FARGER[klass(varde(o), CACHE.sn)] : '#cccccc',
      color: vald ? '#13222c' : '#ffffff',
      weight: vald ? 3.2 : (S.niva === 'deso' ? 0.6 : 1.6),
      fillOpacity: 0.82
    });
  }
  function markeraValt() {
    if (granslager) granslager.bringToFront();
    if (S.vald && lagerFor[S.vald]) lagerFor[S.vald].bringToFront();
  }

  function tooltip(id) {
    var o = CACHE.idx[id];
    if (!o) return '';
    return '<b>' + esc(o.namn) + '</b><br><span style="color:#5b6a72">' + esc(o.sub) + '</span><br>' +
      rund(o.per_inv) + ' kg CO₂ per invånare<br>' + rund(o.per_hh) + ' kg CO₂ per hushåll<br>' + rund(o.ton) + ' ton CO₂ per år' +
      (CACHE.sc ? '<br><span style="color:#5b6a72">Utan åtgärder ' + rund(o.per_inv0) + ' kg per invånare</span>' : '');
  }

  function valj(id, panorera) {
    S.vald = S.vald === id && !panorera ? null : id;
    Object.keys(lagerFor).forEach(function (k) { stilFor(k, lagerFor[k]); });
    markeraValt();
    if (panorera && S.vald && lagerFor[id] && karta) karta.fitBounds(lagerFor[id].getBounds(), { maxZoom: 14, padding: [40, 40] });
    renderVald();
    renderTabell();
  }

  function render(passa) {
    var sc = scenario();
    var lista = omraden(), T = summa(lista), sn = snitt(lista, T);
    CACHE = { lista: lista, idx: {}, sn: sn, T: T, sc: sc };
    $('k-paket').value = S.paket;
    lista.forEach(function (o) { CACHE.idx[o.id] = o; });
    satt($('k-stad'), S.kk); satt($('k-niva'), S.niva);
    $('k-matt').value = S.matt; $('k-ar').value = S.ar;

    var a = andelar(S.kk), K = kommunNamn(S.kk);
    var falt = { 'k-el': f1.format(a.el * 100), 'k-lh': f1.format(a.lh * 100), 'k-eldrift': f0.format(S.eldrift * 100),
      'k-efice': f2.format(S.efIce), 'k-efev': f2.format(S.efEv) };
    Object.keys(falt).forEach(function (id) { if (document.activeElement !== $(id) || $(id).getAttribute('aria-invalid') !== 'true') $(id).value = falt[id]; });
    var ev = evAndel(S.kk);
    $('k-ef').innerHTML = 'Utsläpp per fordonskm: <b>' + f0.format(ef(S.kk) * 1000) + ' g CO₂</b>. Elbilarna och laddhybridernas eldrift står för <b>' +
      procent(ev, true) + '</b> av körningen, bensin och diesel för ' + procent(1 - ev, true) + '.';
    $('k-ar-kalla').textContent = a.kalla;
    $('k-ar-not').textContent = S.ar === '2023' ? 'Framräknad uppskattning, osäkerhet ungefär ±1 procentenhet.' : (S.ar === 'egna' ? 'Egna värden för ' + K + '.' : 'Andelar av alla personbilar i trafik i ' + K + '.');

    $('k-tot').textContent = rund(T.ton);
    $('k-inv').textContent = rund(T.per_inv);
    $('k-hh').textContent = rund(T.per_hh);
    $('k-gkm').textContent = f0.format(ef(S.kk) * 1000 * (sc ? sc.fC : 1));
    var fp = (window.ATGARDER.forval || []).filter(function (x) { return x.id === S.paket; })[0];
    $('k-paket-not').textContent = S.paket === 'inga' ? 'Samma nivå och andel i alla områden. Visar hur mycket klimatpåverkan kan minska.'
      : (fp && fp.text ? fp.text + ' ' : '') + 'Samma nivå och andel i alla områden.' +
        (sc && sc.E.roller.pull && sc.E.push < 1 ? ' Pull-åtgärderna räknas med ' + f0.format(sc.E.kPull[0] * 100) + ' % eftersom push-åtgärder saknas eller inte genomförs fullt ut.' : '');
    var ks = $('k-scen');
    if (sc) {
      ks.hidden = false;
      ks.innerHTML = 'Med ' + (S.paket === 'befintliga' ? esc(sc.namn) : 'paketet ”' + esc(sc.namn) + '”') + ' minskar utsläppen från hushållens bilar i ' + esc(K) + ' med <b>' + rund(T.ton0 - T.ton) +
        ' ton CO₂ per år</b>, från ' + rund(T.ton0) + ' till ' + rund(T.ton) + ' ton (<b>' + f0.format((sc.f[0] - 1) * 100).replace('-', '−') + ' %</b>). Fordonskm ändras med ' +
        f0.format((sc.fV - 1) * 100).replace('-', '−') + ' %' + (sc.fC !== 1 ? ' och utsläppen per km med ' + f1.format((sc.fC - 1) * 100).replace('-', '−') + ' %' : '') + '.';
    } else {
      ks.hidden = true;
    }
    uppdateraOsak(sc, T);
    $('k-th-minskning').hidden = !sc;
    $('k-rubrik').textContent = 'Klimatpåverkan i ' + K + (S.niva === 'deso' ? ' per DeSO' : ' per stadsdelsområde');
    $('k-ytor-not').textContent = ytorText(S.kk);

    // teckenförklaring
    var gr = KVOT.map(function (k) { return avrunda(sn * k); });
    var etik = FARGER.map(function (c, i) {
      return i === 0 ? 'under ' + f0.format(gr[0]) : (i === 6 ? f0.format(gr[5]) + ' och mer' : f0.format(gr[i - 1]) + '–' + f0.format(gr[i]));
    });
    $('k-teckenforklaring').innerHTML =
      '<p class="kt-rubrik">Utsläpp i ' + esc(MATT[S.matt].enhet) + '. Procent av snittet för ' + esc(K) +
      (S.matt === 'totalt' ? ' per område' : '') + (sc ? ' utan åtgärder' : '') + ', ' + rund(sn) + ' ' + MATT[S.matt].kort + '.</p>' +
      '<ol class="kt-skala">' + FARGER.map(function (c, i) {
        return '<li><i style="background:' + c + '"></i><span class="kt-v">' + etik[i] + '</span><span class="kt-p">' + KVOTTEXT[i] + '</span></li>';
      }).join('') + '</ol><p class="kt-pilar"><span>← Lägre utsläpp</span><span>Högre utsläpp →</span></p>';

    if (karta) {
      var nytt = byggLager();
      Object.keys(lagerFor).forEach(function (k) { stilFor(k, lagerFor[k]); });
      markeraValt();
      if (nytt || passa) karta.fitBounds(ytlager.getBounds(), { padding: [12, 12] });
    }
    renderVald();
    renderTabell();
  }

  /* Osäkerhet (Monte Carlo, mc.js): utsläppen utan åtgärder och minskningen med paketet.
     Räknas efter att sidan ritats, eftersom överföringsosäkerheten kommer från referenskontrollen. */
  var osakNyckel = '';
  function uppdateraOsak(sc, T) {
    var el = $('k-osak');
    if (!window.MC || !window.OSAKERHET) { el.hidden = true; return; }
    var nyckel = [S.kk, S.paket, S.ar, S.eldrift, S.efIce, S.efEv, JSON.stringify(andelar(S.kk)), sc ? JSON.stringify(window.BILMODELL.atgBefintliga()) : ''].join('|');
    osakNyckel = nyckel;
    var forsok = 0;
    setTimeout(function kor0() {
      if (nyckel !== osakNyckel) return;
      if (!window.KONTROLL && forsok++ < 40) { setTimeout(kor0, 50); return; }   // vänta på kontroll.js
      var MC = window.MC, kk = S.kk, b = bas(kk), fkm = T.fkm0;
      var sigma = window.KONTROLL ? window.KONTROLL.sigmaS() : 0;
      var st = sc ? (S.paket === 'befintliga' ? window.BILMODELL.atgBefintliga() : window.BILMODELL.tillstandFranForval(S.paket)) : {};
      function kor(sig) {
        var s = MC.simulera(st, { andelNy: 0, tathet: 0 }, { sigmaS: sig }), t0 = [], m = [], p = [];
        for (var i = 0; i < s.n; i++) {
          var x0 = fkm * MC.basFaktor(s.par[i], kk) * MC.efDragen(b, s.par[i]) / 1000;
          t0.push(x0); m.push(x0 * (1 - s.fV[i] * s.fC[i])); p.push((1 - s.fV[i] * s.fC[i]) * 100);
        }
        return { t0: MC.sammanfatta(t0), m: MC.sammanfatta(m), p: MC.sammanfatta(p) };
      }
      var A = kor(0), h = '<b>Osäkerhet (90 %).</b> Utan åtgärder ' + rund(A.t0.p5) + '–' + rund(A.t0.p95) + ' ton CO₂ per år.';
      if (sc) {
        h += ' Minskningen med paketet är ' + rund(A.m.p5) + '–' + rund(A.m.p95) + ' ton (' + f0.format(A.p.p5) + '–' + f0.format(A.p.p95) + ' %) givet underlagets spann';
        if (sigma > 0) { var B = kor(sigma); h += ', och ' + f0.format(B.p.p5) + '–' + f0.format(B.p.p95) + ' % om även skillnaderna mellan städer räknas med'; }
        h += '.';
      }
      h += ' <a href="#osakerhet" data-oppna="osakerhet">Osäkerhetsanalys och referenskontroll</a>';
      el.innerHTML = h; el.hidden = false;
      var a = el.querySelector('[data-oppna]');
      a.addEventListener('click', function (e) { e.preventDefault(); if (window.KONTROLL) window.KONTROLL.oppnaKontroll('osakerhet'); });
    }, 0);
  }

  function ytorText(kk) {
    var G = GEO && GEO.kommuner[kk], K = kommunNamn(kk);
    if (G && G.exakt) {
      return 'DeSO-gränserna för ' + K + ' kommer från ' + (G.kalla || 'SCB') + '. De är klippta mot land, eftersom DeSO även täcker havet. Stadsdelsområdena är sammanslagna DeSO.' +
        (G.ungefarliga && G.ungefarliga.length ? ' Ytorna med streckad kant är ungefärliga, eftersom de saknas i gränsfilen.' : '');
    }
    return 'DeSO-ytorna för ' + K + ' är ungefärliga. De är ritade som celler kring SCB:s mittpunkt för varje DeSO och klippta mot kommunen. Stadsdelsområdena är sammanslagna celler. Med SCB:s gränsfil kan klimatmodell.py rita exakta gränser.';
  }

  function renderVald() {
    var el = $('k-vald'), o = S.vald ? CACHE.idx[S.vald] : null;
    if (!o) {
      el.innerHTML = '<p class="k-vald-tom">Klicka på ett område i kartan eller i tabellen för att se detaljer.</p>';
      return;
    }
    var T = CACHE.T, K = kommunNamn(S.kk);
    var rader = [
      ['Invånare', f0.format(o.bef)], ['Hushåll', f0.format(o.hh)],
      ['Bilar per hushåll', f2.format(o.bph)], ['Körsträcka per bil', rund(o.km) + ' km/år'],
      ['Fordonskm per hushåll', rund(o.fkm / o.hh) + ' km/år'],
      ['CO₂ per invånare', rund(o.per_inv) + ' kg/år (' + f0.format(o.per_inv / T.per_inv * 100) + ' % av snittet)'],
      ['CO₂ per hushåll', rund(o.per_hh) + ' kg/år'], ['CO₂ totalt', rund(o.ton) + ' ton/år (' + f1.format(o.ton / T.ton * 100) + ' % av ' + esc(K) + ')']
    ];
    if (CACHE.sc) rader.push(['CO₂ utan åtgärder', rund(o.ton0) + ' ton/år, ' + rund(o.per_inv0) + ' kg per invånare']);
    el.innerHTML = '<div class="k-vald-huvud"><h3>' + esc(o.namn) + '</h3><p>' + esc(o.sub) + '</p>' +
      '<button type="button" class="lank-knapp" id="k-vald-stang">Stäng</button></div><dl class="detaljer">' +
      rader.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('') + '</dl>';
    $('k-vald-stang').addEventListener('click', function () { valj(o.id, false); });
  }

  function renderTabell() {
    var lista = CACHE.lista.slice().sort(function (a, b) { return varde(b) - varde(a); });
    $('k-tabell-rubrik').textContent = (S.niva === 'deso' ? 'Alla DeSO i ' : 'Alla stadsdelsområden i ') + kommunNamn(S.kk);
    var kol = { per_inv: 4, per_hh: 5, totalt: 6 }[S.matt];
    Array.prototype.forEach.call(document.querySelectorAll('#k-tabell-huvud th'), function (th, i) { th.classList.toggle('sorterad', i === kol); });
    $('k-tabell').innerHTML = lista.map(function (o) {
      var vald = o.id === S.vald;
      var c = FARGER[klass(varde(o), CACHE.sn)];
      return '<tr data-id="' + esc(o.id) + '" tabindex="0"' + (vald ? ' class="vald" aria-selected="true"' : '') + '>' +
        '<td><span class="k-namn"><i style="background:' + c + '"></i><span>' + esc(o.namn) + '<span class="kod">' + esc(o.sub) + '</span></span></span></td>' +
        '<td class="tal">' + f0.format(o.bef) + '</td><td class="tal">' + f0.format(o.hh) + '</td>' +
        '<td class="tal">' + rund(o.fkm / o.hh) + '</td>' +
        '<td class="tal' + (kol === 4 ? ' sorterad' : '') + '">' + rund(o.per_inv) + '</td>' +
        '<td class="tal' + (kol === 5 ? ' sorterad' : '') + '">' + rund(o.per_hh) + '</td>' +
        '<td class="tal' + (kol === 6 ? ' sorterad' : '') + '">' + rund(o.ton) + '</td>' +
        (CACHE.sc ? '<td class="tal">' + rund(o.ton0 - o.ton) + '</td>' : '') + '</tr>';
    }).join('');
    Array.prototype.forEach.call($('k-tabell').querySelectorAll('tr'), function (tr) {
      var go = function () { valj(tr.getAttribute('data-id'), true); };
      tr.addEventListener('click', go);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  function laddaNer() {
    var e = ef(S.kk), a = andelar(S.kk);
    var rad = function (arr) { return arr.map(function (v) { return typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', ',') : '"' + String(v).replace(/"/g, '""') + '"'; }).join(';'); };
    var ut = [rad(['Kommun', S.niva === 'deso' ? 'DeSO' : 'Stadsdelsområde', 'Beskrivning', 'Invånare', 'Hushåll', 'Fordonskm per år',
      'Ton CO2 per år', 'Kg CO2 per invånare', 'Kg CO2 per hushåll', 'Ton CO2 per år utan åtgärder'])];
    CACHE.lista.forEach(function (o) {
      ut.push(rad([kommunNamn(S.kk), S.niva === 'deso' ? o.id : o.namn, S.niva === 'deso' ? o.namn + ' · ' + o.sub : o.sub, o.bef, o.hh, o.fkm, o.ton, o.per_inv, o.per_hh, o.ton0]));
    });
    ut.push('');
    ut.push(rad(['Antaganden', 'Elbilar ' + f1.format(a.el * 100) + ' %', 'Laddhybrider ' + f1.format(a.lh * 100) + ' %',
      'Eldrift laddhybrid ' + f0.format(S.eldrift * 100) + ' %', 'ICE ' + f2.format(S.efIce) + ' kg/km', 'EV ' + f2.format(S.efEv) + ' kg/km',
      'Utsläpp ' + f0.format(e * 1000) + ' g/km', 'Åtgärdspaket: ' + (CACHE.sc ? CACHE.sc.namn : 'inga')]));
    var blob = new Blob(['﻿' + ut.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var l = document.createElement('a');
    l.href = URL.createObjectURL(blob);
    l.download = 'klimatpaverkan_' + kommunNamn(S.kk).toLowerCase().replace('ö', 'o') + '_' + (S.niva === 'deso' ? 'deso' : 'stadsdelar') + '.csv';
    document.body.appendChild(l); l.click(); document.body.removeChild(l);
    setTimeout(function () { URL.revokeObjectURL(l.href); }, 1000);
  }

  function visa() {
    var forsta = !klar;
    if (forsta) init();
    render(forsta);
    if (karta) setTimeout(function () { karta.invalidateSize(false); if (forsta && ytlager) karta.fitBounds(ytlager.getBounds(), { padding: [12, 12] }); }, 0);
  }
})();
