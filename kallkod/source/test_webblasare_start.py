"""Riktig webbläsare mot Vägvis 2.0.2: inbyggt startresultat och ny beräkning.
Körs: python source/test_webblasare_start.py Netlify <mapp för skärmbilder>"""
import sys, threading, http.server, functools, time
from pathlib import Path
from playwright.sync_api import sync_playwright
W = Path(sys.argv[1]); UT = Path(sys.argv[2]); UT.mkdir(exist_ok=True)
class T(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8783), functools.partial(T, directory=str(W)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
fel = []
with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={"width": 1500, "height": 1100})
    pg.on("pageerror", lambda e: fel.append("pageerror " + str(e)))
    pg.on("console", lambda m: fel.append("console " + m.text) if m.type == "error" and "ERR_FAILED" not in m.text and "tile" not in m.text else None)
    pg.route("**/tile.openstreetmap.org/**", lambda r: r.abort())
    t0 = time.time()
    pg.goto("http://127.0.0.1:8783/index.html"); pg.wait_for_load_state("load"); pg.wait_for_timeout(1500)
    print("Laddning: %.1f s" % (time.time() - t0))
    print("Status:", pg.evaluate("() => document.getElementById('data-status').textContent"))
    print("Startresultat använt:", pg.evaluate("() => window.VagvisApp.usedStartResult"), "nav låst:", pg.evaluate("() => document.querySelector('[data-view=data]').disabled"))
    tot0 = pg.evaluate("() => window.VagvisApp.getResult().results.filter(r=>r.level==='city').map(r=>[r.key, r.central.ttw, r.central.total, r.base.p025, r.base.p975])")
    print("Inbäddat:", tot0)
    print("Översikt vid start:", pg.evaluate("() => document.getElementById('view').innerText.replace(/\\s+/g,' ').slice(0, 400)"))
    pg.screenshot(path=str(UT / "0_start.png"))
    pg.click("[data-view=data]"); pg.wait_for_timeout(600)
    print("Väglänkar:", pg.evaluate("() => [...document.querySelectorAll('.stat')].map(s => s.innerText.replace(/\\s+/g,' ')).slice(0,4)"))
    pg.screenshot(path=str(UT / "1_data.png"))
    pg.click("[data-view=overview]"); pg.wait_for_timeout(500)
    t0 = time.time()
    pg.click("button:has-text('Beräkna med osäkerhet')")
    pg.wait_for_function("() => document.getElementById('progress-box') && document.getElementById('progress-box').hasAttribute('hidden') && /LIVSCYKEL/.test(document.getElementById('view').innerText) && !/Beräknar/.test(document.getElementById('view').innerText)", timeout=600000, polling=1000)
    pg.wait_for_timeout(1000)
    print("Beräkning: %.0f s" % (time.time() - t0))
    tot1 = pg.evaluate("() => window.VagvisApp.getResult().results.filter(r=>r.level==='city').map(r=>[r.key, r.central.ttw, r.central.total, r.base.p025, r.base.p975])")
    lika = all(x0[0] == x1[0] and all(abs(p - q) <= 1e-9 * abs(q) for p, q in zip(x0[1:], x1[1:])) for x0, x1 in zip(tot0, tot1))
    print("Omräknat i webbläsaren lika med inbäddat (relativ skillnad under 1e-9):", lika, tot1)
    print("Översikt Malmö:", pg.evaluate("() => document.getElementById('view').innerText.replace(/\\s+/g,' ').slice(0, 700)"))
    pg.screenshot(path=str(UT / "2_oversikt_malmo.png"))
    pg.click("[data-view=map]"); pg.wait_for_timeout(2500)
    pg.screenshot(path=str(UT / "3_karta_malmo.png"))
    # välj 1280C1050 via kartans ytor om möjligt
    ok = pg.evaluate("""() => { const el=document.querySelector('[data-select-area="deso|1280|1280C1050"]'); if(el){ el.dispatchEvent(new MouseEvent('click',{bubbles:true})); return true;} return false; }""")
    pg.wait_for_timeout(800)
    print("1280C1050 vald:", ok, pg.evaluate("() => (document.getElementById('area-detail')||{}).innerText?.replace(/\\s+/g,' ').slice(0,300)"))
    pg.screenshot(path=str(UT / "4_karta_vald.png"))
    pg.click("#city button[data-city='1283']"); pg.wait_for_timeout(2500)
    pg.click("[data-view=overview]"); pg.wait_for_timeout(800)
    print("Översikt Helsingborg:", pg.evaluate("() => document.getElementById('view').innerText.replace(/\\s+/g,' ').slice(0, 500)"))
    pg.screenshot(path=str(UT / "5_oversikt_hbg.png"))
    pg.click("[data-view=map]"); pg.wait_for_timeout(2500)
    pg.screenshot(path=str(UT / "6_karta_hbg.png"))
print("FEL:", fel or "inga")
