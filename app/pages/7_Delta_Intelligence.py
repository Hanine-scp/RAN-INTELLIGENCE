import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

import plotly.express as px
import streamlit as st

from app.components.navbar import hide_default_sidebar_nav, render_navbar
from app.components.sidebar_filters import render_sidebar_filters
from src.services.data_service import get_delta_metrics, get_site_changes
from app.utils.styles import inject_global_styles
from app.utils.i18n import _

inject_global_styles()
hide_default_sidebar_nav()
render_navbar("Delta Intelligence")

filters = render_sidebar_filters()

st.markdown(f'<div class="hero-title">{_("page_di_title")}</div>', unsafe_allow_html=True)
st.markdown(f'<div class="hero-subtitle" style="margin-bottom: 24px;">{_("page_di_sub")}</div>', unsafe_allow_html=True)

df_delta = get_delta_metrics()
df_changes = get_site_changes()

if df_delta.empty:
    st.warning("Aucune métrique Delta disponible.")
    st.stop()

col1, col2 = st.columns(2)

with col1:
    st.markdown('<div class="section-title">Métriques Delta</div>', unsafe_allow_html=True)
    st.markdown('<div class="content-card">', unsafe_allow_html=True)
    st.dataframe(df_delta, width="stretch", hide_index=True)
    st.markdown('</div>', unsafe_allow_html=True)

with col2:
    numeric_delta = df_delta.dropna(subset=["delta_numeric"]).copy()

    if not numeric_delta.empty:
        st.markdown('<div class="section-title">Impact Delta par métrique</div>', unsafe_allow_html=True)
        st.markdown('<div class="content-card">', unsafe_allow_html=True)
        fig = px.bar(
            numeric_delta,
            x="metric",
            y="delta_numeric",
            color_discrete_sequence=["#eb1019"]
        )
        fig.update_layout(template="plotly_white", margin=dict(l=20, r=20, t=30, b=20))
        st.plotly_chart(fig, width="stretch")
        st.markdown('</div>', unsafe_allow_html=True)

st.markdown('<div class="section-title">Sites ajoutés / supprimés</div>', unsafe_allow_html=True)

if df_changes.empty:
    st.success("Aucun site ajouté ou supprimé.")
else:
    st.markdown('<div class="content-card">', unsafe_allow_html=True)
    c1, c2 = st.columns(2)

    added = df_changes[df_changes["change_type"].astype(str).str.contains("NEW|ADDED", case=False, na=False)]
    removed = df_changes[df_changes["change_type"].astype(str).str.contains("REMOVED", case=False, na=False)]

    c1.metric("Sites ajoutés", len(added))
    c2.metric("Sites supprimés", len(removed))

    st.dataframe(df_changes, width="stretch", hide_index=True)
    st.markdown('</div>', unsafe_allow_html=True)