"""Webbläsartest av Områdesscenario i Vägvis 2.0.5 (modell A och B): förval för Jägersro, panelens värden mot
   beräkningen i A och B, kartknappen, Gävle, sparat projekt, offlinekopia och mobil.
   Körs: python source/test_webblasare_omradesscenario.py Netlify <mapp för skärmbilder>"""
import sys, re, time, threading, http.server, functools, json
from pathlib import Path
from playwright.sync_api import sync_playwright
W = Path(sys.argv[1]); UT = Path(sys.argv[2]); UT.mkdir(exist_ok=True)
class T(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8797), functools.partial(T, directory=str(W)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
fel = []
def lyssna(pg):
    pg.on("pageerror", lambda e: fel.append("pageerror " + str(e)))
    pg.on("console", lambda m: fel.append("console " + m.text) if m.type == "error" and "tile" not in m.text and "ERR_" not in m.text else None)
    pg.route("**/tile.openstreetmap.org/**", lambda r: r.abort())
txt = lambda pg, sel: pg.evaluate("s => (document.querySelector(s)||{}).innerText||''", sel)
with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 1000}, accept_downloads=True); lyssna(pg)
    pg.goto("http://127.0.0.1:8797/index.html"); pg.wait_for_function("() => window.VagvisApp && window.VagvisApp.getResult()", timeout=60000)
    print("Start: A-resultat från startresultatet:", pg.evaluate("() => window.VagvisApp.usedStartResult"))
    pg.click("[data-view=parameters]"); pg.wait_for_selector("#as-preset")
    print("Flikar:", pg.evaluate("() => [...document.querySelectorAll('[data-ptab]')].map(b=>b.innerText+(b.classList.contains('active')?' *':''))"))
    print("Förvald DeSO:", pg.eval_on_selector("#as-deso", "e => e.value"), "· aktiv:", pg.is_checked("#as-active"), "· dirty:", pg.is_visible("#dirty-banner"))
    pg.screenshot(path=str(UT / "1_a_omrade_utkast.png"), full_page=True)
    # Förval: strategin som åtgärder
    pg.select_option("#as-preset", "jagersro_strategi"); pg.wait_for_timeout(800)
    print("Efter förval: aktiv", pg.is_checked("#as-active"), "· dirty", pg.is_visible("#dirty-banner"))
    print("B live:", re.sub(r"\s+", " ", txt(pg, "#as-b-live"))[:700])
    print("A live:", re.sub(r"\s+", " ", txt(pg, "#as-a-live"))[:500])
    print("Jämförelse:", re.sub(r"\s+", " ", txt(pg, "#as-cmp-live"))[:900])
    cfgA = pg.evaluate("() => window.VagvisApp.getConfig()")
    print("A cfg areaTraffic:", cfgA.get("areaTraffic"))
    pg.screenshot(path=str(UT / "2_a_jagersro_strategi.png"), full_page=True)
    # Ändra antal bostäder i textfältet: fokus behålls och siffrorna uppdateras
    pg.click("#as-nya"); pg.fill("#as-nya", "3000"); pg.wait_for_timeout(500)
    print("Fokus kvar i fältet:", pg.evaluate("() => document.activeElement.id"), "· förval:", pg.eval_on_selector("#as-preset", "e => e.value"))
    pg.fill("#as-nya", "4000"); pg.wait_for_timeout(300)
    # Åtgärd av/på
    before = txt(pg, "#as-b-live")
    pg.click("[data-astoggle=kollektivtrafik]"); pg.wait_for_timeout(600)
    print("Åtgärd av ändrar resultatet:", before != txt(pg, "#as-b-live"))
    pg.click("[data-astoggle=kollektivtrafik]"); pg.wait_for_timeout(600)
    # Beräkna A
    t0 = time.time(); pg.click("#run")
    pg.wait_for_function("() => !document.querySelector('#run').disabled && document.getElementById('dirty-banner').hidden", timeout=400000)
    r = pg.evaluate("""() => { const R=window.VagvisApp.getResult(), x=R.results.find(z=>z.key==='deso|1280|1280C1450'); return [x.central.total, x.scenarioCentral.total, x.difference.p025, x.difference.p975, R.warnings.filter(w=>/Områdes|boende/i.test(w))]; }""")
    print("A beräknad på %.0f s; DeSO bas %.1f t, scenario %.1f t, skillnad 95 %%: %.1f till %.1f" % (time.time()-t0, r[0], r[1], r[2], r[3]))
    pg.click("[data-view=parameters]"); pg.wait_for_selector("#as-a-live")
    print("A live efter beräkning:", re.sub(r"\s+", " ", txt(pg, "#as-a-live"))[:400])
    # Byt till B: beräknas direkt med områdesscenariot
    pg.click("[data-model=household]")
    pg.wait_for_function("() => window.VagvisApp.getModel()==='household' && window.VagvisApp.getResult() && !document.querySelector('#run').disabled", timeout=120000)
    rb = pg.evaluate("""() => { const R=window.VagvisApp.getResult(), x=R.results.find(z=>z.key==='deso|1280|1280C1450'); return [x.central.direct, x.scenarioCentral.direct, x.scenarioCentral.total, R.metrics.areaScenario]; }""")
    print("B: DeSO direkt bas %.0f, scenario %.0f t, livscykel scenario %.0f; metrics %s" % (rb[0], rb[1], rb[2], rb[3]))
    pg.click("[data-view=parameters]"); pg.wait_for_selector("#as-b-live")
    pane = pg.evaluate("""() => { const s=document.querySelector('#as-b-live').innerText; return s.slice(0,240); }""")
    print("B-panel:", re.sub(r"\s+", " ", pane))
    pg.screenshot(path=str(UT / "3_b_jagersro.png"), full_page=True)
    # Kartan: knapp till områdesscenariot
    pg.click("[data-view=map]"); pg.wait_for_timeout(1500)
    pg.evaluate("() => { const b=[...document.querySelectorAll('[data-select-area]')].find(x=>x.dataset.selectArea==='deso|1280|1280C1040'); if(b) b.click(); }")
    pg.wait_for_timeout(500)
    print("Kartpanelens knapp:", pg.evaluate("() => !!document.querySelector('#area-detail [data-as-open]')"))
    # Spara projekt och offlinekopia: områdesscenariot följer med
    with pg.expect_download() as dl: pg.click("#save-project-side")
    saved = json.loads(Path(dl.value.path()).read_text()); print("Sparat projekt har områdesscenario:", (saved.get("config") or {}).get("areaScenario", {}).get("deso"))
    pg.click("#export"); 
    with pg.expect_download() as dl: pg.click("#download-offline")
    off = (UT / "offline.html").resolve(); dl.value.save_as(off); pg.keyboard.press("Escape")
    # Gävle i B: egen DeSO, utgångsläge som ett annat område
    pg.click("#city button[data-city='2180']"); pg.click("[data-view=parameters]"); pg.wait_for_selector("#as-preset")
    print("Gävle: notis om aktivt scenario i Malmö:", "gäller nu DeSO" in txt(pg, "#view"))
    pg.select_option("#as-sd", index=1); pg.wait_for_timeout(500)
    pg.fill("#as-nya", "500"); pg.wait_for_timeout(300); pg.select_option("#as-mode", "analog"); pg.wait_for_timeout(600)
    print("Gävle A-kort:", re.sub(r"\s+", " ", pg.evaluate("() => [...document.querySelectorAll('.card h2')].find(h=>/Modell A/.test(h.innerText)).parentElement.innerText"))[:160])
    print("Gävle B live:", re.sub(r"\s+", " ", txt(pg, "#as-b-live"))[:300])
    pg.screenshot(path=str(UT / "4_b_gavle.png"), full_page=True)
    # Rensa
    pg.click("[data-view=parameters]"); pg.wait_for_selector("#as-clear"); pg.click("#as-clear"); pg.wait_for_timeout(400)
    print("Efter rensa: aktiv", pg.is_checked("#as-active"), "· cfg har områdesscenario:", "areaScenario" in pg.evaluate("() => window.VagvisApp.getConfig()"))
    # Mobil
    m = b.new_page(viewport={"width": 390, "height": 844}); lyssna(m)
    m.goto("http://127.0.0.1:8797/index.html"); m.wait_for_function("() => window.VagvisApp && window.VagvisApp.getResult()", timeout=60000)
    m.click("[data-view=parameters]"); m.wait_for_selector("#as-preset"); m.select_option("#as-preset", "jagersro_mal"); m.wait_for_timeout(800)
    print("Mobil bredd:", m.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]"))
    m.screenshot(path=str(UT / "5_mobil.png"), full_page=True)
    # Offlinekopian
    o = b.new_page(viewport={"width": 1300, "height": 900}); lyssna(o)
    o.goto("http://127.0.0.1:8797/../" if False else off.as_uri()); o.wait_for_timeout(3000)
    print("Offlinekopia: modell", o.evaluate("() => window.VagvisApp.getModel()"), "· områdesscenario", (o.evaluate("() => window.VagvisApp.getConfig().areaScenario") or {}).get("deso"))
print("FEL:", fel or "inga")
