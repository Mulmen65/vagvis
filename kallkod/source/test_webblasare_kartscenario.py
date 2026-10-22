"""Webbläsartest för 2.0.6: Scenariot i korthet och kartans lägen Basfall, Scenario och Förändring i modell B och A.
   Körs: python source/test_webblasare_kartscenario.py Netlify <mapp för skärmbilder>"""
import sys, re, time, threading, http.server, functools
from pathlib import Path
from playwright.sync_api import sync_playwright
W = Path(sys.argv[1]); UT = Path(sys.argv[2]).resolve(); UT.mkdir(exist_ok=True)
class T(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8781), functools.partial(T, directory=str(W)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
fel = []
def lyssna(pg):
    pg.on("pageerror", lambda e: fel.append("pageerror " + str(e)))
    pg.on("console", lambda m: fel.append("console " + m.text) if m.type == "error" and "tile" not in m.text and "ERR_" not in m.text else None)
    pg.route("**/tile.openstreetmap.org/**", lambda r: r.abort())
ren = lambda t: re.sub(r"\s+", " ", t)
klar = "() => !document.querySelector('#run').disabled && document.getElementById('dirty-banner').hidden && window.VagvisApp.getResult()"
fyllning = "() => { const p=[...document.querySelectorAll('#map-surface path.leaflet-interactive')]; const c={}; p.forEach(x=>{const f=x.getAttribute('fill'); c[f]=(c[f]||0)+1;}); return c; }"
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page(viewport={"width": 1440, "height": 1000}, accept_downloads=True); lyssna(pg)
    pg.goto("http://127.0.0.1:8781/index.html"); pg.wait_for_function("() => window.VagvisApp && window.VagvisApp.getResult()", timeout=60000)
    # Modell B: basfallet beräknas när modellen väljs
    pg.click("[data-model=household]"); pg.wait_for_function("() => window.VagvisApp.getModel()==='household' && " + klar[6:], timeout=120000)
    pg.click("[data-view=parameters]"); pg.wait_for_selector("#as-preset"); pg.select_option("#as-preset", "jagersro_mal"); pg.wait_for_timeout(900)
    s = ren(pg.inner_text("#as-sum-live")); print("Sammanfattning (före beräkning):", s[:900])
    print("Status före:", "Inte beräknat än" in s, "· rutor:", "Egna värden, inga åtgärder" in pg.inner_text("#as-b-live"))
    with pg.expect_download() as dl: pg.click("#as-sum-dl")
    txt = Path(dl.value.path()).read_text(encoding="utf-8-sig"); print("Nedladdad sammanfattning:", dl.value.suggested_filename, "· rubriker:", all(k in txt for k in ["FÖRUTSÄTTNINGAR", "RESULTAT, MODELL B", "RESULTAT, MODELL A", "TABELL FÖR DeSO:N"]))
    pg.locator(".as-sum-card").screenshot(path=str(UT / "1_sammanfattning.png"))
    pg.click("#run"); pg.wait_for_function(klar, timeout=120000)
    pg.wait_for_timeout(400); print("Status efter beräkning:", ren(pg.inner_text(".as-sum-foot"))[:160])
    pg.click("[data-as-map]"); pg.wait_for_selector("#map-surface path", timeout=30000); pg.wait_for_timeout(1500)
    print("Kartläge:", pg.evaluate("() => document.querySelector('[data-mapshow].active').dataset.mapshow"), "· mått:", pg.eval_on_selector("#h-measure", "e => e.value"))
    print("Färger i förändringskartan (B):", pg.evaluate(fyllning))
    print("Vald DeSO i panelen:", ren(pg.inner_text("#area-detail"))[:420])
    rad = pg.evaluate("() => [...document.querySelectorAll('#area-table tr')][0].innerText")
    print("Första raden i tabellen (sorterad efter förändring):", ren(rad))
    pg.screenshot(path=str(UT / "2_karta_B_forandring.png"))
    pg.click("[data-mapshow=scenario]"); pg.wait_for_timeout(1200); print("Scenarioläge, rubrik:", pg.inner_text(".card h2"))
    pg.click("[data-mapshow=base]"); pg.wait_for_timeout(1200); print("Basläge, notis:", ren(pg.inner_text("#view .notice.info")) [:120] if pg.query_selector("#view .notice.info") else "")
    # Modell A
    pg.click("[data-model=territorial]"); pg.wait_for_timeout(800)
    t0 = time.time(); pg.click("#run"); pg.wait_for_function(klar, timeout=400000); print("A beräknad på %.0f s" % (time.time() - t0))
    pg.click("[data-view=parameters]"); pg.wait_for_selector("#as-sum-live"); pg.wait_for_timeout(600)
    print("A-sammanfattning:", ren(pg.inner_text("#as-sum-live")).split("Modell A · trafiken på DeSO:ns vägar")[1][:420])
    pg.click("[data-as-map]"); pg.wait_for_selector("#map-surface path", timeout=30000); pg.wait_for_timeout(1500)
    print("Färger i förändringskartan (A):", pg.evaluate(fyllning))
    print("A-panel:", ren(pg.inner_text("#area-detail"))[:330])
    pg.screenshot(path=str(UT / "3_karta_A_forandring.png"))
    m = b.new_page(viewport={"width": 390, "height": 844}); lyssna(m); m.goto("http://127.0.0.1:8781/index.html"); m.wait_for_function("() => window.VagvisApp && window.VagvisApp.getResult()", timeout=60000)
    m.click("[data-view=map]"); m.wait_for_timeout(800); m.click("[data-mapshow=diff]"); m.wait_for_timeout(800)
    print("Mobil bredd:", m.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]"))
    m.screenshot(path=str(UT / "4_mobil_karta.png"))
print("FEL:", fel or "inga")
