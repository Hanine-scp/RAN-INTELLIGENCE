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
render_navbar("Delta")

filters = render_sidebar_filters()

st.markdown(f'<div class="hero-title">{_("page_delta_title")}</div>', unsafe_allow_html=True)
st.markdown(f'<div class="hero-subtitle" style="margin-bottom: 24px;">{_("page_delta_sub")}</div>', unsafe_allow_html=True)

df_delta = get_delta_metrics()
df_changes = get_site_changes()

if df_delta.empty:
    st.warning(_("delta_no_data"))
    st.stop()

st.markdown(f'<div class="section-title">{_("delta_sum")}</div>', unsafe_allow_html=True)

numeric_delta = df_delta.dropna(subset=["delta_numeric"]).copy()

st.markdown('<div class="content-card">', unsafe_allow_html=True)
col1, col2, col3 = st.columns(3)

added_sites = 0
removed_sites = 0
equipment_delta = 0

if not numeric_delta.empty:
    added = numeric_delta[numeric_delta["metric"] == "nb_added_sites"]
    removed = numeric_delta[numeric_delta["metric"] == "nb_removed_sites"]
    equipment = numeric_delta[numeric_delta["metric"] == "nb_equipment"]

    if not added.empty:
        added_sites = int(added.iloc[0]["delta_numeric"])

    if not removed.empty:
        removed_sites = int(removed.iloc[0]["delta_numeric"])

    if not equipment.empty:
        equipment_delta = int(equipment.iloc[0]["delta_numeric"])

col1.metric(_("delta_add"), added_sites)
col2.metric(_("delta_rem"), removed_sites)
col3.metric(_("delta_eq"), equipment_delta)
st.markdown('</div>', unsafe_allow_html=True)

st.markdown(f'<div class="section-title">{_("delta_impact")}</div>', unsafe_allow_html=True)
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

st.markdown(f'<div class="section-title">{_("delta_table")}</div>', unsafe_allow_html=True)
st.markdown('<div class="content-card">', unsafe_allow_html=True)
st.dataframe(df_delta, width="stretch", hide_index=True)
st.markdown('</div>', unsafe_allow_html=True)

st.markdown(f'<div class="section-title">{_("delta_sites")}</div>', unsafe_allow_html=True)

if df_changes.empty:
    st.success(_("delta_no_sites"))
else:
    st.markdown('<div class="content-card">', unsafe_allow_html=True)
    col_a, col_b = st.columns(2)

    added_df = df_changes[
        df_changes["change_type"].astype(str).str.contains("NEW|ADDED", case=False, na=False)
    ]

    removed_df = df_changes[
        df_changes["change_type"].astype(str).str.contains("REMOVED", case=False, na=False)
    ]

    col_a.metric(_("delta_new"), len(added_df))
    col_b.metric(_("delta_res"), len(removed_df))

    st.dataframe(df_changes, width="stretch", hide_index=True)
    st.markdown('</div>', unsafe_allow_html=True)