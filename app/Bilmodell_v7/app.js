/* Bilar och körsträcka per område – webbmodell med mobilitetsåtgärder
   Data: data.js (genereras av underhall/bygg_data.py) och atgarder.js (åtgärder och referenser).
   Ingen server behövs. */
(function () {
  'use strict';

  var META = window.MODELL_META;
  var DESO = window.DESO;
  var ATG = window.ATGARDER;
  if (!META || !DESO || !ATG) {
    document.getElementById('innehall').innerHTML = '<p>Datafilerna data.js eller atgarder.js saknas eller kunde inte läsas. Kontrollera att de ligger i samma mapp som index.html.</p>';
    return;
  }

  /* ---------------------------------------------------------------
     Nybyggnadsområden. Ändra eller lägg till här.
     lat/lon är ungefärliga lägen; användaren kan flytta dem i kartan.
     analog: förvalt motsvarande område (kod '' = hela stadsdelsområdet).
     forslag: alternativa motsvarande områden som jämförs i tabellen.
     --------------------------------------------------------------- */
  var NYA = [
    {
      id: 'jagersro', namn: 'Jägersro (SMT), Malmö', kk: '1280', lat: 55.5800, lon: 13.0640, bostader: 4000,
      text: 'Ny stadsdel på Jägersro travbanas område mellan Inre och Yttre ringvägen, upp emot 4 000 bostäder i flerbostadshus och radhus. Exploatör är SMT Malmö Exploatering (Skanska, MKB och Tornet).',
      analog: { kk: '1280', sd: 'Hyllie', kod: '' },
      motiv: 'Förvalt: Hyllie, en blandad stadsdel med både nybyggt och äldre bestånd vid en kollektivtrafiknod. Jämför med alternativen i tabellen nedanför.',
      forslag: [
        { kk: '1280', sd: 'Hyllie', kod: '', motiv: 'Blandad stadsdel kring en kollektivtrafiknod, ungefär samma avstånd till centrum.' },
        { kk: '1280', sd: 'Hyllie', kod: '1280C1270', motiv: 'Nybyggda Hyllie vid stationen: tät nyproduktion med lågt bilinnehav.' },
        { kk: '1280', sd: 'Husie', kod: '1280C1780', motiv: 'Dagens bebyggelse precis intill Jägersro.' }
      ]
    },
    {
      id: 'nyhamnen', namn: 'Nyhamnen, Malmö', kk: '1280', lat: 55.6125, lon: 13.0035, bostader: 8000,
      text: 'Hamnområdet norr om Malmö C, med 7 000–9 000 bostäder och 15 000–21 000 arbetsplatser när det är fullt utbyggt.',
      analog: { kk: '1280', sd: 'Västra Hamnen', kod: '' },
      motiv: 'Förvalt: Västra Hamnen, en tät nybyggd hamnstadsdel nära centrum.',
      forslag: [
        { kk: '1280', sd: 'Västra Hamnen', kod: '', motiv: 'Tät nybyggd hamnstadsdel nära centrum.' },
        { kk: '1280', sd: 'Centrum', kod: '', motiv: 'Samma läge vid Malmö C och Gamla staden.' },
        { kk: '1280', sd: 'Centrum', kod: '1280C2920', motiv: 'Det DeSO som Nyhamnen ligger i i dag.' }
      ]
    },
    {
      id: 'ostraramlosa', namn: 'Östra Ramlösa, Helsingborg', kk: '1283', lat: 56.0185, lon: 12.7700, bostader: 3000,
      text: 'Ny stadsdel öster om Ramlösa med cirka 1 500 bostäder i första etappen och omkring 3 000 fullt utbyggd. Parkeringen samlas i mobilitetshus.',
      analog: { kk: '1283', sd: 'Ramlösa–Gustavslund', kod: '' },
      motiv: 'Förvalt: Ramlösa och Gustavslund, som ligger intill och på samma avstånd från centrum.',
      forslag: [
        { kk: '1283', sd: 'Ramlösa–Gustavslund', kod: '', motiv: 'Grannområdet, på samma avstånd från centrum.' },
        { kk: '1283', sd: 'Sydöst', kod: '', motiv: 'Flerbostadshus i sydöstra staden, närmare centrum.' },
        { kk: '1283', sd: 'Centrum och Söder', kod: '1283C1200', motiv: 'Tät nyproduktion i Oceanhamnen, om Östra Ramlösa byggs tätt.' }
      ]
    },
    {
      id: 'eget', namn: 'Eget område', kk: '1280', lat: null, lon: null, bostader: 1000,
      text: 'Välj kommun, klicka i kartan där området ska ligga (eller skriv avståndet till Stortorget) och välj ett befintligt område som liknar det planerade.',
      analog: { kk: '1280', sd: 'Hyllie', kod: '' },
      motiv: '',
      forslag: null
    }
  ];

  var KOMMUNER = Object.keys(META.kommuner);
  var EPS = META.eps, DMIN = META.dmin;
  var GRADTEXT = {
    A: 'Evidensgrad A: flera studier eller naturliga experiment med jämförelsegrupp, i Norden eller norra Europa.',
    B: 'Evidensgrad B: enstaka studier med jämförelse eller samstämmiga tvärsnittsstudier; effekten i modellen är delvis härledd.',
    C: 'Evidensgrad C: indikativa resultat; effektstorleken bygger till stor del på antaganden.'
  };

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
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function tal(s) { var v = parseFloat(String(s).replace(/\s/g, '').replace(',', '.')); return isNaN(v) ? NaN : v; }

  /* ---------- Data ---------- */
  function kommunNamn(kk) { return META.kommuner[kk].namn; }
  /* Utsläpp per fordonskm (kg CO₂) enligt antagandena i fliken Klimatpåverkan (klimat.js). */
  function klimatEf(kk) { return window.KLIMAT && window.KLIMAT.ef ? window.KLIMAT.ef(kk) : null; }
  function co2(v) { return f0.format(Math.round(v / 10) * 10); }
  function stadsdelar(kk) {
    var s = {};
    DESO.forEach(function (r) { if (r.kk === kk) s[r.sd] = true; });
    return Object.keys(s).sort(function (a, b) { return a.localeCompare(b, 'sv'); });
  }
  function raderI(kk, sd) {
    return DESO.filter(function (r) { return r.kk === kk && r.sd === sd; })
      .sort(function (a, b) { return a.rs.localeCompare(b.rs, 'sv') || a.kod.localeCompare(b.kod); });
  }
  function raderKommun(kk) { return DESO.filter(function (r) { return r.kk === kk; }); }
  function hitta(kod) { for (var i = 0; i < DESO.length; i++) if (DESO[i].kod === kod) return DESO[i]; return null; }
  function desoNamn(r) { return r.rs + ' (' + r.kod + ')'; }

  // Hushållsvägt bilar per hushåll, bilvägd körsträcka
  function agg(rows) {
    var hh = 0, bef = 0, bil = 0, bilar = 0, kmBil = 0;
    rows.forEach(function (r) { hh += r.hh; bef += r.bef; bil += r.bil; bilar += r.bph * r.hh; kmBil += r.km * r.bph * r.hh; });
    var o = { n: rows.length, hh: hh, bef: bef, bil: bil, bph: bilar / hh, bphR: bil / hh, km: kmBil / bilar };
    o.vkm = o.bph * o.km;
    o.bphMin = Math.min.apply(null, rows.map(function (r) { return r.bph; }));
    o.bphMax = Math.max.apply(null, rows.map(function (r) { return r.bph; }));
    o.kmMin = Math.min.apply(null, rows.map(function (r) { return r.km; }));
    o.kmMax = Math.max.apply(null, rows.map(function (r) { return r.km; }));
    return o;
  }

  function avstandKm(lat1, lon1, lat2, lon2) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  function kmEnligtLage(kk, d) { return META.kommuner[kk].C * Math.pow(Math.max(d, DMIN), EPS); }

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

  /* ---------- Tillstånd ---------- */
  var S = {
    flik: 'befintliga',
    b: { kk: '1280', sd: 'Centrum', kod: '', nya: 0 },
    n: null,
    atgB: nyttAtgTillstand(),
    atgN: nyttAtgTillstand()
  };

  /* ---------- Formulärhjälp ---------- */
  function fyllSelect(sel, alternativ, varde) {
    sel.innerHTML = alternativ.map(function (o) {
      return '<option value="' + esc(o.v) + '"' + (o.v === varde ? ' selected' : '') + '>' + esc(o.t) + '</option>';
    }).join('');
  }
  function segment(el, namn, varde, onChange) {
    el.innerHTML = KOMMUNER.map(function (kk) {
      return '<label><input type="radio" name="' + namn + '" value="' + kk + '"' + (kk === varde ? ' checked' : '') +
        '><span>' + esc(kommunNamn(kk)) + '</span></label>';
    }).join('');
    Array.prototype.forEach.call(el.querySelectorAll('input'), function (inp) {
      inp.addEventListener('change', function () { if (inp.checked) onChange(inp.value); });
    });
  }
  function satt(el, kk) {
    Array.prototype.forEach.call(el.querySelectorAll('input'), function (inp) { inp.checked = inp.value === kk; });
  }
  function desoAlternativ(kk, sd) {
    return [{ v: '', t: 'Hela stadsdelsområdet' }].concat(raderI(kk, sd).map(function (r) { return { v: r.kod, t: desoNamn(r) }; }));
  }
  function detaljer(el, par) {
    el.innerHTML = par.map(function (p) { return '<div><dt>' + esc(p[0]) + '</dt><dd>' + esc(p[1]) + '</dd></div>'; }).join('');
  }

  /* ---------- Remsdiagram: områdets värde mot alla DeSO i staden ---------- */
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

  function remsa(el, o) {
    var w = Math.max(220, el.clientWidth || 300), h = 64;
    var extra = [o.varde].concat(o.fore != null ? [o.fore] : []);
    var lo = Math.min.apply(null, o.alla.concat(extra)), hi = Math.max.apply(null, o.alla.concat(extra));
    var pad = (hi - lo) * 0.03 || 1;
    lo -= pad; hi += pad;
    var x = function (v) { return 6 + (v - lo) / (hi - lo) * (w - 12); };
    var tick = cssVar('--tick'), bar = cssVar('--bar'), sel = cssVar('--sel'), ink2 = cssVar('--ink-2'), muted = cssVar('--muted'), panel = cssVar('--panel');
    var s = '<svg width="' + w + '" height="' + h + '" role="img" aria-label="' + esc(o.aria) + '">';
    s += '<line x1="0" x2="' + w + '" y1="38" y2="38" stroke="' + tick + '" stroke-width="1"/>';
    o.alla.forEach(function (v) {
      s += '<line x1="' + x(v).toFixed(1) + '" x2="' + x(v).toFixed(1) + '" y1="20" y2="38" stroke="' + tick + '" stroke-width="1.5"><title>' + esc(o.fmt(v)) + '</title></line>';
    });
    o.markerade.forEach(function (v) {
      s += '<line x1="' + x(v).toFixed(1) + '" x2="' + x(v).toFixed(1) + '" y1="20" y2="38" stroke="' + bar + '" stroke-width="2"><title>' + esc(o.fmt(v)) + '</title></line>';
    });
    var xm = x(o.snitt);
    s += '<line x1="' + xm.toFixed(1) + '" x2="' + xm.toFixed(1) + '" y1="14" y2="44" stroke="' + ink2 + '" stroke-width="1.25" stroke-dasharray="3 3"/>';
    if (o.fore != null && Math.abs(x(o.fore) - x(o.varde)) > 1.5) {
      var xf = x(o.fore), xv0 = x(o.varde);
      s += '<line x1="' + xf.toFixed(1) + '" x2="' + xv0.toFixed(1) + '" y1="29" y2="29" stroke="' + sel + '" stroke-width="1.5" stroke-dasharray="2 2"/>';
      s += '<circle cx="' + xf.toFixed(1) + '" cy="29" r="5" fill="' + panel + '" stroke="' + ink2 + '" stroke-width="2"><title>Utan åtgärder: ' + esc(o.fmt(o.fore)) + '</title></circle>';
    }
    var xv = x(o.varde);
    s += '<line x1="' + xv.toFixed(1) + '" x2="' + xv.toFixed(1) + '" y1="12" y2="44" stroke="' + sel + '" stroke-width="3" stroke-linecap="round"/>';
    s += '<path d="M' + (xv - 6).toFixed(1) + ' 2 L' + (xv + 6).toFixed(1) + ' 2 L' + xv.toFixed(1) + ' 10 Z" fill="' + sel + '"/>';
    var etikett = o.snittEtikett + ' ' + o.fmt(o.snitt);
    var ew = etikett.length * 6.4;
    var ex = Math.min(Math.max(xm, ew / 2), w - ew / 2);
    s += '<text x="' + ex.toFixed(1) + '" y="58" text-anchor="middle" font-size="12.5" fill="' + ink2 + '">' + esc(etikett) + '</text>';
    var minT = o.fmt(Math.min.apply(null, o.alla)), maxT = o.fmt(Math.max.apply(null, o.alla));
    if (ex - ew / 2 > minT.length * 6.4 + 10) s += '<text x="0" y="58" font-size="12" fill="' + muted + '">' + esc(minT) + '</text>';
    if (ex + ew / 2 < w - maxT.length * 6.4 - 10) s += '<text x="' + w + '" y="58" text-anchor="end" font-size="12" fill="' + muted + '">' + esc(maxT) + '</text>';
    s += '</svg>';
    el.innerHTML = s;
  }

  /* ================= Åtgärdspanel ================= */
  var ROLLNAMN = { push: 'Push', pull: 'Pull', stod: 'Stöd' };
  function rollBadge(r) {
    return r ? '<span class="roll roll-' + r + '" title="' + esc((ATG.roller || {})[r] || '') + '">' + ROLLNAMN[r] + '</span>' : '';
  }
  function effekttext(m) {
    var delar = [], eC = m.eC || NOLL;
    if (m.eB[0] !== 0) delar.push('bilinnehav ' + pct(m.eB[0]));
    if (m.eV[0] !== 0) delar.push('fordonskm ' + pct(m.eV[0]));
    if (eC[0] !== 0) delar.push('CO₂ per km ' + pct(eC[0]));
    var t = delar.join(', ');
    if (m.eB[0] === 0 && m.eV[0] !== 0) t += ', ingen säker effekt på bilinnehavet';
    if (m.eV[0] === 0 && eC[0] !== 0) t += '. Påverkar inte antalet kilometer';
    var pre = m.typ === 'andel' ? m.perText.charAt(0).toUpperCase() + m.perText.slice(1) + ': ' : (m.typ === 'niva' ? 'Vid full nivå: ' : 'Effekt: ');
    return pre + t + '.';
  }
  function gradBadge(g) { return '<span class="grad grad-' + g + '" title="' + esc(GRADTEXT[g]) + '">' + g + '</span>'; }

  function byggPanel(flik) {
    var el = $(flik + '-atgarder');
    var arBef = flik === 'b';
    var h = '<div class="atg-huvud"><h2 id="' + flik + '-atg-rubrik">Mobilitetsåtgärder</h2>' +
      '<label class="falt atg-forval"><span class="falt-namn">Förval</span><select id="' + flik + '-forval">' +
      ATG.forval.filter(function (f) { return !f.stad; }).map(function (f) { return '<option value="' + f.id + '">' + esc(f.namn) + '</option>'; }).join('') +
      '<option value="egna" hidden>Egna val</option></select></label></div>' +
      '<p class="atg-ingress">Kryssa i en åtgärd och dra i reglaget för att ange hur långt den genomförs. Effekterna bygger på nordiska och europeiska studier och på IVL:s internationella litteraturöversikt från 2024. Push gör bilen mindre attraktiv, pull gör alternativen bättre. Bokstaven visar evidensgraden; under <a href="#" data-till-ref="">Åtgärder</a> finns underlaget och under Referenskontroll hur väl modellen stämmer med publicerade studier.</p>';
    if (arBef) {
      h += '<div class="fortatning"><label class="falt"><span class="falt-namn">Förtätning: nya bostäder i området</span>' +
        '<input id="b-nya" type="text" inputmode="numeric" autocomplete="off" placeholder="0"></label>' +
        '<p class="falt-hjalp" id="b-nya-text"></p></div>';
    }
    ATG.grupper.forEach(function (g) {
      var ms = ATG.lista.filter(function (m) { return m.grupp === g.id; });
      if (!ms.length) return;
      h += '<fieldset class="atg-grupp"><legend>' + esc(g.namn) + '</legend>';
      ms.forEach(function (m) {
        var idb = flik + '-atg-' + m.id;
        h += '<div class="atg" data-id="' + m.id + '">' +
          '<label class="atg-val"><input type="checkbox" id="' + idb + '"><span class="atg-namn">' + esc(m.namn) + '</span>' + rollBadge(m.roll) + gradBadge(m.grad) + '</label>' +
          '<p class="atg-kort">' + esc(m.kort) + '</p>';
        if (m.typ !== 'binar') {
          h += '<div class="atg-niva"><input type="range" id="' + idb + '-niva" min="' + m.min + '" max="' + m.max + '" step="' + m.steg + '" aria-label="' + esc(m.namn + ', ' + m.nivaText) + '">' +
            '<output for="' + idb + '-niva" id="' + idb + '-ut"></output><span class="atg-nivatext">' + esc(m.nivaText) + '</span></div>';
        }
        h += '<p class="atg-effekt">' + esc(effekttext(m)) + ' <a href="#ref-' + m.id + '" data-till-ref="' + m.id + '">Underlag</a></p>';
        if (m.endastNy) h += '<p class="atg-not" id="' + idb + '-not" hidden>Gäller bara nya bostäder. Ange antal nya bostäder under Förtätning ovan.</p>';
        h += '</div>';
      });
      h += '</fieldset>';
    });
    h += '<p class="atg-fot">Inom samma grupp räknas den största effekten fullt och övriga med ' + f0.format(SV.overlapp * 100) + ' %, eftersom åtgärderna delvis påverkar samma hushåll. Mellan grupper multipliceras effekterna. Utan push-åtgärd räknas pull-åtgärderna med ' + f0.format(SV.pullUtanPush[0] * 100) + ' % (<a href="#ref-samverkan" data-till-ref="samverkan">samverkan enligt IVL</a>).</p>';
    el.innerHTML = h;

    var atg = arBef ? S.atgB : S.atgN;
    var omrakna = function () { if (arBef) renderB(false); else renderN(false, true); };
    ATG.lista.forEach(function (m) {
      var idb = flik + '-atg-' + m.id;
      $(idb).addEventListener('change', function (e) { atg[m.id].pa = e.target.checked; $(flik + '-forval').value = 'egna'; synkaPanel(flik); omrakna(); });
      if (m.typ !== 'binar') {
        $(idb + '-niva').addEventListener('input', function (e) {
          atg[m.id].niva = +e.target.value; atg[m.id].pa = true; $(idb).checked = true;
          $(flik + '-forval').value = 'egna'; synkaPanel(flik); omrakna();
        });
      }
    });
    $(flik + '-forval').addEventListener('change', function (e) {
      if (!ATG.forval.some(function (x) { return x.id === e.target.value; })) return;
      var ny = tillstandFranForval(e.target.value);
      ATG.lista.forEach(function (m) { atg[m.id].pa = ny[m.id].pa; atg[m.id].niva = ny[m.id].niva; });
      synkaPanel(flik); omrakna();
    });
    if (arBef) {
      $('b-nya').addEventListener('input', function (e) {
        var v = tal(e.target.value);
        S.b.nya = isNaN(v) || v < 0 ? 0 : Math.round(v);
        synkaPanel('b'); renderB(false);
      });
    }
    Array.prototype.forEach.call(el.querySelectorAll('[data-till-ref]'), function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); visaReferens(a.getAttribute('data-till-ref')); });
    });
    synkaPanel(flik);
  }

  function synkaPanel(flik) {
    var atg = flik === 'b' ? S.atgB : S.atgN;
    ATG.lista.forEach(function (m) {
      var idb = flik + '-atg-' + m.id, st = atg[m.id];
      var rad = document.querySelector('#' + flik + '-atgarder .atg[data-id="' + m.id + '"]');
      var sparrad = !!(flik === 'b' && m.endastNy && !(S.b.nya > 0));
      $(idb).checked = st.pa;
      $(idb).disabled = sparrad;
      rad.classList.toggle('aktiv', !!(st.pa && !sparrad));
      rad.classList.toggle('sparrad', sparrad);
      if (m.endastNy && $(idb + '-not')) $(idb + '-not').hidden = !sparrad;
      if (m.typ !== 'binar') {
        $(idb + '-niva').value = st.niva;
        $(idb + '-niva').disabled = sparrad;
        $(idb + '-ut').textContent = f0.format(st.niva) + ' %';
      }
    });
  }

  function bidragsTabell(el, E, R) {
    if (!E.aktiv) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    var rader = E.poster.map(function (p) {
      return '<tr><td>' + esc(p.namn) + ' ' + rollBadge(p.roll) + '</td><td class="tal">' + pct(p.effB) + '</td><td class="tal">' + pct(p.effV) +
        '</td><td class="tal">' + pct((1 + p.effV) * (1 + (p.effC || 0)) - 1) + '</td></tr>';
    }).join('');
    var not = 'Effekten per åtgärd är efter avdrag för överlapp inom samma grupp. Körsträcka per bil ändras med ' + pct(R.km / R.km0 - 1) + '.';
    if (E.roller.pull && E.push < 1) not += ' Pull-åtgärderna räknas med ' + f0.format(E.kPull[0] * 100) + ' % eftersom paketet saknar fullt genomförda push-åtgärder.';
    el.innerHTML = '<h3>Åtgärdernas effekt</h3><table class="bidrag-tabell"><thead><tr><th scope="col">Åtgärd</th><th scope="col" class="tal">Bilinnehav</th><th scope="col" class="tal">Fordonskm per hushåll</th><th scope="col" class="tal">CO₂</th></tr></thead><tbody>' +
      rader + '</tbody><tfoot><tr><th scope="row">Sammantaget</th><td class="tal">' + pct(E.fB[0] - 1) + '</td><td class="tal">' + pct(E.fV[0] - 1) +
      '</td><td class="tal">' + pct(E.fV[0] * E.fC[0] - 1) + '</td></tr></tfoot></table>' +
      '<p class="falt-hjalp">' + not + '</p>';
  }

  // Samverkan i paketet: vilka "ben" paketet står på, jämfört med IVL:s slutsatser
  function paketKontroll(el, E, R, tathet) {
    if (!E.aktiv) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    var r = E.roller, ip = SV.ivlPaket || { pushpull: [0.1, 0.3], pull: [0.05, 0.15] };
    var ben = [
      [r.pull, 'Bättre alternativ till bilen', 'pull'],
      [r.push, 'Styrning av bilen', 'push'],
      [tathet.ja, 'Täthet och närhet', ''],
      [r.stod, 'Stöd och information', 'stod']
    ];
    var dV = R.V / R.V0 - 1, text;
    var spann = function (a) { return f0.format(a[0] * 100) + '–' + f0.format(a[1] * 100) + ' %'; };
    if (r.push && r.pull) {
      text = 'Paketet har både push- och pull-åtgärder. Enligt IVL minskar sådana paket biltrafikarbetet med ' + spann(ip.pushpull) +
        '. Modellen ger här <b>' + pct(dV) + '</b> fordonskm per hushåll.' +
        (R.takBinder ? ' En stor del av minskningen kommer från parkeringstalet, som begränsar bilinnehavet direkt.'
          : (-dV > ip.pushpull[1] + 0.005 ? ' Det är mer än IVL funnit i genomförda paket. Kontrollera att nivåerna är rimliga för området.' : ''));
    } else if (r.pull) {
      text = 'Paketet förbättrar alternativen men gör inte bilen mindre attraktiv. Enligt IVL ger sådana paket ' + spann(ip.pull) +
        ' mindre biltrafik, och pull-åtgärderna räknas därför med ' + f0.format(E.kPull[0] * 100) + ' %. Modellen ger <b>' + pct(dV) +
        '</b>. Lägg till en push-åtgärd, till exempel parkeringsavgifter eller omfördelat gatuutrymme, för större effekt.' +
        (-dV > ip.pull[1] + 0.005 ? ' Resultatet är större än IVL funnit för sådana paket; kontrollera nivåerna.' : '');
    } else if (r.push) {
      text = 'Paketet gör bilen mindre attraktiv men förbättrar inte alternativen. IVL betonar att push-åtgärder behöver kombineras med bättre alternativ, både för effekten och för acceptansen.';
    } else {
      text = 'Paketet består av stödåtgärder. De förstärker andra åtgärder men ger begränsad effekt ensamma.';
    }
    el.innerHTML = '<h3>Samverkan i paketet</h3><ul class="ben">' + ben.map(function (b) {
      return '<li class="' + (b[0] ? 'ja' : 'nej') + '"><span aria-hidden="true">' + (b[0] ? '✓' : '–') + '</span> ' + esc(b[1]) +
        '<span class="sr-only">' + (b[0] ? ': ingår' : ': ingår inte') + '</span></li>';
    }).join('') + '</ul><p>' + text + '</p>' +
      (tathet.text ? '<p class="falt-hjalp">' + esc(tathet.text) + '</p>' : '') +
      '<p class="falt-hjalp"><a href="#ref-samverkan" data-till-ref="samverkan">Så räknar modellen samverkan</a></p>';
    Array.prototype.forEach.call(el.querySelectorAll('[data-till-ref]'), function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); visaReferens(a.getAttribute('data-till-ref')); });
    });
  }

  // Sammanfattningsrad som syns när resultatrutan är utanför skärmen
  function sammanfattning(el, R, aktiv, ef) {
    if (!aktiv) { el.dataset.aktiv = ''; el.hidden = true; return; }
    el.dataset.aktiv = '1';
    el.innerHTML = '<span class="sf-rubrik">Med åtgärder</span>' +
      '<span class="sf-post"><b>' + bph(R.B) + '</b> bilar per hushåll <i>' + pct(R.B / R.B0 - 1) + '</i></span>' +
      '<span class="sf-post"><b>' + km(R.km) + '</b> km per bil <i>' + pct(R.km / R.km0 - 1) + '</i></span>' +
      '<span class="sf-post"><b>' + km(R.V) + '</b> fordonskm per hushåll <i>' + pct(R.V / R.V0 - 1) + '</i></span>' +
      (ef ? '<span class="sf-post"><b>' + co2(R.Cv * ef) + '</b> kg CO₂ per hushåll <i>' + pct(R.Cv / R.V0 - 1) + '</i></span>' : '');
    el.hidden = !el.dataset.utanfor;
  }
  function observeraResultat(flik) {
    if (!('IntersectionObserver' in window)) return;
    var kort = document.querySelector('#vy-' + (flik === 'b' ? 'befintliga' : 'nya') + ' .resultat');
    var sf = $(flik + '-sammanfattning');
    new IntersectionObserver(function (poster) {
      poster.forEach(function (p) {
        sf.dataset.utanfor = p.isIntersecting ? '' : '1';
        sf.hidden = !(sf.dataset.aktiv && sf.dataset.utanfor);
      });
    }, { threshold: 0.05 }).observe(kort);
  }

  // 90 %-intervall för en relativ förändring: från minst till mest effekt
  function ivText(hi, lo, bas) { return pct(hi / bas - 1).replace(' %', '') + ' till ' + pct(lo / bas - 1); }
  function effektrad(el, R, E, extra, ef, U) {
    if (!E.aktiv) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = 'Med valda åtgärder' + (R.takBinder ? ' och parkeringstalet' : '') + ' ändras fordonskm per hushåll med <b>' + pct(R.V / R.V0 - 1) + '</b>' +
      (U ? ' (90 %: ' + ivText(U.V.p95, U.V.p5, R.V0) + ')' : '') + ', från ' + km(R.V0) + ' till <b>' + km(R.V) + '</b> km per år.' +
      (ef ? ' CO₂ från bilarna ändras med <b>' + pct(R.Cv / R.V0 - 1) + '</b>' + (U ? ' (' + ivText(U.Cv.p95, U.Cv.p5, R.V0) + ')' : '') +
        ', från ' + co2(R.V0 * ef) + ' till <b>' + co2(R.Cv * ef) + '</b> kg per hushåll och år.' : '') + (extra || '') +
      (U ? ' <a href="#osakerhet" class="iv-lank" data-oppna-osak>Om osäkerheten</a>' : '');
    var a = el.querySelector('[data-oppna-osak]');
    if (a) a.addEventListener('click', function (e) { e.preventDefault(); if (window.KONTROLL) window.KONTROLL.oppnaKontroll('osakerhet'); });
  }
  function mcOmrade(atg, kontext, B0, km0, tak) {
    return window.MC ? window.MC.omrade(atg, kontext, B0, km0, tak) : null;
  }

  /* ================= Befintliga områden ================= */
  function initBefintliga() {
    segment($('b-stad'), 'b-stad', S.b.kk, function (kk) {
      S.b.kk = kk; S.b.sd = stadsdelar(kk)[0]; S.b.kod = ''; renderB(true);
    });
    $('b-stadsdel').addEventListener('change', function (e) { S.b.sd = e.target.value; S.b.kod = ''; renderB(true); });
    $('b-deso').addEventListener('change', function (e) { S.b.kod = e.target.value; renderB(false); });
    byggPanel('b');
    observeraResultat('b');
  }

  function valjDeso(r) {
    S.b.kk = r.kk; var nyttSd = S.b.sd !== r.sd; S.b.sd = r.sd; S.b.kod = r.kod;
    satt($('b-stad'), r.kk);
    renderB(nyttSd);
  }

  function renderB(passa) {
    var kk = S.b.kk, sd = S.b.sd;
    fyllSelect($('b-stadsdel'), stadsdelar(kk).map(function (s) { return { v: s, t: s }; }), sd);
    fyllSelect($('b-deso'), desoAlternativ(kk, sd), S.b.kod);
    var rows = raderI(kk, sd), stad = raderKommun(kk), A = agg(rows);
    var r = S.b.kod ? hitta(S.b.kod) : null;
    var K = META.kommuner[kk];
    var hh = r ? r.hh : A.hh, nya = S.b.nya;

    var kontextB = { andelNy: nya > 0 ? nya / (hh + nya) : 0, tathet: nya > 0 ? nya / hh : 0 };
    var E = atgardseffekt(S.atgB, kontextB);
    var R = tillampa(r ? r.bph : A.bph, r ? r.km : A.km, E, 0);
    var U = E.aktiv ? mcOmrade(S.atgB, kontextB, R.B0, R.km0, 0) : null;

    $('b-rubrik').textContent = r ? r.rs : sd;
    $('b-underrubrik').textContent = (r ? 'DeSO ' + r.kod + ' i ' + sd + ', ' + K.namn : 'Hela stadsdelsområdet, ' + A.n + ' DeSO i ' + K.namn) +
      (nya > 0 ? ', efter förtätning med ' + heltal(nya) + ' bostäder' : '');
    $('b-bph').textContent = bph(R.B);
    $('b-km').textContent = km(R.km);
    $('b-bph-not').textContent = E.aktiv ? 'Utan åtgärder ' + bph(R.B0) + '.' + (U && bph(U.B.p5) !== bph(U.B.p95) ? ' 90 %: ' + intervall(U.B.p5, U.B.p95, bph) + '.' : '') : 'bilar som hushållen har tillgång till';
    $('b-mil').textContent = E.aktiv ? 'Utan åtgärder ' + km(R.km0) + ' km.' + (U ? ' 90 %: ' + intervall(U.K.p5, U.K.p95, km) + ' km.' : '') : 'motsvarar ' + heltal(R.km / 10) + ' mil per år';

    remsa($('b-remsa-bph'), {
      alla: stad.map(function (x) { return x.bph; }), markerade: rows.map(function (x) { return x.bph; }),
      varde: R.B, fore: E.aktiv ? R.B0 : null, snitt: K.snitt_bph, snittEtikett: 'Snitt ' + K.namn, fmt: bph,
      aria: 'Bilar per hushåll i alla DeSO i ' + K.namn + '. Valt område ' + bph(R.B) + ', snitt ' + bph(K.snitt_bph) + '.'
    });
    remsa($('b-remsa-km'), {
      alla: stad.map(function (x) { return x.km; }), markerade: rows.map(function (x) { return x.km; }),
      varde: R.km, fore: E.aktiv ? R.km0 : null, snitt: K.snitt_km, snittEtikett: 'Snitt ' + K.namn, fmt: km,
      aria: 'Körsträcka per bil i alla DeSO i ' + K.namn + '. Valt område ' + km(R.km) + ' km, snitt ' + km(K.snitt_km) + ' km.'
    });

    var ef = klimatEf(kk);
    var extra = '';
    if (nya > 0) {
      extra = ' Med ' + heltal(nya) + ' nya bostäder blir fordonskm i hela området ' + f1.format(R.V * (hh + nya) / 1e6) +
        ' miljoner km per år, mot ' + f1.format(R.V0 * hh / 1e6) + ' miljoner i dag.';
    }
    effektrad($('b-effekt'), R, E, extra, ef, U);

    var par = [['Fordonskm per hushåll och år', km(R.V) + ' km']];
    if (E.aktiv) par.push(['Fordonskm per hushåll utan åtgärder', km(R.V0) + ' km']);
    if (ef) {
      par.push(['CO₂ från bilarna per hushåll och år', co2(R.Cv * ef) + ' kg']);
      if (E.aktiv) {
        par.push(['CO₂ per hushåll utan åtgärder', co2(R.V0 * ef) + ' kg']);
        var dTon = (R.Cv * (hh + nya) - R.V0 * hh) * ef / 1000;
        par.push(['CO₂ per år i ' + (r ? 'DeSO:n' : 'stadsdelsområdet') + ', förändring', (dTon < 0 ? '−' : '+') + heltal(Math.abs(Math.round(dTon / 10) * 10)) + ' ton']);
      }
    }
    if (r) {
      par.push(['Registrerade bilar per hushåll', bph(r.bphR)], ['Hushåll', heltal(r.hh)], ['Invånare', heltal(r.bef)],
        ['Registrerade bilar', heltal(r.bil)], ['Avstånd till Stortorget', f1.format(r.d) + ' km'],
        ['Bilar per hushåll utan åtgärder, P5–P95', intervall(r.bph5, r.bph95, bph)],
        ['Körsträcka utan åtgärder, P5–P95', intervall(r.km5, r.km95, km) + ' km']);
    } else {
      par.push(['Registrerade bilar per hushåll', bph(A.bphR)], ['Hushåll', heltal(A.hh)], ['Invånare', heltal(A.bef)],
        ['Bilar per hushåll, lägst–högst DeSO', intervall(A.bphMin, A.bphMax, bph)],
        ['Körsträcka per bil, lägst–högst DeSO', intervall(A.kmMin, A.kmMax, km) + ' km']);
    }
    if (nya > 0) par.push(['Hushåll efter förtätning', heltal(hh + nya)]);
    if (U) par.push(['Fordonskm per hushåll med åtgärder, 90 %', intervall(U.V.p5, U.V.p95, km) + ' km']);
    if (U && ef) par.push(['CO₂ per hushåll med åtgärder, 90 %', intervall(U.Cv.p5 * ef, U.Cv.p95 * ef, co2) + ' kg']);
    detaljer($('b-detaljer'), par);
    bidragsTabell($('b-bidrag'), E, R);
    paketKontroll($('b-paket'), E, R, { ja: nya > 0, text: nya > 0 ? '' : 'Täthet och närhet: ange nya bostäder under Förtätning för att ta med markanvändningen.' });
    sammanfattning($('b-sammanfattning'), R, E.aktiv, ef);
    $('b-nya-text').textContent = 'I dag finns ' + heltal(hh) + ' hushåll i ' + (r ? 'DeSO:n' : 'stadsdelsområdet') + '.' +
      (nya > 0 ? ' Förtätningen ökar antalet bostäder med ' + pct(nya / hh) + '. ' : ' ') +
      'Nya bostäder antas få samma utgångsläge som området. Åtgärder som bara gäller nya bostäder vägs med deras andel.';

    renderTabellB(rows, stad);
    uppdateraKarta(passa);
  }

  function renderTabellB(rows, stad) {
    $('b-tabell-rubrik').textContent = 'DeSO-områden i ' + S.b.sd;
    var maxB = Math.max.apply(null, stad.map(function (r) { return r.bph; }));
    var maxK = Math.max.apply(null, stad.map(function (r) { return r.km; }));
    var sorted = rows.slice().sort(function (a, b) { return b.bph - a.bph; });
    $('b-tabell').innerHTML = sorted.map(function (r) {
      var vald = r.kod === S.b.kod ? ' class="vald" aria-selected="true"' : '';
      return '<tr data-kod="' + r.kod + '"' + vald + ' tabindex="0">' +
        '<td>' + esc(r.rs) + '<span class="kod">' + r.kod + '</span></td>' +
        '<td class="tal">' + heltal(r.hh) + '</td>' +
        '<td>' + stapel(r.bph, maxB, bph) + '</td>' +
        '<td>' + stapel(r.km, maxK, km) + '</td>' +
        '<td class="tal">' + km(r.vkm) + '</td></tr>';
    }).join('');
    Array.prototype.forEach.call($('b-tabell').querySelectorAll('tr'), function (tr) {
      var go = function () { valjDeso(hitta(tr.getAttribute('data-kod'))); };
      tr.addEventListener('click', go);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }
  function stapel(v, max, fmt) {
    return '<div class="stapel"><span class="v">' + fmt(v) + '</span><span class="spar"><span class="fyll" style="display:block;width:' +
      (100 * v / max).toFixed(1) + '%"></span></span></div>';
  }

  /* ================= Nya områden ================= */
  function nyttTillstand(id) {
    var p = NYA.filter(function (x) { return x.id === id; })[0];
    var n = {
      id: p.id, kk: p.kk, lat: p.lat, lon: p.lon, bostader: p.bostader, ptal: '', lage: false,
      analog: { kk: p.analog.kk, sd: p.analog.sd, kod: p.analog.kod }
    };
    n.avstand = p.lat != null ? avstandKm(p.lat, p.lon, META.kommuner[p.kk].centrum.lat, META.kommuner[p.kk].centrum.lon) : 3;
    return n;
  }

  function initNya() {
    fyllSelect($('n-omrade'), NYA.map(function (p) { return { v: p.id, t: p.namn }; }), NYA[0].id);
    fyllSelect($('n-kommun'), KOMMUNER.map(function (kk) { return { v: kk, t: kommunNamn(kk) }; }), '1280');
    S.n = nyttTillstand(NYA[0].id);
    segment($('n-stad'), 'n-stad', S.n.analog.kk, function (kk) {
      S.n.analog = { kk: kk, sd: stadsdelar(kk)[0], kod: '' }; renderN(true);
    });
    $('n-omrade').addEventListener('change', function (e) { S.n = nyttTillstand(e.target.value); renderN(true); });
    $('n-kommun').addEventListener('change', function (e) {
      S.n.kk = e.target.value; S.n.lat = null; S.n.lon = null;
      S.n.analog = { kk: S.n.kk, sd: stadsdelar(S.n.kk)[0], kod: '' };
      renderN(true);
    });
    $('n-stadsdel').addEventListener('change', function (e) { S.n.analog.sd = e.target.value; S.n.analog.kod = ''; renderN(true); });
    $('n-deso').addEventListener('change', function (e) { S.n.analog.kod = e.target.value; renderN(true); });
    $('n-bostader').addEventListener('input', function (e) { S.n.bostader = tal(e.target.value) || 0; renderN(false, true); });
    $('n-avstand').addEventListener('input', function (e) {
      var v = tal(e.target.value);
      if (!isNaN(v) && v >= 0) { S.n.avstand = v; S.n.lat = null; S.n.lon = null; renderN(false, true); }
    });
    $('n-ptal').addEventListener('input', function (e) { S.n.ptal = e.target.value; renderN(false, true); });
    $('n-lage').addEventListener('change', function (e) { S.n.lage = e.target.checked; renderN(false); });
    byggPanel('n');
    observeraResultat('n');
  }

  function analogRader(a) { return a.kod ? [hitta(a.kod)] : raderI(a.kk, a.sd); }
  function analogNamn(a) {
    if (!a.kod) return a.sd + (a.kk !== S.n.kk ? ', ' + kommunNamn(a.kk) : '');
    var r = hitta(a.kod); return r.rs + ' (' + r.kod + ')';
  }

  function berakna(a, n, E) {
    var rows = analogRader(a), A = agg(rows);
    var p = tal(n.ptal);
    var harP = !isNaN(p) && p > 0;
    var kmLage = kmEnligtLage(n.kk, n.avstand);
    var km0 = n.lage ? kmLage : A.km;
    var R = tillampa(A.bph, km0, E, harP ? p : 0);
    R.rows = rows; R.A = A; R.harP = harP; R.p = p; R.kmLage = kmLage;
    R.bilar = R.B * (n.bostader || 0); R.vkmTot = R.V * (n.bostader || 0);
    return R;
  }

  function renderN(passa, behallFokus) {
    var n = S.n, p = NYA.filter(function (x) { return x.id === n.id; })[0], a = n.analog;
    var K = META.kommuner[n.kk];
    $('n-omrade').value = n.id;
    $('n-text').textContent = p.text;
    $('n-motiv').textContent = p.motiv;
    $('n-kommun-falt').hidden = n.id !== 'eget';
    $('n-kommun').value = n.kk;
    satt($('n-stad'), a.kk);
    fyllSelect($('n-stadsdel'), stadsdelar(a.kk).map(function (s) { return { v: s, t: s }; }), a.sd);
    fyllSelect($('n-deso'), desoAlternativ(a.kk, a.sd), a.kod);
    if (!behallFokus) {
      $('n-bostader').value = n.bostader;
      $('n-avstand').value = f1.format(n.avstand);
      $('n-ptal').value = n.ptal;
    } else if (document.activeElement !== $('n-avstand')) {
      $('n-avstand').value = f1.format(n.avstand);
    }
    $('n-lage').checked = n.lage;

    var pTal = tal(n.ptal), B0a = agg(analogRader(a)).bph;
    var ptalBinder = !isNaN(pTal) && pTal > 0 && pTal < B0a;
    var kontextN = { andelNy: 1, tathet: 0, pushExtra: ptalBinder ? 1 : 0 };
    var E = atgardseffekt(S.atgN, kontextN);
    var R = berakna(a, n, E);
    var U = E.aktiv ? mcOmrade(S.atgN, kontextN, R.B0, R.km0, R.harP ? R.p : 0) : null;
    var andrat = E.aktiv || R.takBinder;
    $('n-rubrik').textContent = p.id === 'eget' ? 'Eget område i ' + K.namn : p.namn;
    $('n-underrubrik').textContent = 'Uppskattat från ' + analogNamn(a) + ', ' + f1.format(n.avstand) + ' km från Stortorget' +
      (E.aktiv ? ', med ' + E.poster.length + (E.poster.length === 1 ? ' åtgärd' : ' åtgärder') : '');
    $('n-bph').textContent = bph(R.B);
    $('n-km').textContent = km(R.km);
    var bn = $('n-bph-not');
    var bnText = andrat ? 'Utan åtgärder ' + bph(R.B0) + '.' : 'Som i ' + analogNamn(a) + '.';
    if (R.takBinder) bnText += ' Begränsat av parkeringstalet (' + bph(R.p) + ').';
    if (U && bph(U.B.p5) !== bph(U.B.p95)) bnText += ' 90 %: ' + intervall(U.B.p5, U.B.p95, bph) + '.';
    bn.textContent = bnText;
    bn.className = 'avlasning-enhet' + (R.takBinder ? ' varning' : '');
    var kmText = n.lage ? 'Omräknat till ' + f1.format(n.avstand) + ' km från Stortorget.' : 'Som i ' + analogNamn(a) + '.';
    if (E.aktiv) kmText = 'Utan åtgärder ' + km(R.km0) + ' km.' + (U ? ' 90 %: ' + intervall(U.K.p5, U.K.p95, km) + ' km.' : '');
    else if (!n.lage) kmText += ' Enligt läget: ' + km(R.kmLage) + ' km.';
    $('n-km-not').textContent = kmText;

    var stad = raderKommun(n.kk);
    var mark = R.rows.filter(function (r) { return r.kk === n.kk; });
    remsa($('n-remsa-bph'), {
      alla: stad.map(function (x) { return x.bph; }), markerade: mark.map(function (x) { return x.bph; }),
      varde: R.B, fore: andrat ? R.B0 : null, snitt: K.snitt_bph, snittEtikett: 'Snitt ' + K.namn, fmt: bph,
      aria: 'Uppskattade bilar per hushåll ' + bph(R.B) + ' jämfört med alla DeSO i ' + K.namn + '.'
    });
    remsa($('n-remsa-km'), {
      alla: stad.map(function (x) { return x.km; }), markerade: mark.map(function (x) { return x.km; }),
      varde: R.km, fore: E.aktiv ? R.km0 : null, snitt: K.snitt_km, snittEtikett: 'Snitt ' + K.namn, fmt: km,
      aria: 'Uppskattad körsträcka per bil ' + km(R.km) + ' km jämfört med alla DeSO i ' + K.namn + '.'
    });
    var ef = klimatEf(n.kk);
    effektrad($('n-effekt'), R, E, n.bostader > 0 ? ' För ' + heltal(n.bostader) + ' bostäder blir det ' + f1.format(R.vkmTot / 1e6) +
      ' miljoner fordonskm per år, mot ' + f1.format(R.V0 * n.bostader / 1e6) + ' miljoner utan åtgärder.' : '', ef, U);

    var par = [['Fordonskm per hushåll och år', km(R.V) + ' km']];
    if (andrat) par.push(['Fordonskm per hushåll utan åtgärder', km(R.V0) + ' km']);
    if (ef) {
      par.push(['CO₂ från bilarna per hushåll och år', co2(R.Cv * ef) + ' kg']);
      if (andrat) par.push(['CO₂ per hushåll utan åtgärder', co2(R.V0 * ef) + ' kg']);
    }
    if (n.bostader > 0) {
      par.push(['Bostäder (räknas som hushåll)', heltal(n.bostader)]);
      par.push(['Bilar i området, ungefär', heltal(Math.round(R.bilar / 10) * 10)]);
      par.push(['Fordonskm per år i området', f1.format(R.vkmTot / 1e6) + ' miljoner km']);
      if (ef) par.push(['CO₂ per år i området', heltal(Math.round(R.Cv * n.bostader * ef / 1000 / 10) * 10) + ' ton' +
        (andrat ? ' (utan åtgärder ' + heltal(Math.round(R.V0 * n.bostader * ef / 1000 / 10) * 10) + ')' : '')]);
    }
    if (R.rows.length > 1) {
      par.push(['Bilar per hushåll, lägst–högst DeSO i motsvarande område', intervall(R.A.bphMin, R.A.bphMax, bph)]);
      par.push(['Körsträcka per bil, lägst–högst DeSO i motsvarande område', intervall(R.A.kmMin, R.A.kmMax, km) + ' km']);
    } else {
      par.push(['Bilar per hushåll, P5–P95 i motsvarande DeSO', intervall(R.rows[0].bph5, R.rows[0].bph95, bph)]);
      par.push(['Körsträcka per bil, P5–P95 i motsvarande DeSO', intervall(R.rows[0].km5, R.rows[0].km95, km) + ' km']);
    }
    if (U) par.push(['Fordonskm per hushåll med åtgärder, 90 %', intervall(U.V.p5, U.V.p95, km) + ' km']);
    par.push(['Bedömd osäkerhet för nytt område', '±25–40 %']);
    detaljer($('n-detaljer'), par);
    bidragsTabell($('n-bidrag'), E, R);
    paketKontroll($('n-paket'), E, R, { ja: R.harP, text: R.harP ? (ptalBinder ? 'Parkeringstalet begränsar bilinnehavet och räknas som en push-åtgärd.' : '') : 'Täthet och närhet: ange ett parkeringstal för att ta med planeringen av det nya området.' });
    sammanfattning($('n-sammanfattning'), R, andrat, ef);

    var steg = [];
    steg.push('Motsvarande område: <b>' + esc(analogNamn(a)) + '</b>, ' + R.A.n + ' DeSO och ' + heltal(R.A.hh) +
      ' hushåll. Hushållsvägt medel av bilar per hushåll: <b>' + bph(R.A.bph) + '</b>.');
    if (n.lage) {
      steg.push('Körsträcka per bil enligt modellens lägesindex: ' + heltal(K.C) + ' × max(' + f1.format(n.avstand) + '; ' +
        f1.format(DMIN) + ')<sup>' + f1.format(EPS) + '</sup> = <b>' + km(R.km0) + '</b> km per år.');
    } else {
      steg.push('Körsträcka per bil, bilvägt medel i det motsvarande området: <b>' + km(R.km0) + '</b> km per år.');
    }
    if (E.aktiv) {
      steg.push('Valda åtgärder ändrar bilinnehavet med <b>' + pct(E.fB[0] - 1) + '</b> och fordonskm per hushåll med <b>' + pct(E.fV[0] - 1) +
        '</b>. Bilar per hushåll blir ' + bph(R.Bfore) + ' och körsträcka per bil ' + km(R.km) + ' km.' +
        (E.fC[0] !== 1 ? ' Utsläppen per km ändras med <b>' + pct(E.fC[0] - 1) + '</b>.' : '') +
        (E.roller.pull && E.push < 1 ? ' Pull-åtgärderna räknas med ' + f0.format(E.kPull[0] * 100) + ' % (samverkan enligt IVL).' : ''));
    } else {
      steg.push('Inga mobilitetsåtgärder valda.');
    }
    if (R.harP) {
      steg.push('Parkeringstal <b>' + bph(R.p) + '</b> platser per bostad. ' + (R.takBinder
        ? 'Det är lägre än skattningen, så bilar per hushåll sätts till <b>' + bph(R.p) + '</b>.'
        : 'Det är högre än skattningen, så det begränsar inte.'));
    } else {
      steg.push('Inget parkeringstal angivet, så bilar per hushåll begränsas inte av parkeringen.');
    }
    steg.push('Fordonskm per hushåll = ' + bph(R.B) + ' × ' + km(R.km) + ' = <b>' + km(R.V) + '</b> km per år.' +
      (ef ? ' CO₂ = ' + km(R.V) + ' × ' + f0.format(ef * 1000) + ' g/km' + (E.fC[0] !== 1 ? ' × ' + f2.format(E.fC[0]) : '') + ' = <b>' + co2(R.Cv * ef) + '</b> kg per hushåll och år.' : ''));
    if (n.bostader > 0) {
      steg.push('För ' + heltal(n.bostader) + ' bostäder: ungefär <b>' + heltal(Math.round(R.bilar / 10) * 10) +
        '</b> bilar och <b>' + f1.format(R.vkmTot / 1e6) + ' miljoner</b> fordonskm per år.');
    }
    $('n-berakning').innerHTML = steg.map(function (s) { return '<li>' + s + '</li>'; }).join('');

    renderTabellN(p, E);
    uppdateraKarta(passa);
  }

  function renderTabellN(p, E) {
    var n = S.n;
    var lista = p.forslag ? p.forslag.slice() : stadsdelar(n.analog.kk).map(function (sd) { return { kk: n.analog.kk, sd: sd, kod: '', motiv: '' }; });
    var finns = lista.some(function (f) { return f.kk === n.analog.kk && f.sd === n.analog.sd && f.kod === n.analog.kod; });
    if (!finns) lista.unshift({ kk: n.analog.kk, sd: n.analog.sd, kod: n.analog.kod, motiv: 'Ditt val' });
    $('n-tabell-rubrik').textContent = p.forslag ? 'Samma beräkning med andra motsvarande områden' : 'Samma beräkning med varje stadsdelsområde i ' + kommunNamn(n.analog.kk);
    $('n-tabell').innerHTML = lista.map(function (f, i) {
      var R = berakna(f, n, E);
      var vald = f.kk === n.analog.kk && f.sd === n.analog.sd && f.kod === n.analog.kod;
      return '<tr data-i="' + i + '"' + (vald ? ' class="vald" aria-selected="true"' : '') + ' tabindex="0">' +
        '<td>' + esc(analogNamn(f)) + (f.kod ? '<span class="kod">i ' + esc(f.sd) + '</span>' : '') + '</td>' +
        '<td class="motiv">' + esc(f.motiv || '') + '</td>' +
        '<td class="tal">' + bph(R.B) + '</td><td class="tal">' + km(R.km) + '</td><td class="tal">' + km(R.V) + '</td></tr>';
    }).join('');
    Array.prototype.forEach.call($('n-tabell').querySelectorAll('tr'), function (tr) {
      var f = lista[+tr.getAttribute('data-i')];
      var go = function () { S.n.analog = { kk: f.kk, sd: f.sd, kod: f.kod }; renderN(true); };
      tr.addEventListener('click', go);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  /* ================= Referenser ================= */
  function spanntext(e) {
    if (!e || (e[0] === 0 && e[2] === 0)) return 'ingen effekt';
    return pct(e[0]) + ' (' + pct(e[1]).replace(' %', '') + ' till ' + pct(e[2]) + ')';
  }
  function refLista(ids) {
    return '<ul class="ref-poster">' + ids.map(function (id) {
      var r = ATG.referenser[id];
      if (!r) return '';
      return '<li><p class="ref-text">' + esc(r.text) + ' <span class="ref-land">' + esc(r.land) + '</span></p>' +
        '<p class="ref-fynd">' + esc(r.fynd) + '</p>' + (r.url ? '<p class="ref-url"><a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.url.replace(/^https?:\/\//, '').slice(0, 70)) + (r.url.length > 78 ? '…' : '') + '</a></p>' : '') + '</li>';
    }).join('') + '</ul>';
  }
  function byggReferenser() {
    $('ref-grader').innerHTML = ['A', 'B', 'C'].map(function (g) { return '<p>' + gradBadge(g) + ' ' + esc(GRADTEXT[g].replace(/^Evidensgrad .: /, '')) + '</p>'; }).join('');
    var gruppNamn = {};
    ATG.grupper.forEach(function (g) { gruppNamn[g.id] = g.namn; });
    var h = '';
    ATG.lista.forEach(function (m) {
      var niva = m.typ === 'andel' ? 'Reglaget anger hur stor andel av hushållen som ' + m.nivaText.replace(/^av hushållen /, '') + '; effekten gäller ' + m.perText + '.'
        : m.typ === 'niva' ? 'Reglaget anger hur långt åtgärden genomförs, från 0 till 100 %, och effekten skalas linjärt.'
          : 'Åtgärden är antingen av eller på.';
      h += '<article class="ref-kort" id="ref-' + m.id + '"><header><p class="ref-grupp">' + esc(gruppNamn[m.grupp]) + ' · ' + esc((ATG.roller || {})[m.roll] || '') + '</p><h3>' + esc(m.namn) + ' ' + rollBadge(m.roll) + gradBadge(m.grad) + '</h3>' +
        '<p class="ref-kort-sub">' + esc(m.kort) + (m.endastNy ? ' Gäller bara nya bostäder.' : '') + '</p></header>' +
        '<dl class="ref-effekt"><div><dt>Bilinnehav</dt><dd>' + spanntext(m.eB) + '</dd></div><div><dt>Fordonskm per hushåll</dt><dd>' + spanntext(m.eV) + '</dd></div>' +
        ((m.eC || NOLL)[0] !== 0 ? '<div><dt>CO₂ per km</dt><dd>' + spanntext(m.eC) + '</dd></div>' : '') +
        '<div><dt>Underlag från</dt><dd>' + esc(m.geografi) + '</dd></div></dl>' +
        '<p class="ref-niva">' + esc(niva) + '</p>' +
        '<h4>Så har effekten härletts</h4><p>' + esc(m.harledning) + '</p><h4>Underlag</h4>' + refLista(m.refs) + '</article>';
    });
    var F = ATG.fortatning;
    h += '<article class="ref-kort" id="ref-fortatning"><header><p class="ref-grupp">Bebyggelse</p><h3>' + esc(F.namn) + ' ' + gradBadge(F.grad) + '</h3>' +
      '<p class="ref-kort-sub">Fler bostäder i ett befintligt område. Räknas fram från antalet nya bostäder i fliken Befintliga områden.</p></header>' +
      '<dl class="ref-effekt"><div><dt>Elasticitet, bilinnehav</dt><dd>' + f2.format(F.elB[0]) + ' (' + f2.format(F.elB[1]) + ' till ' + f2.format(F.elB[2]) + ')</dd></div>' +
      '<div><dt>Elasticitet, fordonskm</dt><dd>' + f2.format(F.elV[0]) + ' (' + f2.format(F.elV[1]) + ' till ' + f2.format(F.elV[2]) + ')</dd></div>' +
      '<div><dt>Underlag från</dt><dd>' + esc(F.geografi) + '</dd></div></dl>' +
      '<h4>Så har effekten härletts</h4><p>' + esc(F.harledning) + '</p><h4>Underlag</h4>' + refLista(F.refs) + '</article>';
    var P = ATG.ptal;
    h += '<article class="ref-kort" id="ref-ptal"><header><p class="ref-grupp">Parkering</p><h3>' + esc(P.namn) + ' ' + gradBadge(P.grad) + '</h3>' +
      '<p class="ref-kort-sub">Anges i fliken Nya områden. Bilar per hushåll kan inte bli högre än antalet parkeringsplatser per bostad.</p></header>' +
      '<dl class="ref-effekt"><div><dt>Underlag från</dt><dd>' + esc(P.geografi) + '</dd></div></dl>' +
      '<h4>Så har effekten härletts</h4><p>' + esc(P.harledning) + '</p><h4>Underlag</h4>' + refLista(P.refs) + '</article>';
    $('ref-lista').innerHTML = h;
    $('ref-komb').innerHTML = (SV.text || []).map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('') +
      '<p>Varje åtgärd ger en relativ förändring av bilinnehavet, av fordonskilometer per hushåll och, för hastighet och körsätt, av utsläppen per kilometer. Körsträcka per bil räknas fram som fordonskm delat med antalet bilar. ' +
      '90-procentsintervallen i resultatet kommer från en Monte Carlo-simulering där varje åtgärds effekt dras mellan lägsta och högsta värde i underlaget, se Referenskontroll. Vid förtätning gäller åtgärder för nya bostäder bara de nya hushållen och vägs med deras andel. I fliken Nya områden tillämpas parkeringstalet sist, som ett tak.</p>' +
      '<h4>Underlag</h4>' + refLista(SV.refs || []);
    $('ref-ejmodell-lista').innerHTML = (ATG.ejModell || []).map(function (x) {
      return '<li><b>' + esc(x.namn) + '.</b> ' + esc(x.text) + '</li>';
    }).join('');
    var antal = Object.keys(ATG.referenser).length + Object.keys((window.OSAKERHET || {}).referenser || {}).length;
    if ($('ref-antal')) $('ref-antal').textContent = antal;
  }
  function visaReferens(id) {
    valjFlik('referenser');
    var mal = id ? $('ref-' + id) : $('vy-referenser');
    if (mal) {
      mal.scrollIntoView({ behavior: 'smooth', block: 'start' });
      mal.classList.add('markerad');
      setTimeout(function () { mal.classList.remove('markerad'); }, 1600);
    }
  }

  /* ================= Karta ================= */
  var karta = null, punkter = {}, nyPunkt = null, nyLinje = null, senastePassning = '';
  var GRANSER = [0.4, 0.6, 0.9, 1.2];
  var STEG = ['--s200', '--s300', '--s450', '--s550', '--s700'];
  var FARGER = [];
  function farg(v) { var i = 0; while (i < GRANSER.length && v >= GRANSER[i]) i++; return FARGER[i]; }
  var maxHh = Math.max.apply(null, DESO.map(function (r) { return r.hh; }));
  function radie(r) { return 4 + 7 * Math.sqrt(r.hh / maxHh); }

  function initKarta() {
    FARGER = STEG.map(cssVar);
    if (!window.L) { $('karta-saknas').hidden = false; return; }
    try {
      karta = L.map('karta', { scrollWheelZoom: false, zoomSnap: 0.25 });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bidragsgivare'
      }).addTo(karta);
      karta.setView([55.6, 13.0], 11);
      // DeSO-ytor från geo.js (SCB:s gränser; ytor som saknas i gränsfilen är ungefärliga och streckade). Punkt om ytan saknas.
      var ytor = {};
      if (window.GEO) {
        Object.keys(window.GEO.kommuner).forEach(function (kk) {
          window.GEO.kommuner[kk].deso.features.forEach(function (f) { ytor[f.properties.kod] = f; });
        });
      }
      DESO.forEach(function (r) {
        var m = ytor[r.kod]
          ? L.geoJSON(ytor[r.kod], { style: { color: '#ffffff', weight: 0.8, fillColor: farg(r.bph), fillOpacity: 0.75, dashArray: ytor[r.kod].properties.ungef ? '4 4' : null } })
          : L.circleMarker([r.lat, r.lon], { radius: radie(r), color: '#ffffff', weight: 1, fillColor: farg(r.bph), fillOpacity: 0.9 });
        m.yta = !!ytor[r.kod];
        m.bindTooltip(function () {
          return '<b>' + esc(r.rs) + '</b> (' + r.kod + ')<br>' + esc(r.sd) + ', ' + esc(kommunNamn(r.kk)) +
            '<br>Bilar per hushåll: <b>' + bph(r.bph) + '</b><br>Körsträcka per bil: <b>' + km(r.km) + ' km/år</b>';
        }, { className: 'kartetikett', direction: 'top', offset: [0, -6] });
        m.on('click', function () { if (S.flik === 'befintliga') valjDeso(r); });
        m.addTo(karta);
        punkter[r.kod] = m;
      });
      karta.on('click', function (e) {
        if (S.flik !== 'nya') return;
        var c = META.kommuner[S.n.kk].centrum;
        var d = avstandKm(e.latlng.lat, e.latlng.lng, c.lat, c.lon);
        if (d > 30) return;
        S.n.lat = e.latlng.lat; S.n.lon = e.latlng.lng; S.n.avstand = d;
        renderN(false, true);
      });
    } catch (err) {
      karta = null; $('karta-saknas').hidden = false;
    }
  }

  function ib0() { return S.flik === 'nya' && S.n ? S.n.kk : S.b.kk; }
  function teckenforklaring() {
    var etiketter = ['under 0,4', '0,4–0,6', '0,6–0,9', '0,9–1,2', '1,2 eller fler'];
    var G = window.GEO && window.GEO.kommuner[ib0()];
    var h = '<span class="rubrik">Bilar per hushåll i varje DeSO, utan åtgärder. ' +
      (G ? (G.exakt ? 'DeSO-gränser från SCB.' + (G.ungefarliga && G.ungefarliga.length ? ' Streckade ytor är ungefärliga (saknas i gränsfilen).' : '') : 'Ytorna i ' + esc(kommunNamn(ib0())) + ' är ungefärliga.') : 'Punktens storlek visar antal hushåll.') + '</span>';
    h += etiketter.map(function (t, i) { return '<span class="post"><i style="background:' + FARGER[i] + '"></i>' + t + '</span>'; }).join('');
    h += S.flik === 'befintliga'
      ? '<span class="post"><i class="ring"></i>Valt DeSO</span>'
      : '<span class="post"><i style="background:' + cssVar('--sel') + '"></i>Nytt område</span>';
    $('teckenforklaring').innerHTML = h;
  }

  function uppdateraKarta(passa) {
    teckenforklaring();
    if (!karta) return;
    var sel = cssVar('--sel');
    var fokus = [];
    var ib = S.flik === 'befintliga';
    var aktivKk = ib ? S.b.kk : S.n.kk;
    DESO.forEach(function (r) {
      var m = punkter[r.kod];
      var iFokus, vald = false;
      if (ib) { iFokus = r.kk === S.b.kk && r.sd === S.b.sd; vald = r.kod === S.b.kod; }
      else { var a = S.n.analog; iFokus = r.kk === a.kk && r.sd === a.sd && (!a.kod || r.kod === a.kod); }
      if (iFokus) {
        if (m.yta) { var bb = m.getBounds(); fokus.push(bb.getSouthWest(), bb.getNorthEast()); } else fokus.push([r.lat, r.lon]);
      }
      m.setStyle(m.yta ? {
        fillOpacity: iFokus ? 0.85 : (r.kk === aktivKk ? 0.35 : 0.2),
        opacity: 1,
        color: vald ? sel : (iFokus ? '#13222c' : '#ffffff'), weight: vald ? 3.5 : (iFokus ? 1.2 : 0.6)
      } : {
        fillOpacity: iFokus ? 0.95 : (r.kk === aktivKk ? 0.3 : 0.2),
        opacity: iFokus ? 1 : 0.5,
        color: vald ? sel : '#ffffff', weight: vald ? 3.5 : 1
      });
      if (!m.yta) m.setRadius(radie(r) + (vald ? 2 : 0));
      if (iFokus) m.bringToFront();
    });
    if (ib && S.b.kod && punkter[S.b.kod]) punkter[S.b.kod].bringToFront();

    if (nyPunkt) { karta.removeLayer(nyPunkt); nyPunkt = null; }
    if (nyLinje) { karta.removeLayer(nyLinje); nyLinje = null; }
    if (!ib && S.n.lat != null) {
      var c = META.kommuner[S.n.kk].centrum;
      nyLinje = L.polyline([[c.lat, c.lon], [S.n.lat, S.n.lon]], { color: sel, weight: 2, dashArray: '5 6', opacity: 0.9, interactive: false }).addTo(karta);
      nyPunkt = L.circleMarker([S.n.lat, S.n.lon], { radius: 11, color: '#ffffff', weight: 3, fillColor: sel, fillOpacity: 1, interactive: false })
        .bindTooltip(NYA.filter(function (x) { return x.id === S.n.id; })[0].namn.split(',')[0], { permanent: true, direction: 'right', offset: [12, 0], className: 'nytt-omrade' })
        .addTo(karta);
      fokus.push([S.n.lat, S.n.lon]);
    }

    var nyckel = ib ? 'b|' + S.b.kk + '|' + S.b.sd : 'n|' + S.n.id + '|' + S.n.kk + '|' + JSON.stringify(S.n.analog);
    if (passa || nyckel !== senastePassning) {
      senastePassning = nyckel;
      if (fokus.length) {
        karta.invalidateSize(false);
        karta.fitBounds(L.latLngBounds(fokus), ib
          ? { padding: [40, 40], maxZoom: 14 }
          : { paddingTopLeft: [40, 40], paddingBottomRight: [130, 40], maxZoom: 14 });
      }
    } else if (ib && S.b.kod && punkter[S.b.kod]) {
      var rr = hitta(S.b.kod), ll = L.latLng(rr.lat, rr.lon);
      if (!karta.getBounds().contains(ll)) karta.panTo(ll);
    }
  }

  /* ================= Gemensamt gränssnitt för klimatfliken ================= */
  window.BILMODELL = {
    atgardseffekt: atgardseffekt,
    tillstandFranForval: tillstandFranForval,
    atgBefintliga: function () { return S.atgB; },
    visaReferens: function (id) { visaReferens(id); }
  };

  /* ================= Flikar ================= */
  var FLIKAR = ['befintliga', 'nya', 'klimat', 'referenser'];
  function valjFlik(f, fokus) {
    S.flik = f;
    FLIKAR.forEach(function (x) {
      var vald = x === f;
      $('flik-' + x).setAttribute('aria-selected', vald);
      $('flik-' + x).tabIndex = vald ? 0 : -1;
      $('vy-' + x).hidden = !vald;
    });
    var ref = f === 'referenser' || f === 'klimat';
    $('layout').hidden = ref;
    $('om-allmant').hidden = f === 'klimat';
    $('b-tabell-sektion').hidden = f !== 'befintliga';
    $('n-tabell-sektion').hidden = f !== 'nya';
    if (fokus) $('flik-' + f).focus();
    if (f === 'befintliga') renderB(true);
    else if (f === 'nya') renderN(true);
    else if (f === 'klimat' && window.KLIMAT) window.KLIMAT.visa();
    if (!ref && karta) setTimeout(function () { karta.invalidateSize(false); }, 0);
  }
  function initFlikar() {
    FLIKAR.forEach(function (x) { $('flik-' + x).addEventListener('click', function () { valjFlik(x); }); });
    document.querySelector('.flikar').addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      var i = FLIKAR.indexOf(S.flik) + (e.key === 'ArrowRight' ? 1 : -1);
      valjFlik(FLIKAR[(i + FLIKAR.length) % FLIKAR.length], true);
    });
  }

  /* ================= Start ================= */
  function metaText() {
    var v = { phi: f2.format(META.phi), eps: f1.format(META.eps), rho: f2.format(META.rho), referensar: META.referensar,
      geografi: META.geografi, modellversion: META.modellversion, uttagsdatum: META.uttagsdatum };
    Array.prototype.forEach.call(document.querySelectorAll('[data-meta]'), function (el) { el.textContent = v[el.getAttribute('data-meta')]; });
  }

  var timer = null;
  window.addEventListener('resize', function () {
    clearTimeout(timer);
    timer = setTimeout(function () { if (S.flik === 'befintliga') renderB(false); else if (S.flik === 'nya') renderN(false, true); }, 150);
  });

  metaText();
  initKarta();
  initFlikar();
  initBefintliga();
  initNya();
  byggReferenser();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { senastePassning = ''; if (S.flik === 'befintliga') renderB(true); else if (S.flik === 'nya') renderN(true); });
  }
  if (location.hash && location.hash.indexOf('#ref-') === 0) visaReferens(location.hash.slice(5));
  else if (location.hash === '#klimat') valjFlik('klimat');
  else renderB(true);
})();
