"""Kontroll av Streamlit-appen utan webbläsare.
Kör:  python -m pip install pytest  och sedan  python -m pytest tests"""
import re
import sys
from pathlib import Path

from streamlit.testing.v1 import AppTest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import vagvis_sidor as sidor  # noqa: E402

LOKAL = re.compile(r'(?:src|href)="(?!https?:|data:|#|mailto:|/)([^"]+)"')


def test_appen_startar_utan_fel():
    at = AppTest.from_file(str(ROOT / "streamlit_app.py"), default_timeout=60).run()
    assert not at.exception


def test_vagvis_lankar_pekar_pa_streamlit_sidorna():
    html = sidor.vagvis_html()
    assert 'href="/bilmodell_v7"' in html and 'href="/trafikdata"' in html
    assert "Bilmodell_v7/index.html" not in html


def test_bilmodell_v7_ar_en_enda_html_text():
    html = sidor.bilmodell_html()
    assert '<script src="' not in html and 'rel="stylesheet"' not in html
    assert not LOKAL.findall(sidor.markup_only(html))
    assert "data:font/woff2;base64," in html and "window.ATGARDER" in html


def test_ovriga_sidor_har_inga_trasiga_lokala_lankar():
    for html in (sidor.metod_html(), sidor.trafikdata_html()):
        assert not LOKAL.findall(sidor.markup_only(html))
    assert 'download="Trafikdata_till_Malmo.txt"' in sidor.trafikdata_html()
