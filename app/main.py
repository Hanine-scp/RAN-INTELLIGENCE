import streamlit as st

st.set_page_config(
    page_title="RAN Intelligence Platform",
    page_icon="📡",
    layout="wide"
)

st.markdown("""
<style>
    .main {
        background-color: #ffffff;
    }
    h1, h2, h3 {
        color: #b00020;
    }
    .stMetric {
        background-color: #ffffff;
        border: 1px solid #eeeeee;
        border-radius: 12px;
        padding: 16px;
    }
</style>
""", unsafe_allow_html=True)

st.title("RAN Intelligence Platform")
st.caption("Plateforme intelligente de suivi, inventaire, delta et prédiction RAN")

col1, col2, col3, col4 = st.columns(4)

col1.metric("Sites actifs", "0")
col2.metric("Sites bloqués", "0")
col3.metric("Modules remplacés", "0")
col4.metric("Alertes IA", "0")

st.divider()

st.subheader("Bienvenue")
st.write(
    "Cette plateforme analysera les fichiers XML Nokia, générera les inventaires, "
    "détectera les deltas entre deux dates et préparera les données pour la prédiction."
)