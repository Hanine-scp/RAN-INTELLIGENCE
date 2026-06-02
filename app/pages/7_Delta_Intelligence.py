import sys
from pathlib import Path

import streamlit as st
import plotly.express as px

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from src.services.data_service import get_delta_metrics, get_site_changes

st.set_page_config(page_title="Delta Intelligence", page_icon="🔁", layout="wide")

st.title("Delta Intelligence")
st.caption("Analyse intelligente des changements entre snapshots Nokia")

df_delta = get_delta_metrics()
df_changes = get_site_changes()

if df_delta.empty:
    st.warning("Aucune métrique Delta disponible.")
    st.stop()

col1, col2 = st.columns(2)

with col1:
    st.subheader("Métriques Delta")
    st.dataframe(df_delta, width="stretch", hide_index=True)

with col2:
    numeric_delta = df_delta.dropna(subset=["delta_numeric"]).copy()

    if not numeric_delta.empty:
        fig = px.bar(
            numeric_delta,
            x="metric",
            y="delta_numeric",
            title="Impact Delta par métrique",
        )
        st.plotly_chart(fig, width="stretch")

st.divider()

st.subheader("Sites ajoutés / supprimés")

if df_changes.empty:
    st.success("Aucun site ajouté ou supprimé.")
else:
    c1, c2 = st.columns(2)

    added = df_changes[df_changes["change_type"].astype(str).str.contains("NEW|ADDED", case=False, na=False)]
    removed = df_changes[df_changes["change_type"].astype(str).str.contains("REMOVED", case=False, na=False)]

    c1.metric("Sites ajoutés", len(added))
    c2.metric("Sites supprimés", len(removed))

    st.dataframe(df_changes, width="stretch", hide_index=True)