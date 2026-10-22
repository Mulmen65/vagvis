"""Riktig webbläsare: Vägvis modell B mot Bilmodell v7, område för område.
Läser tabellen i Bilmodell v7:s flik Klimatpåverkan (kg CO₂ per invånare, per hushåll och ton per år) för
alla DeSO och stadsdelsområden i Malmö, Helsingborg och Gävle, och jämför med Vägvis B i samma webbläsare.
Körs: python source/test_webblasare_hushall.py Netlify <mapp för skärmbilder>"""
import sys, re, threading, http.server, functools
from pathlib import Path
from playwright.sync_api import sync_playwright
W = Path(sys.argv[1]); UT = Path(sys.argv[2]); UT.mkdir(exist_ok=True)
class T(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8792), functools.partial(T, directory=str(W)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
fel = []
def lyssna(pg):
    pg.on("pageerror", lambda e: fel.append("pageerror " + str(e)))
    pg.route("**/tile.openstreetmap.org/**", lambda r: r.abort())
STADER = {"1280": "Malmö", "1283": "Helsingborg", "2180": "Gävle"}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    # 1. Bilmodell v7, fliken Klimatpåverkan
    v7 = {}
    pg = b.new_page(viewport={"width": 1400, "height": 1000}); lyssna(pg)
    pg.goto("http://127.0.0.1:8792/Bilmodell_v7/index.html"); pg.wait_for_timeout(1200)
    pg.click("#flik-klimat"); pg.wait_for_timeout(1200)
    for kk in STADER:
        pg.check(f"#k-stad input[value='{kk}']"); pg.wait_for_timeout(900)
        for niva in ["deso", "sd"]:
            pg.check(f"#k-niva input[value='{niva}']"); pg.wait_for_timeout(700)
            rader = pg.evaluate("""() => [...document.querySelectorAll('#k-tabell tr')].map(tr => { const td = tr.querySelectorAll('td'); return [tr.dataset.id, td[4].textContent, td[5].textContent, td[6].textContent]; })""")
            for rid, inv, hh, ton in rader:
                v7[(kk, niva, rid)] = (inv, hh, ton)
        pg.check("#k-niva input[value='deso']"); pg.wait_for_timeout(300)
        pg.wait_for_function("() => !document.getElementById('k-osak').hidden && /Utan åtgärder/.test(document.getElementById('k-osak').textContent)", timeout=30000)
        osak = pg.evaluate("() => document.getElementById('k-osak').textContent")
        v7[(kk, "osak")] = re.search(r"Utan åtgärder ([\d\s ]+)–([\d\s ]+) ton", osak).groups()
    pg.screenshot(path=str(UT / "v7_klimat.png"))
    pg.close()
    # 2. Vägvis modell B
    pg = b.new_page(viewport={"width": 1400, "height": 1000}); lyssna(pg)
    pg.goto("http://127.0.0.1:8792/index.html"); pg.wait_for_timeout(1200)
    pg.click("[data-model=household]")
    pg.wait_for_function("() => window.VagvisApp.getModel()==='household' && window.VagvisApp.getResult() && !document.querySelector('#run').disabled", timeout=120000)
    vv = pg.evaluate("""() => { const H = window.VagvisHouseholds, f = new Intl.NumberFormat('sv-SE', {maximumFractionDigits: 0}), r = x => f.format(H.v7Round(x)), R = window.VagvisApp.getResult(), out = {};
        for (const x of R.results) { if (!x.central || x.level === 'city') continue; const c = x.central;
          out[x.city + '|' + (x.level === 'deso' ? 'deso' : 'sd') + '|' + x.id] = [r(c.direct * 1000 / c.bef), r(c.direct * 1000 / c.hh), r(c.direct)]; }
        for (const kk of Object.keys(R.v7interval)) out[kk + '|osak'] = [r(R.v7interval[kk].p5), r(R.v7interval[kk].p95)];
        return out; }""")
    norm = lambda s: re.sub(r"\s", "", s)
    avvik, antal = [], 0
    for (kk, *rest), varde in v7.items():
        if rest == ["osak"]:
            continue
        niva, rid = rest
        b_ = vv.get(f"{kk}|{niva}|{rid}")
        antal += 1
        if b_ is None or [norm(x) for x in b_] != [norm(x) for x in varde]:
            avvik.append((kk, niva, rid, varde, b_))
    print("Jämförda områden:", antal, "· DeSO per stad:", {STADER[k]: sum(1 for (kk, *r) in v7 if kk == k and r and r[0] == 'deso') for k in STADER})
    print("Avvikelser mot Bilmodell v7 (kg/inv, kg/hushåll, ton):", len(avvik), avvik[:5])
    for kk in STADER:
        print(f"{STADER[kk]}: 90 % i v7 {v7[(kk, 'osak')][0].strip()}–{v7[(kk, 'osak')][1].strip()} ton · i Vägvis B {vv[kk + '|osak'][0]}–{vv[kk + '|osak'][1]} ton ·",
              "lika" if [norm(x) for x in v7[(kk, 'osak')]] == [norm(x) for x in vv[kk + '|osak']] else "OLIKA")
    print("1280C1040 i v7:", v7[("1280", "deso", "1280C1040")], "· i Vägvis B:", vv["1280|deso|1280C1040"])
    # 3. Stadsval med knapparna och en kontroll av kartans etikett
    for kk, namn in STADER.items():
        pg.click(f"#city button[data-city='{kk}']"); pg.wait_for_timeout(400)
        assert pg.evaluate("() => document.querySelector('#city button.active').textContent") == namn
    pg.click("#city button[data-city='1280']"); pg.click("[data-view=map]"); pg.wait_for_timeout(1500)
    etikett = pg.evaluate("""() => { const x = window.VagvisApp.getResult().results.find(r => r.key === 'deso|1280|1280C1040'); return x ? true : false; }""")
    pg.hover(".leaflet-interactive >> nth=10"); pg.wait_for_timeout(500)
    print("Kartetikett:", pg.evaluate("() => (document.querySelector('.leaflet-tooltip') || {}).innerText"))
    pg.screenshot(path=str(UT / "vagvis_b_karta.png"))
    assert not avvik, "Vägvis B avviker från Bilmodell v7"
print("FEL:", fel or "inga")
