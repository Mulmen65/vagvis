"""Kompletterande webbläsartest 2.0.2: områdespanel för 1280C1050 och väglänkslagret.
Körs: python source/test_webblasare_omrade.py Netlify <mapp för skärmbilder>"""
import sys, threading, http.server, functools, time
from pathlib import Path
from playwright.sync_api import sync_playwright
W = Path(sys.argv[1]); UT = Path(sys.argv[2]); UT.mkdir(exist_ok=True)
class T(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8784), functools.partial(T, directory=str(W)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
fel = []
with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={"width": 1500, "height": 1100})
    pg.on("pageerror", lambda e: fel.append("pageerror " + str(e)))
    pg.on("console", lambda m: fel.append("console " + m.text) if m.type == "error" and "ERR_FAILED" not in m.text and "tile" not in m.text else None)
    pg.route("**/tile.openstreetmap.org/**", lambda r: r.abort())
    pg.goto("http://127.0.0.1:8784/index.html"); pg.wait_for_load_state("load"); pg.wait_for_timeout(1500)
    pg.click("[data-view=map]"); pg.wait_for_timeout(2000)
    print("Valbara områden:", pg.evaluate("() => document.querySelectorAll('[data-select-area]').length"))
    ok = pg.evaluate("""() => { const el=document.querySelector('[data-select-area="deso|1280|1280C1050"]'); if(!el) return false; el.dispatchEvent(new MouseEvent('click',{bubbles:true})); return true; }""")
    pg.wait_for_timeout(1000)
    print("1280C1050:", ok, pg.evaluate("() => (document.getElementById('area-detail')||{}).innerText?.replace(/\\s+/g,' ').slice(0,500)"))
    pg.screenshot(path=str(UT / "7_vald_1280C1050.png"))
    t0 = time.time(); pg.check("#map-roads"); pg.wait_for_timeout(500)
    pg.wait_for_function("() => true"); print("Väglänkslager: %.1f s" % (time.time() - t0), pg.evaluate("() => document.querySelectorAll('.leaflet-overlay-pane path, .leaflet-overlay-pane canvas').length"))
    pg.wait_for_timeout(1500); pg.screenshot(path=str(UT / "8_vaglankar.png"))
print("FEL:", fel or "inga")
