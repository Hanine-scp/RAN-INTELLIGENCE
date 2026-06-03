import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

import plotly.express as px
import streamlit as st

from app.components.navbar import hide_default_sidebar_nav, render_navbar
from app.components.sidebar_filters import render_sidebar_filters, sql_in
from src.services.data_service import query, SITES_PATH, EQUIPMENT_PATH
from app.utils.styles import inject_global_styles
from app.utils.i18n import _

inject_global_styles()
hide_default_sidebar_nav()
render_navbar("Analytics")

filters = render_sidebar_filters()
effective_dates = filters["effective_dates"]

if not effective_dates:
    st.warning(_("warning_dates"))
    st.stop()

st.markdown(f'<div class="hero-title">{_("page_ana_title")}</div>', unsafe_allow_html=True)
st.markdown(f'<div class="hero-subtitle" style="margin-bottom: 24px;">{_("page_ana_sub")}</div>', unsafe_allow_html=True)

summary = query(f"""
SELECT
    CAST(snapshot_date AS VARCHAR) AS snapshot_date,
    COUNT(DISTINCT site_id) AS nb_sites,
    SUM(nb_cells_2g) AS cells_2g,
    SUM(nb_cells_3g) AS cells_3g,
    SUM(nb_cells_lte_4g) AS cells_4g,
    SUM(nb_cells_5g) AS cells_5g
FROM read_parquet('{SITES_PATH}')
WHERE CAST(snapshot_date AS VARCHAR) IN {sql_in(effective_dates)}
GROUP BY snapshot_date
ORDER BY snapshot_date
""")

equipment = query(f"""
SELECT
    CAST(snapshot_date AS VARCHAR) AS snapshot_date,
    object_type,
    SUM(nb_equipment) AS equipment_count
FROM read_parquet('{EQUIPMENT_PATH}')
WHERE CAST(snapshot_date AS VARCHAR) IN {sql_in(effective_dates)}
GROUP BY snapshot_date, object_type
ORDER BY snapshot_date, object_type
""")

st.markdown('<div class="section-title">Evolution du nombre de sites</div>', unsafe_allow_html=True)
st.markdown('<div class="content-card">', unsafe_allow_html=True)
fig_sites = px.line(summary, x="snapshot_date", y="nb_sites", markers=True, color_discrete_sequence=["#eb1019"])
fig_sites.update_layout(template="plotly_white", margin=dict(l=20, r=20, t=30, b=20))
st.plotly_chart(fig_sites, width="stretch")
st.markdown('</div>', unsafe_allow_html=True)

st.markdown('<div class="section-title">Evolution des cellules par technologie</div>', unsafe_allow_html=True)
st.markdown('<div class="content-card">', unsafe_allow_html=True)
cells = summary.melt(
    id_vars=["snapshot_date"],
    value_vars=["cells_2g", "cells_3g", "cells_4g", "cells_5g"],
    var_name="technology",
    value_name="cells",
)
fig_cells = px.bar(cells, x="snapshot_date", y="cells", color="technology", barmode="group", color_discrete_sequence=["#7a080d", "#b50d13", "#eb1019", "#ff8080"])
fig_cells.update_layout(template="plotly_white", margin=dict(l=20, r=20, t=30, b=20))
st.plotly_chart(fig_cells, width="stretch")
st.markdown('</div>', unsafe_allow_html=True)

st.markdown('<div class="section-title">Distribution des équipements</div>', unsafe_allow_html=True)
st.markdown('<div class="content-card">', unsafe_allow_html=True)
fig_eq = px.bar(equipment, x="snapshot_date", y="equipment_count", color="object_type", barmode="group", color_discrete_sequence=["#eb1019", "#ff4d4d", "#ff8080", "#ffb3b3", "#ffe6e6"])
fig_eq.update_layout(template="plotly_white", margin=dict(l=20, r=20, t=30, b=20))
st.plotly_chart(fig_eq, width="stretch")
st.markdown('</div>', unsafe_allow_html=True)