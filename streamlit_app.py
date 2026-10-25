"""Streamlit serves the existing Vägvis interface; calculations run in the browser."""
import streamlit as st
import streamlit.components.v1 as components
from vagvis_sidor import page_html

st.set_page_config(page_title="Vägvis 2.1.1", page_icon="🚦", layout="wide", initial_sidebar_state="collapsed")
st.markdown("""<style>
[data-testid="stHeader"], [data-testid="stSidebar"], footer {display:none;}
.block-container {padding:0 !important;max-width:100% !important;}
[data-testid="stMainBlockContainer"] {padding:0 !important;}
iframe {border:0;}
</style>""", unsafe_allow_html=True)


def show(name):
    # File bytes are read on every rerun, so a new commit is not hidden by a cache.
    components.html(page_html(name), height=1050, scrolling=True)


pages = [
    st.Page(lambda: show("vagvis"), title="Vägvis", url_path="vagvis", default=True),
    st.Page(lambda: show("metod"), title="Metod och källor", url_path="metod"),
    st.Page(lambda: show("trafikdata"), title="Trafikdata", url_path="trafikdata"),
]
st.navigation(pages, position="hidden").run()
