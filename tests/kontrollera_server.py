"""GitHub check after Streamlit has been installed. Not a numerical model test."""
import time
import urllib.error
import urllib.request

for attempt in range(40):
    try:
        with urllib.request.urlopen('http://127.0.0.1:8501/_stcore/health',timeout=2) as r:
            if r.status==200 and r.read().strip()==b'ok':
                print('Streamlit-servern svarar pa halsokontrollen.')
                break
    except (OSError,urllib.error.URLError):
        pass
    time.sleep(1)
else:
    raise SystemExit('Streamlit-servern startade inte inom 40 sekunder.')

# Execute the real entrypoint with Streamlit's own testing surface.
from streamlit.testing.v1 import AppTest
app=AppTest.from_file('streamlit_app.py').run(timeout=60)
if len(app.exception):
    raise SystemExit(str(app.exception))
print('Streamlits entrypoint har korts utan rapporterat undantag.')
