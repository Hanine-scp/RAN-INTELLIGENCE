import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

import plotly.express as px
import streamlit as st

st.set_page_config(page_title="Statistiques — RAN Intelligence", page_icon="📡", layout="wide")

from app.components.navbar import hide_default_sidebar_nav, render_navbar
from app.components.sidebar_filters import render_sidebar_filters, sql_in
from src.services.data_service import query, EQUIPMENT_PATH
from app.utils.styles import inject_global_styles
from app.utils.i18n import _

inject_global_styles()
hide_default_sidebar_nav()
render_navbar("Statistiques")

filters = render_sidebar_filters()
effective_dates = filters["effective_dates"]

if not effective_dates:
    st.warning(_("warning_dates"))
    st.stop()

st.markdown(f'<div class="hero-title">{_("page_stats_title")}</div>', unsafe_allow_html=True)
st.markdown(f'<div class="hero-subtitle" style="margin-bottom: 24px;">{_("page_stats_sub")}</div>', unsafe_allow_html=True)

df = query(f"""
SELECT
    object_type,
    SUM(nb_equipment) AS total_equipment
FROM read_parquet('{EQUIPMENT_PATH}')
WHERE CAST(snapshot_date AS VARCHAR) IN {sql_in(effective_dates)}
GROUP BY object_type
ORDER BY total_equipment DESC
""")

st.markdown('<div class="content-card">', unsafe_allow_html=True)
fig = px.bar(df, x="object_type", y="total_equipment", title="Top équipements", color_discrete_sequence=["#eb1019"])
fig.update_layout(template="plotly_white", margin=dict(l=20, r=20, t=30, b=20))
st.plotly_chart(fig, width="stretch")
st.markdown('</div>', unsafe_allow_html=True)

st.markdown('<div class="content-card">', unsafe_allow_html=True)
st.dataframe(df, width="stretch", hide_index=True)
st.markdown('</div>', unsafe_allow_html=True)