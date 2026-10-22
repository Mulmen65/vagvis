"""Bygger Vägvis-sidorna som HTML-text för Streamlit (används av streamlit_app.py).

Streamlit visar HTML-filer i sin statiska mapp som ren text. Därför byggs varje sida om till en
enda HTML-text: länkar mellan sidorna pekar på Streamlit-sidorna, och Bilmodell v7:s skript,
stilmallar, typsnitt och bilder bäddas in i sidan. Filerna i mappen app ändras inte.

Sidorna sparas i minnet, men bara så länge filerna i mappen app är oförändrade. Byter du ut till
exempel app/Vagvis.html på GitHub visar appen den nya filen direkt, utan omstart.
"""
from __future__ import annotations

import base64
import mimetypes
import re
from functools import lru_cache
from pathlib import Path

APP = Path(__file__).resolve().parent / "app"

# Länkar i Vägvis-filerna som pekar på andra filer i paketet -> Streamlit-sidor.
LINKS = {
    'href="Bilmodell_v7/index.html#referenskontroll"': 'href="/bilmodell_v7"',
    'href="Bilmodell_v7/index.html"': 'href="/bilmodell_v7"',
    'href="Trafikdata_till_Malmo.html"': 'href="/trafikdata"',
    'href="Metod_och_anvandning.html"': 'href="/metod"',
}


def _v7() -> Path:
    return APP / "Bilmodell_v7"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _data_uri(path: Path, mime: str | None = None) -> str:
    mime = mime or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return "data:" + mime + ";base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def _relink(html: str) -> str:
    for old, new in LINKS.items():
        html = html.replace(old, new)
    return html


def _stamp(*paths: Path) -> tuple:
    """Ändringstid och storlek för filerna. Ändras en fil byggs sidan om."""
    files = []
    for p in paths:
        files.extend(sorted(x for x in p.rglob("*") if x.is_file()) if p.is_dir() else [p])
    return tuple((str(f), f.stat().st_mtime_ns, f.stat().st_size) for f in files if f.exists())


def markup_only(html: str) -> str:
    """HTML utan innehållet i script- och style-taggar (för kontroll av lokala länkar)."""
    return re.sub(r"<(script|style)>.*?</\1>", "", html, flags=re.S)


def _inline_script(js: str) -> str:
    return "<script>" + js.replace("</script", "<\\/script") + "</script>"


def vagvis_html() -> str:
    return _vagvis(APP, _stamp(APP / "Vagvis.html"))


def metod_html() -> str:
    return _metod(APP, _stamp(APP / "Metod_och_anvandning.html"))


def trafikdata_html() -> str:
    return _trafikdata(APP, _stamp(APP / "Trafikdata_till_Malmo.html", APP / "Trafikdata_till_Malmo.txt"))


def bilmodell_html() -> str:
    """Bilmodell v7 som en enda HTML-text: skript, stilar, typsnitt och bilder inbäddade."""
    return _bilmodell(APP, _stamp(_v7()))


@lru_cache(maxsize=4)
def _vagvis(app: Path, stamp: tuple) -> str:
    return _relink(_read(app / "Vagvis.html"))


@lru_cache(maxsize=4)
def _metod(app: Path, stamp: tuple) -> str:
    return _relink(_read(app / "Metod_och_anvandning.html"))


@lru_cache(maxsize=4)
def _trafikdata(app: Path, stamp: tuple) -> str:
    html = _read(app / "Trafikdata_till_Malmo.html")
    uri = _data_uri(app / "Trafikdata_till_Malmo.txt", "text/plain;charset=utf-8")
    return html.replace('href="Trafikdata_till_Malmo.txt"', 'href="' + uri + '" download="Trafikdata_till_Malmo.txt"')


@lru_cache(maxsize=4)
def _bilmodell(app: Path, stamp: tuple) -> str:
    v7 = app / "Bilmodell_v7"
    html = _read(v7 / "index.html")

    def css(path: Path) -> str:
        text = _read(path)
        # url(...) till lokala filer (typsnitt, Leaflets bilder) blir data-URI:er
        def repl(m: re.Match) -> str:
            ref = m.group(2)
            if ref.startswith(("data:", "http:", "https:", "#")):
                return m.group(0)
            return "url(" + _data_uri((path.parent / ref).resolve()) + ")"
        return re.sub(r"url\((['\"]?)([^'\")]+)\1\)", repl, text)

    def link(m: re.Match) -> str:
        return "<style>" + css(v7 / m.group(1)) + "</style>"

    def script(m: re.Match) -> str:
        return _inline_script(_read(v7 / m.group(1)))

    html = re.sub(r'<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>', link, html)
    html = re.sub(r'<link[^>]+href="([^"]+\.css)"[^>]+rel="stylesheet"[^>]*>', link, html)
    html = re.sub(r'<script src="([^"]+)"></script>', script, html)
    csv = v7 / "data" / "deso_resultat.csv"
    if csv.exists():
        html = html.replace('href="data/deso_resultat.csv"', 'href="' + _data_uri(csv, "text/csv;charset=utf-8") + '"')
    markup = markup_only(html)
    leftovers = re.findall(r'(?:src|href)="(?!https?:|data:|#|mailto:|/)([^"]+)"', markup)
    if leftovers:  # en ny fil i v7 som inte bäddats in syns direkt i loggen
        print("Bilmodell v7: lokala referenser som inte bäddats in:", leftovers)
    return html


def version() -> str:
    """Vägvis-versionen enligt app/Vagvis.html, till exempel 2.0.5 (tom om den inte hittas)."""
    m = re.search(r"Vägvis (\d+\.\d+\.\d+) · ton per kalenderår", vagvis_html())
    return m.group(1) if m else ""
