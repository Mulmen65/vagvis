"""Streamlit serves the existing Vägvis interface; calculations run in the browser."""
import sys
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

sys.path.insert(0, str(Path(__file__).resolve().parent))
from vagvis_sidor import page_html  # noqa: E402

st.set_page_config(page_title="Vägvis 2.2.6", page_icon="🚦", layout="wide", initial_sidebar_state="collapsed")
st.markdown("""<style>
[data-testid="stHeader"], [data-testid="stSidebar"], footer {display:none;}
.block-container {padding:0 !important;max-width:100% !important;}
[data-testid="stMainBlockContainer"] {padding:0 !important;}
iframe {border:0;}
</style>""", unsafe_allow_html=True)


def show(name):
    # Sidan monteras från källfilerna; cachen invalideras när en fil ändras.
    components.html(page_html(name), height=1050, scrolling=True)


pages = [
    st.Page(lambda: show("vagvis"), title="Vägvis", url_path="vagvis", default=True),
    st.Page(lambda: show("metod"), title="Metod och källor", url_path="metod"),
    st.Page(lambda: show("trafikdata"), title="Trafikdata", url_path="trafikdata"),
]
st.navigation(pages, position="hidden").run()
