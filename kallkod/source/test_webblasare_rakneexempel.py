"""Webbläsartest för 2.0.7: CO₂ per hektar i kartan och fliken Så räknas resultatet, modell A och B.
   Körs: python source/test_webblasare_rakneexempel.py Netlify <mapp för skärmbilder>"""
import sys, re, csv, io, threading, http.server, functools
from pathlib import Path
from playwright.sync_api import sync_playwright
W = Path(sys.argv[1]); UT = Path(sys.argv[2]).resolve(); UT.mkdir(exist_ok=True)
class T(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8782), functools.partial(T, directory=str(W)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
fel, problem = [], []
def lyssna(pg):
    pg.on("pageerror", lambda e: fel.append("pageerror " + str(e)))
    pg.on("console", lambda m: fel.append("console " + m.text) if m.type == "error" and "tile" not in m.text and "ERR_" not in m.text else None)
    pg.route("**/tile.openstreetmap.org/**", lambda r: r.abort())
def krav(villkor, text):
    print(("OK   " if villkor else "FEL  ") + text)
    if not villkor: problem.append(text)
ren = lambda t: re.sub(r"\s+", " ", t)
tal = lambda s: float(s.replace("−", "-").replace("\xa0", "").replace(" ", "").replace(",", "."))
klar = "() => !document.querySelector('#run').disabled && document.getElementById('dirty-banner').hidden && window.VagvisApp.getResult()"
fyllning = "() => { const p=[...document.querySelectorAll('#map-surface path.leaflet-interactive')]; const c=new Set(); p.forEach(x=>c.add(x.getAttribute('fill'))); return c.size; }"
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page(viewport={"width": 1440, "height": 1000}, accept_downloads=True); lyssna(pg)
    pg.goto("http://127.0.0.1:8782/index.html"); pg.wait_for_function("() => window.VagvisApp && window.VagvisApp.getResult()", timeout=60000)
    krav(pg.evaluate("() => window.VagvisApp.usedStartResult"), "A: förberäknat startresultat används")
    nav = [ren(x) for x in pg.eval_on_selector_all(".nav:not([hidden])", "e => e.map(x => x.innerText)")]
    print("Meny A:", nav); krav(any("Så räknas resultatet" in x for x in nav), "Menyn har Så räknas resultatet")
    # ---- A: karta, total och per hektar ----
    pg.click("[data-view=map]"); pg.wait_for_selector("#map-surface path", timeout=30000); pg.wait_for_timeout(1200)
    pg.click("[data-select-area='deso|1280|1280C1450']"); pg.wait_for_timeout(500)
    panel = ren(pg.inner_text("#area-detail")); print("A-panel 1280C1450:", panel[:420])
    krav("ton CO₂e/år · totalt" in panel and "ton CO₂e/ha · per hektar landyta" in panel and "Landyta" in panel, "A-panelen visar total och per hektar")
    big = pg.eval_on_selector_all("#area-detail .duo .big", "e => e.map(x => x.innerText)"); tot, ha = tal(big[0]), tal(big[1])
    krav(abs(tot / ha - 227.8) < 2.5, "A: total ÷ per hektar ≈ landytan 227,8 ha (%.0f ÷ %.1f = %.1f)" % (tot, ha, tot / ha))
    f0 = pg.evaluate(fyllning); pg.click("[data-ameasure=ha]"); pg.wait_for_timeout(1200); f1 = pg.evaluate(fyllning)
    print("Kortets text:", ren(pg.inner_text("#view .card .card-sub"))[:80], "· färger totalt/per ha:", f0, f1)
    krav("Lägre utsläpp per hektar landyta" in pg.inner_text(".map-key"), "A: förklaringen följer måttet per hektar")
    forsta = ren(pg.evaluate("() => document.querySelector('#area-table tr').innerText")); print("Högst per hektar:", forsta)
    hdr = pg.eval_on_selector_all("#view table thead th", "e => e.map(x => x.innerText)"); krav("Ton/ha" in hdr and "Landyta, ha" in hdr, "A-tabellen har Ton/ha och Landyta")
    tip = pg.evaluate("() => { const l=[...document.querySelectorAll('#map-surface path.leaflet-interactive')][5]; l.dispatchEvent(new MouseEvent('mouseover',{bubbles:true})); return document.querySelector('.leaflet-tooltip')?.innerText || ''; }")
    print("Tooltip:", ren(tip)); krav("ton/ha" in tip, "A: tooltip visar ton per hektar")
    pg.screenshot(path=str(UT / "1_A_karta_per_hektar.png"))
    with pg.expect_download() as dl: pg.click("#area-csv")
    rows = list(csv.reader(io.StringIO(Path(dl.value.path()).read_text(encoding="utf-8-sig")), delimiter=";"))
    krav("bas_tCO2e_per_ha_land" in rows[0] and "landyta_ha" in rows[0], "A: CSV har landyta och ton per hektar")
    # ---- A: Så räknas resultatet ----
    pg.click("[data-calc-key='deso|1280|1280C1450']"); pg.wait_for_selector(".calc-step"); pg.wait_for_timeout(300)
    rubrik = ren(pg.inner_text("#page-title")); res = ren(pg.inner_text(".calc-result")); print("Rubrik:", rubrik, "· resultat:", res)
    krav("Stämmer med kartan" in res, "A: räkneexemplets summa stämmer med kartan")
    krav(str(int(round(tot))) in res.replace("\xa0", "").replace(" ", ""), "A: summan är samma tal som i kartpanelen")
    steg = pg.eval_on_selector_all(".calc-step h2", "e => e.map(x => x.innerText)"); print("Steg:", steg)
    krav(len(steg) == 5 and "Kalibrering" in steg[2], "A: fem steg, med kalibrering för Malmö")
    tabeller = pg.eval_on_selector_all(".card > h2", "e => e.map(x => x.innerText)"); print("Kort:", tabeller)
    krav(all(any(k in t for t in tabeller) for k in ["Schablonerna", "Kontroller mot oberoende data", "Så kan resultatet bli säkrare", "Referenser"]), "A: schabloner, kontroller, förbättringar och referenser finns")
    refs = pg.eval_on_selector_all(".calc-refs li", "e => e.length"); links = pg.eval_on_selector_all(".calc-refs a[href^='http']", "e => e.length"); print("Referenser:", refs, "med länk:", links)
    krav(refs >= 12 and links >= 10, "A: referenslistan har källor med länkar")
    status = pg.eval_on_selector_all(".calc-wrap .status", "e => e.map(x => x.innerText)"); print("Statusmärken:", {s: status.count(s) for s in set(status)})
    kontroll = ren(pg.inner_text(".calc-wrap >> nth=1")); krav("Malmö: vägnätets direktutsläpp före kalibrering" in kontroll and "−8 %" in kontroll, "A: kontrollen mot Malmös redovisning visar −8 %")
    krav("Helsingborg: direktutsläpp utan kalibrering" in kontroll, "A: kontrollen för Helsingborg finns")
    pg.click(".cite >> nth=0"); pg.wait_for_timeout(700)
    pg.screenshot(path=str(UT / "2_A_rakneexempel.png"), full_page=True)
    pg.click("[data-city='1283']"); pg.wait_for_timeout(500); krav(pg.eval_on_selector("#calc-area", "e => e.value") == "city|1283", "Byte av kommun visar hela kommunen")
    s3 = ren(pg.inner_text(".calc-step >> nth=2")); krav("ingen kommunreferens" in s3, "A Helsingborg: inget kalibreringssteg (faktor 1)")
    krav("Stämmer med kartan" in pg.inner_text(".calc-result"), "A Helsingborg: summan stämmer med kartan")
    pg.click("[data-calc-map='city|1283']"); pg.wait_for_selector("#map-surface path"); krav(pg.evaluate("() => document.querySelector('[data-city].active').dataset.city") == "1283", "Visa i kartan går till kartan")
    # ---- B ----
    pg.click("[data-model=household]"); pg.wait_for_function("() => window.VagvisApp.getModel()==='household' && " + klar[6:], timeout=120000)
    pg.click("[data-city='1280']"); pg.click("[data-view=map]"); pg.wait_for_selector("#map-surface path", timeout=30000); pg.wait_for_timeout(800)
    pg.select_option("#h-measure", "per_ha"); pg.wait_for_timeout(1200)
    key = ren(pg.inner_text(".map-key")); print("B förklaring:", key[:200]); krav("ton CO₂ per hektar" in key, "B: måttet per hektar finns i kartan")
    pg.click("[data-select-area='deso|1280|1280C1450']"); pg.wait_for_timeout(500)
    bp = ren(pg.inner_text("#area-detail")); print("B-panel:", bp[:420]); krav("CO₂ per hektar" in bp and "ton CO₂/ha · per hektar" in bp, "B-panelen visar total och per hektar")
    pg.screenshot(path=str(UT / "3_B_karta_per_hektar.png"))
    pg.click("[data-calc-key='deso|1280|1280C1450']"); pg.wait_for_selector(".calc-step"); pg.wait_for_timeout(300)
    steg = pg.eval_on_selector_all(".calc-step h2", "e => e.map(x => x.innerText)"); print("B steg:", steg)
    krav(len(steg) == 7 and "Bilmodell v7" in steg[5], "B: sju steg till livscykel")
    krav("Stämmer med kartan" in pg.inner_text(".calc-result"), "B: räkneexemplet stämmer med kartan")
    ex = ren(pg.inner_text(".calc-step >> nth=2")); print("B steg 3:", ex[-160:]); krav("km per bil och år" in ex, "B: körsträckan räknas med lägesindexet")
    pg.screenshot(path=str(UT / "4_B_rakneexempel.png"), full_page=True)
    pg.select_option("#calc-area", pg.evaluate("() => [...document.querySelectorAll('#calc-area option')].find(o=>o.value.startsWith('district|')).value")); pg.wait_for_timeout(500)
    krav("Stämmer med kartan" in pg.inner_text(".calc-result") and pg.query_selector(".calc-details summary") is not None, "B stadsdelsområde: stämmer och visar alla DeSO")
    pg.click("[data-city='2180']"); pg.wait_for_timeout(500); krav("Stämmer med kartan" in pg.inner_text(".calc-result"), "B Gävle: räkneexemplet stämmer")
    # ---- Mobil ----
    m = b.new_page(viewport={"width": 390, "height": 844}); lyssna(m); m.goto("http://127.0.0.1:8782/index.html"); m.wait_for_function("() => window.VagvisApp && window.VagvisApp.getResult()", timeout=60000)
    m.click("[data-view=calc]"); m.wait_for_selector(".calc-step"); m.wait_for_timeout(500)
    bredd = m.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]"); krav(bredd[0] <= bredd[1], "Mobil: ingen sidledes rullning i Så räknas resultatet " + str(bredd))
    m.screenshot(path=str(UT / "5_mobil_rakneexempel.png"))
print("FEL:", fel or "inga")
krav(not fel, "Inga fel i webbläsarens konsol")
print("Alla kontroller godkända." if not problem else "MISSLYCKADE: " + "; ".join(problem))
sys.exit(1 if problem else 0)
