"""Read only packaged, trusted files. No network requests or API keys at runtime.

Huvudsidan monteras vid körning av kallkod/source/shell.html och de filer som skalet
pekar ut, på exakt samma sätt som `node kallkod/bygg_appen.cjs` bygger app/Vagvis.html.
Därför behöver den stora färdigbyggda HTML-filen inte ligga i GitHub-repot.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SHELL = "kallkod/source/shell.html"
PAGES = {
    "vagvis": SHELL,
    "metod": "app/Metod_och_anvandning.html",
    "trafikdata": "app/Trafikdata_till_Malmo.html",
}
_MARKER = re.compile(r"\{\{([^}]+)\}\}")
_CACHE: dict[str, tuple[tuple, str]] = {}


def _local(name: str) -> Path:
    target = (ROOT / name).resolve()
    if ROOT not in target.parents:
        raise ValueError("Sökväg utanför paketet: " + name)
    return target


def _embed(name: str, text: str) -> str:
    text = text.strip()
    if name.endswith(".json"):
        json.loads(text)
        return text.replace("<", "\\u003c")
    if name.endswith(".js"):
        return re.sub(r"</script", r"<\\/script", text, flags=re.IGNORECASE)
    return text


def assemble() -> str:
    """Bygg huvudsidan från skal, källkod och data. Resultatet cachas tills någon fil ändras."""
    shell = _local(SHELL)
    names = _MARKER.findall(shell.read_text(encoding="utf-8"))
    stamp = tuple((n, _local(n).stat().st_mtime_ns, _local(n).stat().st_size) for n in [SHELL, *names])
    cached = _CACHE.get(SHELL)
    if cached and cached[0] == stamp:
        return cached[1]
    html = _MARKER.sub(lambda m: _embed(m.group(1), _local(m.group(1)).read_text(encoding="utf-8")),
                       shell.read_text(encoding="utf-8"))
    if _MARKER.search(html):
        raise ValueError("En byggmarkör saknar innehåll")
    _CACHE[SHELL] = (stamp, html)
    return html


def page_html(name: str = "vagvis") -> str:
    if name not in PAGES:
        raise ValueError("Okänd sida")
    text = assemble() if name == "vagvis" else _local(PAGES[name]).read_text(encoding="utf-8")
    # The HTML also works as a local file. Only its local page links are routed
    # through Streamlit while it is being served here.
    return text.replace('Metod_och_anvandning.html', '/metod').replace('Trafikdata_till_Malmo.html', '/trafikdata')
