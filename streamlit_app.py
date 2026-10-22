"""Vägvis på Streamlit.

Vägvis är en fristående webbapp (HTML och JavaScript). All beräkning sker i besökarens
webbläsare; Streamlit-servern skickar bara sidorna. Appen har fyra sidor:

  /vagvis        Vägvis 2.0.5 (modell A och B), startsida
  /bilmodell_v7  Bilmodell v7 (bilar och körsträcka per område, åtgärder, referenskontroll)
  /metod         Metod och användning
  /trafikdata    Dataförfrågan till Malmö stad

Kör lokalt:  python -m pip install -r requirements.txt  och sedan  streamlit run streamlit_app.py
"""
import streamlit as st

import vagvis_sidor as sidor


def html(namn: str) -> str:
    # vagvis_sidor håller sidorna i minnet så länge filerna i mappen app är oförändrade.
    # En ny app/Vagvis.html på GitHub syns därför direkt, utan att appen behöver startas om.
    return {"vagvis": sidor.vagvis_html, "bilmodell": sidor.bilmodell_html,
            "metod": sidor.metod_html, "trafikdata": sidor.trafikdata_html}[namn]()


def full_height(title: str) -> None:
    """Låt appen fylla fönstret under Streamlits menyrad (3,75 rem). Appen rullar inuti ramen."""
    st.html(
        "<style>"
        '[data-testid="stMainBlockContainer"]{padding:3.75rem 0 0 0 !important;max-width:100% !important}'
        '[data-testid="stMainBlockContainer"] [data-testid="stVerticalBlock"]{gap:0 !important}'
        f'iframe[title="{title}"]{{height:calc(100vh - 3.75rem) !important;height:calc(100dvh - 3.75rem) !important;border:0;display:block}}'
        f'[data-testid="stElementContainer"]:has(> iframe[title="{title}"]){{height:auto !important;min-height:0 !important;flex:0 0 auto !important}}'
        "</style>"
    )


def show(html: str, title: str) -> None:
    full_height(title)
    st.iframe(html, height=900, alt=title)


def page_vagvis() -> None:
    show(html("vagvis"), "Vägvis")


def page_bilmodell() -> None:
    show(html("bilmodell"), "Bilmodell v7")


def page_metod() -> None:
    show(html("metod"), "Metod och användning")


def page_trafikdata() -> None:
    show(html("trafikdata"), "Dataförfrågan till Malmö stad")


st.set_page_config(page_title="Vägvis – trafikens klimatavtryck", page_icon=":material/route:", layout="wide")
pages = [
    st.Page(page_vagvis, title="Vägvis", icon=":material/route:", url_path="vagvis", default=True),
    st.Page(page_bilmodell, title="Bilmodell v7", icon=":material/directions_car:", url_path="bilmodell_v7"),
    st.Page(page_metod, title="Metod", icon=":material/menu_book:", url_path="metod"),
    st.Page(page_trafikdata, title="Dataförfrågan", icon=":material/mail:", url_path="trafikdata"),
]
st.navigation(pages, position="top").run()
