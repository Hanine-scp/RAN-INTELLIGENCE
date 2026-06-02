import streamlit as st

st.set_page_config(
    page_title="RAN Intelligence Platform",
    page_icon="📡",
    layout="wide"
)

st.sidebar.title("RAN Intelligence Platform")
language = st.sidebar.selectbox("Langue / Language", ["Français", "English"])

st.markdown("""
<style>
.block-container {
    padding-top: 2rem;
}
.metric-card {
    background-color: #ffffff;
    border: 1px solid #eeeeee;
    border-left: 5px solid #B00020;
    border-radius: 14px;
    padding: 18px;
}
</style>
""", unsafe_allow_html=True)

st.title("RAN Intelligence Platform")
st.caption("Plateforme intelligente de suivi RAN, inventaire, delta et prédiction")

col1, col2, col3, col4 = st.columns(4)

with col1:
    st.metric("Sites actifs", "0")
with col2:
    st.metric("Sites bloqués", "0")
with col3:
    st.metric("Modules remplacés", "0")
with col4:
    st.metric("Alertes IA", "0")

st.divider()

st.subheader("Vue d’ensemble")
st.write(
    "La plateforme permet d’analyser les fichiers XML Nokia, suivre l’état des sites, "
    "détecter les changements entre deux dates et préparer la prédiction des remplacements."
)

st.subheader("Pipeline cible")
st.code(
    "XML Nokia J-1 → Spark Processing → Parquet/Gold Data → Dashboard Streamlit → Export CSV",
    language="text"
)