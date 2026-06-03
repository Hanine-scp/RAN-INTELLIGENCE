import streamlit as st
import pandas as pd
from pathlib import Path

st.set_page_config(
    page_title="RAN Intelligence Platform",
    page_icon="📡",
    layout="wide"
)

REGISTRY_PATH = Path("data/bronze/snapshot_registry.csv")

st.sidebar.title("RAN Intelligence Platform")
language = st.sidebar.selectbox("Langue / Language", ["Français", "English"])

st.title("RAN Intelligence Platform")
st.caption("Plateforme intelligente de suivi RAN, inventaire, delta et prédiction")

if REGISTRY_PATH.exists():
    registry_df = pd.read_csv(REGISTRY_PATH)

    total_sites = registry_df["site_count"].sum()
    total_snapshots = len(registry_df)
    last_date = registry_df["snapshot_date"].max()

    col1, col2, col3, col4 = st.columns(4)

    col1.metric("Snapshots disponibles", total_snapshots)
    col2.metric("Sites total", total_sites)
    col3.metric("Dernière date", last_date)
    col4.metric("Statut", "OK")

    st.divider()

    st.subheader("Snapshots détectés")
    st.dataframe(registry_df, use_container_width=True)

else:
    st.warning("Aucun snapshot trouvé. Lancez scripts/build_snapshot_registry.py")

st.divider()

st.subheader("Pipeline cible")
st.code(
    "XML Nokia J-1 → Spark Processing → Parquet/Gold Data → Dashboard Streamlit → Export CSV",
    language="text"
)