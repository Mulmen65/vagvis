"""Read only packaged, trusted HTML. No network requests or API keys at runtime."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PAGES = {
    "vagvis": "app/Vagvis.html",
    "metod": "app/Metod_och_anvandning.html",
    "trafikdata": "app/Trafikdata_till_Malmo.html",
}


def page_html(name="vagvis"):
    if name not in PAGES:
        raise ValueError("Okänd sida")
    text = (ROOT / PAGES[name]).read_text(encoding="utf-8")
    # The HTML also works as a local file. Only its local page links are routed
    # through Streamlit while it is being served here.
    return text.replace('Metod_och_anvandning.html','/metod').replace('Trafikdata_till_Malmo.html','/trafikdata')
