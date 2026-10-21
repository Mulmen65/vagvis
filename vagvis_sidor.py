"""Bygger Vägvis-sidorna som HTML-text för Streamlit (används av streamlit_app.py).

Streamlit visar HTML-filer i sin statiska mapp som ren text. Därför byggs varje sida om till en
enda HTML-text: länkar mellan sidorna pekar på Streamlit-sidorna, och Bilmodell v7:s skript,
stilmallar, typsnitt och bilder bäddas in i sidan. Filerna i mappen app ändras inte.
"""
from __future__ import annotations

import base64
import mimetypes
import re
from functools import lru_cache
from pathlib import Path

APP = Path(__file__).resolve().parent / "app"
V7 = APP / "Bilmodell_v7"

# Länkar i Vägvis-filerna som pekar på andra filer i paketet -> Streamlit-sidor.
LINKS = {
    'href="Bilmodell_v7/index.html#referenskontroll"': 'href="/bilmodell_v7"',
    'href="Bilmodell_v7/index.html"': 'href="/bilmodell_v7"',
    'href="Trafikdata_till_Malmo.html"': 'href="/trafikdata"',
    'href="Metod_och_anvandning.html"': 'href="/metod"',
}


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _data_uri(path: Path, mime: str | None = None) -> str:
    mime = mime or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return "data:" + mime + ";base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def _relink(html: str) -> str:
    for old, new in LINKS.items():
        html = html.replace(old, new)
    return html


def markup_only(html: str) -> str:
    """HTML utan innehållet i script- och style-taggar (för kontroll av lokala länkar)."""
    return re.sub(r"<(script|style)>.*?</\1>", "", html, flags=re.S)


def _inline_script(js: str) -> str:
    return "<script>" + js.replace("</script", "<\\/script") + "</script>"


@lru_cache(maxsize=None)
def vagvis_html() -> str:
    return _relink(_read(APP / "Vagvis.html"))


@lru_cache(maxsize=None)
def metod_html() -> str:
    return _relink(_read(APP / "Metod_och_anvandning.html"))


@lru_cache(maxsize=None)
def trafikdata_html() -> str:
    html = _read(APP / "Trafikdata_till_Malmo.html")
    uri = _data_uri(APP / "Trafikdata_till_Malmo.txt", "text/plain;charset=utf-8")
    return html.replace('href="Trafikdata_till_Malmo.txt"', 'href="' + uri + '" download="Trafikdata_till_Malmo.txt"')


@lru_cache(maxsize=None)
def bilmodell_html() -> str:
    """Bilmodell v7 som en enda HTML-text: skript, stilar, typsnitt och bilder inbäddade."""
    html = _read(V7 / "index.html")

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
        return "<style>" + css(V7 / m.group(1)) + "</style>"

    def script(m: re.Match) -> str:
        return _inline_script(_read(V7 / m.group(1)))

    html = re.sub(r'<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>', link, html)
    html = re.sub(r'<link[^>]+href="([^"]+\.css)"[^>]+rel="stylesheet"[^>]*>', link, html)
    html = re.sub(r'<script src="([^"]+)"></script>', script, html)
    csv = V7 / "data" / "deso_resultat.csv"
    if csv.exists():
        html = html.replace('href="data/deso_resultat.csv"', 'href="' + _data_uri(csv, "text/csv;charset=utf-8") + '"')
    markup = markup_only(html)
    leftovers = re.findall(r'(?:src|href)="(?!https?:|data:|#|mailto:|/)([^"]+)"', markup)
    if leftovers:  # en ny fil i v7 som inte bäddats in syns direkt i loggen
        print("Bilmodell v7: lokala referenser som inte bäddats in:", leftovers)
    return html
