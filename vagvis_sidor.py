"""Read only packaged, trusted HTML. No network requests or API keys at runtime."""
from pathlib import Path
import html

ROOT = Path(__file__).resolve().parent
PAGES = {
    "vagvis": "app/Vagvis.html",
    "bilmodell_v7": "app/Bilmodell_v7.html",
    "metod": "app/Metod_och_anvandning.html",
}


def page_html(name="vagvis"):
    if name == "trafikdata":
        text = (ROOT / "dokument/Trafikdata_till_Malmo.txt").read_text(encoding="utf-8")
        return '<!doctype html><html lang="sv"><meta charset="utf-8"><title>Trafikdata</title><style>body{font:17px/1.6 system-ui;max-width:1000px;margin:30px auto;padding:20px}pre{white-space:pre-wrap}</style><h1>Underlag för trafikmodellen</h1><pre>' + html.escape(text) + '</pre></html>'
    if name not in PAGES:
        raise ValueError("Okänd sida")
    text = (ROOT / PAGES[name]).read_text(encoding="utf-8")
    # The HTML also works as a local file. Only its local page links are routed
    # through Streamlit while it is being served here.
    return text.replace('Bilmodell_v7.html','/bilmodell_v7').replace('Trafikdata_till_Malmo.html','/trafikdata')
