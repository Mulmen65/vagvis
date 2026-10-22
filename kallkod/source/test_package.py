"""Package integration checks; no external network or map tile requests."""
from pathlib import Path
from importlib.util import module_from_spec, spec_from_file_location
from html.parser import HTMLParser
from queue import Queue
from threading import Thread
from urllib.request import urlopen
import hashlib
import json

ROOT = Path(__file__).resolve().parent.parent
# Bilmodell v7 ligger bredvid source/ i ett komplett paket och i app/Bilmodell_v7 i GitHub-arkivet (kallkod/).
V7 = ROOT / "Bilmodell_v7" if (ROOT / "Bilmodell_v7" / "index.html").exists() else ROOT.parent / "app" / "Bilmodell_v7"
html = (ROOT / "Vagvis_2.0.html").read_text()


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.assets = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script" and "src" in attrs:
            self.assets.append(attrs["src"])
        if tag == "link" and attrs.get("rel") == "stylesheet":
            self.assets.append(attrs.get("href"))


parser = Assets()
parser.feed(html)
assert parser.assets == [], parser.assets
assert html == (ROOT / "Netlify/index.html").read_text()
print("OK both calculation engines, geography, Leaflet and styles are inline")
for name in ["Bilmodell_v7/index.html", "Trafikdata_till_Malmo.html",
             "Trafikdata_till_Malmo.txt", "Trafikimport_schema.json",
             "Metod_och_anvandning.html", "FIKTIV_trafikimport.geojson"]:
    src = V7 / name.split("/", 1)[1] if name.startswith("Bilmodell_v7/") else ROOT / name
    assert src.read_bytes() == (ROOT / "Netlify" / name).read_bytes()
print("OK Netlify bundle includes the source app, data request and documentation")
for name, expected in json.loads((ROOT / "SHA256.json").read_text()).items():
    assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected, name
print("OK SHA256 receipts match the current code, data and HTML")
assert 'Referrer-Policy = "strict-origin-when-cross-origin"' in (ROOT / "Netlify/netlify.toml").read_text()
assert "tile.openstreetmap.org/{z}/{x}/{y}.png" in html
assert "OpenStreetMap</a> contributors" in html
print("OK OSM attribution and hosted referrer policy are present")

spec = spec_from_file_location("vagvis_local_server", ROOT / "starta_lokalt.py")
mod = module_from_spec(spec)
spec.loader.exec_module(mod)
opened, servers = Queue(), []
original = mod.ThreadingHTTPServer


class TrackingServer(original):
    def __init__(self, address, handler):
        assert address == ("127.0.0.1", 0)
        super().__init__(address, handler)
        servers.append(self)


mod.ThreadingHTTPServer = TrackingServer
mod.webbrowser.open = lambda url: opened.put(url)
thread = Thread(target=mod.main, daemon=True)
thread.start()
url = opened.get(timeout=5)
try:
    with urlopen(url, timeout=5) as response:
        assert response.read() == (ROOT / "Vagvis_2.0.html").read_bytes()
    print("OK local launcher serves the complete app on loopback and a free port")
    # I GitHub-arkivet ligger Bilmodell v7 i app/, så den lokala startfilen visar bara Vägvis där.
    items = ["Trafikdata_till_Malmo.html"] + (["Bilmodell_v7/index.html", "Bilmodell_v7/lib/leaflet/leaflet.js"] if (ROOT / "Bilmodell_v7").exists() else [])
    for item in items:
        with urlopen(url.rsplit("/", 1)[0] + "/" + item, timeout=5) as response:
            assert response.read() == (ROOT / item).read_bytes()
    print("OK local server delivers the detailed v7 app and data request")
finally:
    servers[0].shutdown()
    thread.join(timeout=5)
assert not thread.is_alive()
print("6 package checks passed. No graphical browser or external tiles tested.")
