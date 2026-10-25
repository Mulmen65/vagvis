"""CI smoke test of the installed Streamlit server and its real entrypoint.

This checks Python startup/routing. It does not execute the iframe JavaScript.
"""
from pathlib import Path
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]

for attempt in range(40):
    try:
        with urllib.request.urlopen("http://127.0.0.1:8501/_stcore/health", timeout=2) as response:
            if response.status == 200 and response.read().strip() == b"ok":
                print("Streamlit-servern svarar på hälsokontrollen.")
                break
    except (OSError, urllib.error.URLError):
        pass
    time.sleep(1)
else:
    raise SystemExit("Streamlit-servern startade inte inom 40 sekunder.")

from streamlit.testing.v1 import AppTest

app = AppTest.from_file(str(ROOT / "streamlit_app.py")).run(timeout=60)
if len(app.exception):
    raise SystemExit(str(app.exception))
print("Streamlits huvudfil har körts utan rapporterat undantag.")
