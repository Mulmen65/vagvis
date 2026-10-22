"""Riktig webbläsare (Chromium) mot Vägvis 2.0.2 med simulerade Overpass-svar.
Körs: python source/test_webblasare.py Netlify <mapp för skärmbilder>"""
import sys, threading, http.server, functools, json, re, time, urllib.parse
from pathlib import Path
from playwright.sync_api import sync_playwright
W = Path(sys.argv[1]); UT = Path(sys.argv[2]); UT.mkdir(exist_ok=True)
class T(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8782), functools.partial(T, directory=str(W)))
threading.Thread(target=srv.serve_forever, daemon=True).start()

def vagar(bbox, klass, start):
    s, w, n, e = bbox
    el = []
    k = start
    for i in range(6):
        for j in range(4):
            lon = w + (e - w) * (i + .5) / 6; lat = s + (n - s) * (j + .5) / 4
            hw = klass if klass == 'service' else ['primary', 'residential', 'tertiary', 'motorway'][(i + j) % 4]
            el.append({"type": "way", "id": k, "tags": {"highway": hw, **({"oneway": "yes"} if hw == 'motorway' else {})},
                       "geometry": [{"lat": lat, "lon": lon}, {"lat": lat + .002, "lon": lon + .003}]})
            k += 1
    return el

anrop = []
def overpass_ok(route):
    req = route.request
    q = urllib.parse.parse_qs(req.post_data or '').get('data', [''])[0] or urllib.parse.unquote(req.url.split('data=')[-1])
    m = re.search(r'\(([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)', q)
    bbox = tuple(map(float, m.groups()))
    klass = 'service' if 'service' in q and 'motorway' not in q else 'main'
    anrop.append((req.url.split('/')[2], klass))
    if len(anrop) == 1:   # första anropet: överbelastad server utan CORS-huvud, som i verkligheten
        return route.abort()
    route.fulfill(status=200, headers={"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
                  body=json.dumps({"elements": vagar(bbox, klass, len(anrop) * 1000)}))

fel = []
with sync_playwright() as pw:
    b = pw.chromium.launch()
    # 0. startprojektet har vägnät: hämtningen behåller det och anropar inte Overpass för vägar
    pg = b.new_page(viewport={"width": 1500, "height": 1100})
    pg.on("pageerror", lambda e: fel.append("pageerror " + str(e)))
    pg.route("**/tile.openstreetmap.org/**", lambda r: r.abort())
    pg.route(re.compile(r"https://overpass[^/]*/api/interpreter.*"), overpass_ok)
    pg.goto("http://127.0.0.1:8782/index.html"); pg.wait_for_timeout(1500)
    print("Start: inbäddat startresultat", pg.evaluate("() => window.VagvisApp.usedStartResult"), "· menyn låst", pg.evaluate("() => document.querySelector('[data-view=data]').disabled"))
    pg.click("[data-view=data]"); pg.wait_for_timeout(500)
    pg.click("#fetch-open")
    pg.wait_for_function("() => /färdig|misslyckades/.test(document.getElementById('message')?.innerText || '')", timeout=240000)
    print("Med inbyggt vägnät:", len(anrop), "Overpass-anrop ·", pg.evaluate("() => (document.getElementById('fetch-log')||{}).textContent"))
    pg.close()

    # projekt utan vägnät, för att pröva själva hämtningen
    tomt = UT / "projekt_utan_vagnat.json"
    p0 = json.loads((W / "startprojekt.json").read_text(encoding="utf-8")) if (W / "startprojekt.json").exists() else json.loads((W.parent / "startprojekt.json").read_text(encoding="utf-8"))
    p0["roads"] = []
    tomt.write_text(json.dumps(p0), encoding="utf-8")
    def oppna_tomt(pg):
        pg.click("[data-view=data]"); pg.wait_for_timeout(400)
        with pg.expect_file_chooser() as fc:
            pg.click("button[data-import=project] >> nth=0")
        fc.value.set_files(str(tomt)); pg.wait_for_timeout(2500)
        pg.click("[data-view=data]"); pg.wait_for_timeout(500)

    # 1. lyckad hämtning (första anropet faller, reservserver tar över)
    pg = b.new_page(viewport={"width": 1500, "height": 1100})
    pg.on("pageerror", lambda e: fel.append("pageerror " + str(e)))
    pg.route("**/tile.openstreetmap.org/**", lambda r: r.abort())
    pg.route(re.compile(r"https://overpass[^/]*/api/interpreter.*"), overpass_ok)
    pg.goto("http://127.0.0.1:8782/index.html"); pg.wait_for_timeout(1200)
    anrop.clear()
    oppna_tomt(pg)
    print("Projekt utan vägnät:", pg.evaluate("() => window.VagvisApp.getProject().roads.length"), "väglänkar")
    print("Direktlänkar:", pg.evaluate("() => [...document.querySelectorAll('#osm-lankar a')].map(a => a.textContent + ' ' + a.href.slice(0, 60))"))
    pg.screenshot(path=str(UT / "1_data_fore.png"), full_page=False)
    t0 = time.time()
    pg.click("#fetch-open")
    pg.wait_for_function("() => /färdig|misslyckades/.test(document.getElementById('message')?.innerText || '')", timeout=240000)
    print("Hämtning: %.0f s, %d anrop, servrar %s" % (time.time() - t0, len(anrop), sorted(set(a[0] for a in anrop))))
    print("Meddelande:", pg.evaluate("() => document.getElementById('message').innerText"))
    print("Logg:", pg.evaluate("() => (document.getElementById('fetch-log')||{}).textContent"))
    print("Väglänkar i kortet:", pg.evaluate("() => [...document.querySelectorAll('.card')].map(c => c.innerText).filter(t => /väglänkar/.test(t)).map(t => t.replace(/\\s+/g, ' ').slice(0, 160))"))
    pg.screenshot(path=str(UT / "2_data_efter.png"), full_page=False)
    knapp = pg.query_selector("button:has-text('Beräkna')")
    if knapp:
        knapp.click()
        pg.wait_for_timeout(20000)
        pg.click("[data-view=overview]"); pg.wait_for_timeout(800)
        print("Översikt:", pg.evaluate("() => document.getElementById('view').innerText.replace(/\\s+/g, ' ').slice(0, 500)"))
        pg.screenshot(path=str(UT / "3_oversikt.png"), full_page=False)
    pg.close()

    # 2. import av en nedladdad OSM-fil (Helsingborg)
    fil = UT / "vagnat_1283.json"
    fil.write_text(json.dumps({"version": 0.6, "elements": vagar((55.98, 12.65, 56.1, 12.8), 'main', 1)}))
    pg = b.new_page(viewport={"width": 1500, "height": 1100})
    pg.on("pageerror", lambda e: fel.append("pageerror " + str(e)))
    pg.route("**/tile.openstreetmap.org/**", lambda r: r.abort())
    pg.goto("http://127.0.0.1:8782/index.html"); pg.wait_for_timeout(1200)
    pg.click("[data-view=data]"); pg.wait_for_timeout(400)
    with pg.expect_file_chooser() as fc:
        pg.click("button[data-import=roads]")
    fc.value.set_files(str(fil)); pg.wait_for_timeout(1500)
    print("Import, meddelande:", pg.evaluate("() => document.getElementById('message').innerText"))
    print("Import, länkar per kommun:", pg.evaluate("() => { const r=window.VagvisApp.getProject().roads; return {'1280': r.filter(x=>x.city==='1280').length, '1283': r.filter(x=>x.city==='1283').length}; }"), "· läge", pg.evaluate("() => window.VagvisApp.getConfig().mode"))
    print("Import, väglänkar:", pg.evaluate("() => [...document.querySelectorAll('.card')].map(c => c.innerText).filter(t => /väglänkar/.test(t)).map(t => t.replace(/\\s+/g, ' ').slice(0, 120))"))
    pg.close()

    # 3. allt blockerat
    pg = b.new_page(viewport={"width": 1500, "height": 1100})
    pg.on("pageerror", lambda e: fel.append("pageerror " + str(e)))
    pg.route("**/tile.openstreetmap.org/**", lambda r: r.abort())
    pg.route(re.compile(r"https://overpass[^/]*/api/interpreter.*"), lambda r: r.abort())
    pg.goto("http://127.0.0.1:8782/index.html"); pg.wait_for_timeout(1200)
    oppna_tomt(pg)
    t0 = time.time(); pg.click("#fetch-open")
    pg.wait_for_function("() => /färdig|misslyckades/.test(document.getElementById('message')?.innerText || '')", timeout=300000)
    print("Blockerat (%.0f s):" % (time.time() - t0), pg.evaluate("() => (document.getElementById('fetch-log')||{}).textContent"))
    pg.screenshot(path=str(UT / "4_blockerat.png"), full_page=False)
print("FEL:", fel or "inga")
