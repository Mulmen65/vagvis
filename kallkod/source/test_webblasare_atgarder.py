"""Riktig webbläsare: åtgärder och referenskontroll i Vägvis modell B mot Bilmodell v7.
1. Åtgärdspaketet "IVL-paket för hela staden" i Malmö, Helsingborg och Gävle: ton CO₂ per DeSO med paketet
   och v7:s 90-procentsintervall för minskningen (fliken Klimatpåverkan i v7).
2. IVL-paketet i en DeSO med 200 nya bostäder: förändringen i ton (fliken Befintliga områden i v7).
3. Referenskontrollens 32 kontrollfall: modellvärde, 90-procentsintervall och bedömning.
Körs: python source/test_webblasare_atgarder.py Netlify <mapp för skärmbilder>"""
import sys, re, threading, http.server, functools
from pathlib import Path
from playwright.sync_api import sync_playwright
W = Path(sys.argv[1]); UT = Path(sys.argv[2]); UT.mkdir(exist_ok=True)
class T(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8796), functools.partial(T, directory=str(W)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
fel = []
def lyssna(pg):
    pg.on("pageerror", lambda e: fel.append("pageerror " + str(e)))
    pg.route("**/tile.openstreetmap.org/**", lambda r: r.abort())
norm = lambda s: re.sub(r"\s", "", s or "")
STADER = {"1280": "Malmö", "1283": "Helsingborg", "2180": "Gävle"}
DESO, NYA = "1280C1040", 200
with sync_playwright() as pw:
    b = pw.chromium.launch()
    # ---------- Bilmodell v7 ----------
    pg = b.new_page(viewport={"width": 1400, "height": 1000}); lyssna(pg)
    pg.goto("http://127.0.0.1:8796/Bilmodell_v7/index.html"); pg.wait_for_timeout(1200)
    pg.click("#flik-klimat"); pg.wait_for_timeout(800)
    pg.select_option("#k-paket", "stad_ivl"); pg.wait_for_timeout(800)
    v7ton, v7osak = {}, {}
    for kk in STADER:
        pg.check(f"#k-stad input[value='{kk}']"); pg.wait_for_timeout(800)
        pg.select_option("#k-matt", "totalt"); pg.wait_for_timeout(400)
        for rid, ton in pg.evaluate("() => [...document.querySelectorAll('#k-tabell tr')].map(tr => [tr.dataset.id, tr.querySelectorAll('td')[6].textContent])"):
            v7ton[rid] = ton
        pg.wait_for_function("() => /Minskningen med paketet/.test(document.getElementById('k-osak').textContent)", timeout=30000)
        v7osak[kk] = re.search(r"Minskningen med paketet är ([^ ]+[^)]*\))", pg.evaluate("() => document.getElementById('k-osak').textContent")).group(1)
    # Befintliga områden: en DeSO med IVL-paketet och nya bostäder
    pg.click("#flik-befintliga"); pg.wait_for_timeout(600)
    pg.check("#b-stad input[value='1280']"); pg.wait_for_timeout(400)
    pg.select_option("#b-stadsdel", "Bunkeflostrand–Tygelsjö"); pg.wait_for_timeout(400)
    pg.select_option("#b-deso", DESO); pg.wait_for_timeout(400)
    pg.select_option("#b-forval", "ivl"); pg.wait_for_timeout(400)
    pg.fill("#b-nya", str(NYA)); pg.dispatch_event("#b-nya", "input"); pg.wait_for_timeout(800)
    v7dt = pg.evaluate("() => { const d=[...document.querySelectorAll('#b-detaljer div')].find(x => /förändring/.test(x.querySelector('dt').textContent)); return d ? d.querySelector('dd').textContent : null; }")
    pg.screenshot(path=str(UT / "v7_befintliga.png"))
    # Referenskontrollen
    pg.click("#knapp-kontroll")
    pg.wait_for_function("() => document.querySelectorAll('#kk-tabell tr').length >= 32", timeout=120000)
    v7kk = {r[0]: r[1:] for r in pg.evaluate("() => [...document.querySelectorAll('#kk-tabell tr')].map(tr => { const td = tr.querySelectorAll('td'); return [td[0].textContent, td[3].textContent, td[4].textContent, td[5].querySelector('.status').textContent]; })")}
    v7nyckel = pg.evaluate("() => [...document.querySelectorAll('#kk-nyckel .kk-tal')].map(x => x.textContent)")
    pg.close()
    # ---------- Vägvis modell B ----------
    pg = b.new_page(viewport={"width": 1400, "height": 1000}); lyssna(pg)
    pg.goto("http://127.0.0.1:8796/index.html"); pg.wait_for_timeout(1200)
    pg.click("[data-model=household]")
    klar = "() => window.VagvisApp.getModel()==='household' && window.VagvisApp.getResult() && !document.querySelector('#run').disabled && document.getElementById('dirty-banner').hidden"
    pg.wait_for_function(klar, timeout=120000)
    bas = pg.evaluate("() => window.VagvisApp.getResult().results.filter(r => r.level==='deso').map(r => [r.id, r.central.direct])")
    pg.click("[data-view=measures]"); pg.wait_for_timeout(600)
    pg.select_option("#m-package", "stad_ivl"); pg.wait_for_timeout(500)
    vvton, vvosak, avvik = {}, {}, []
    for kk in STADER:
        pg.click(f"#city button[data-city='{kk}']"); pg.wait_for_timeout(500)
        pg.select_option("#m-scope", "city"); pg.wait_for_timeout(600)
        vvosak[kk] = re.search(r"Minskningen med paketet är ([^ ]+[^)]*\))", pg.evaluate("() => document.getElementById('m-v7-osak').textContent"), re.I).group(1)
        pg.click("#run"); pg.wait_for_function(klar, timeout=120000)
        for rid, t in pg.evaluate("""() => { const f=new Intl.NumberFormat('sv-SE',{maximumFractionDigits:0}); return window.VagvisApp.getResult().results.filter(r => r.level==='deso' && r.city===window.VagvisApp.getResult().metrics.measures.scope.city).map(r => [r.id, f.format(window.VagvisHouseholds.v7Round(r.scenarioCentral.direct))]); }"""):
            vvton[rid] = t
    for rid, t in v7ton.items():
        if norm(vvton.get(rid)) != norm(t):
            avvik.append((rid, t, vvton.get(rid)))
    print("Paket i hela staden: jämförda DeSO", len(v7ton), "· avvikelser mot v7:", len(avvik), avvik[:4])
    for kk in STADER:
        print(f"  {STADER[kk]}: v7 {v7osak[kk]} · Vägvis {vvosak[kk]} ·", "lika" if norm(v7osak[kk]) == norm(vvosak[kk]) else "OLIKA")
    oforandrad = pg.evaluate("(bas) => { const R = window.VagvisApp.getResult(); return bas.every(([id, v]) => R.results.find(r => r.level==='deso' && r.id===id).central.direct === v); }", bas)
    print("Basfallet oförändrat med åtgärder:", oforandrad)
    # DeSO med nya bostäder
    pg.click("#city button[data-city='1280']"); pg.wait_for_timeout(400)
    pg.select_option("#m-package", "ivl"); pg.wait_for_timeout(400)
    pg.select_option("#m-scope", "deso"); pg.wait_for_timeout(400)
    pg.select_option("#m-area", DESO); pg.wait_for_timeout(400)
    pg.fill("#m-nya", str(NYA)); pg.dispatch_event("#m-nya", "input"); pg.wait_for_timeout(600)
    vvdt = pg.evaluate("() => { const d=[...document.querySelectorAll('#m-summary .m-grid div')].find(x => /Direkt CO₂ per år/.test(x.querySelector('dt').textContent)); return d.querySelector('.m-chg').textContent; }")
    print(f"IVL-paket + {NYA} bostäder i {DESO}: v7 {v7dt} · Vägvis {vvdt} ·", "lika" if norm(v7dt) == norm(vvdt) else "OLIKA")
    pg.screenshot(path=str(UT / "vagvis_atgarder_deso.png"))
    # Referenskontrollen
    pg.click("[data-view=control]")
    pg.wait_for_function("() => document.querySelectorAll('#kk-rows tr').length >= 32", timeout=120000)
    vvkk = {r[0]: r[1:] for r in pg.evaluate("() => [...document.querySelectorAll('#kk-rows tr')].map(tr => { const td = tr.querySelectorAll('td'); return [td[0].textContent, td[3].textContent, td[4].textContent, td[5].querySelector('.status').textContent]; })")}
    vvnyckel = pg.evaluate("() => [...document.querySelectorAll('#view .coverage .stat b')].map(x => x.textContent)")
    kkavv = [(k, v, vvkk.get(k)) for k, v in v7kk.items() if [norm(x) for x in v] != [norm(x) for x in (vvkk.get(k) or [])]]
    print("Referenskontroll: kontrollfall", len(v7kk), "· avvikelser mot v7:", len(kkavv), kkavv[:3])
    print("Nyckeltal v7:", v7nyckel, "· Vägvis:", vvnyckel, "·", "lika" if [norm(x) for x in v7nyckel] == [norm(x) for x in vvnyckel] else "OLIKA")
    pg.screenshot(path=str(UT / "vagvis_kontroll.png"))
    assert not avvik and not kkavv and oforandrad
    assert all(norm(v7osak[k]) == norm(vvosak[k]) for k in STADER) and norm(v7dt) == norm(vvdt)
print("FEL:", fel or "inga")
