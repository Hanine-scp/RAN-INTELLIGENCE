import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from app.components.navbar import hide_default_sidebar_nav, render_navbar
from app.components.sidebar_filters import render_sidebar_filters, sql_in
from src.services.data_service import query, SITES_PATH, EQUIPMENT_PATH
from app.utils.image_utils import get_base64_image
from app.utils.styles import inject_global_styles, kpi
from app.utils.i18n import _


st.set_page_config(
    page_title="RAN Intelligence Platform",
    page_icon="📡",
    layout="wide",
)

inject_global_styles()
hide_default_sidebar_nav()
render_navbar("Accueil")

# Styles and kpi function are now imported from app.utils.styles


filters = render_sidebar_filters()

selected_dates = filters["effective_dates"] or filters["selected_dates"]
selected_files = filters["selected_files"]
selected_sites = filters["selected_sites"]

if not selected_dates:
    st.warning(_("warning_dates"))
    st.stop()

selected_dates = sorted(selected_dates)
latest_date = selected_dates[-1]
oldest_date = selected_dates[0]

site_where = f"CAST(snapshot_date AS VARCHAR) IN {sql_in(selected_dates)}"
equipment_where = f"CAST(snapshot_date AS VARCHAR) IN {sql_in(selected_dates)}"

if selected_files:
    site_where += f" AND CAST(source_file AS VARCHAR) IN {sql_in(selected_files)}"
    equipment_where += f" AND CAST(source_file AS VARCHAR) IN {sql_in(selected_files)}"

if selected_sites:
    site_where += f" AND CAST(site_id AS VARCHAR) IN {sql_in(selected_sites)}"
    equipment_where += f" AND CAST(site_id AS VARCHAR) IN {sql_in(selected_sites)}"

latest_site_where = site_where + f" AND CAST(snapshot_date AS VARCHAR) = '{latest_date}'"
latest_equipment_where = equipment_where + f" AND CAST(snapshot_date AS VARCHAR) = '{latest_date}'"

logo_base64 = get_base64_image("c:/projects/RAN-INTELLIGENCE/Ooredoo_logo_2017.png")
logo_html = f'<div class="hero-logo-container"><img src="data:image/png;base64,{logo_base64}" alt="Ooredoo Logo"></div>' if logo_base64 else ''

st.markdown(
    f"""
    <div class="hero">
        {logo_html}
        <div class="hero-title">{_("hero_title")}</div>
        <div class="hero-subtitle">
            {_("hero_sub")}
        </div>
        <div class="badge">
            {_("hero_badge_prefix")} {oldest_date} → {latest_date} · {len(selected_dates)} {_("hero_badge_suffix")}
        </div>
    </div>
    """,
    unsafe_allow_html=True,
)

site_kpi = query(f"""
SELECT
    COUNT(DISTINCT site_id) AS total_sites,
    COALESCE(SUM(CASE WHEN LOWER(site_state) = 'active' THEN 1 ELSE 0 END), 0) AS active_sites,
    COALESCE(SUM(CASE WHEN LOWER(site_state) = 'blocked' THEN 1 ELSE 0 END), 0) AS blocked_sites,
    COALESCE(SUM(nb_cells_2g), 0) AS cells_2g,
    COALESCE(SUM(nb_cells_3g), 0) AS cells_3g,
    COALESCE(SUM(nb_cells_lte_4g), 0) AS cells_4g,
    COALESCE(SUM(nb_cells_5g), 0) AS cells_5g
FROM read_parquet('{SITES_PATH}')
WHERE {latest_site_where}
""").iloc[0]

equipment_kpi = query(f"""
SELECT COALESCE(SUM(nb_equipment), 0) AS total_equipment
FROM read_parquet('{EQUIPMENT_PATH}')
WHERE {latest_equipment_where}
""").iloc[0]

availability = round(
    int(site_kpi["active_sites"]) / int(site_kpi["total_sites"]) * 100,
    2,
) if int(site_kpi["total_sites"]) else 0

c1, c2, c3, c4, c5 = st.columns(5)

with c1:
    kpi(_("kpi_sites"), f"{int(site_kpi['total_sites']):,}", f"{_('kpi_sites_sub')} {latest_date}")
with c2:
    kpi(_("kpi_active"), f"{int(site_kpi['active_sites']):,}", _("kpi_active_sub"))
with c3:
    kpi(_("kpi_blocked"), f"{int(site_kpi['blocked_sites']):,}", _("kpi_blocked_sub"))
with c4:
    kpi(_("kpi_equip"), f"{int(equipment_kpi['total_equipment']):,}", _("kpi_equip_sub"))
with c5:
    kpi(_("kpi_avail"), f"{availability}%", _("kpi_avail_sub"))

st.divider()

summary = query(f"""
SELECT
    CAST(snapshot_date AS VARCHAR) AS snapshot_date,
    COUNT(DISTINCT site_id) AS nb_sites,
    COALESCE(SUM(CASE WHEN LOWER(site_state) = 'active' THEN 1 ELSE 0 END), 0) AS active_sites,
    COALESCE(SUM(CASE WHEN LOWER(site_state) = 'blocked' THEN 1 ELSE 0 END), 0) AS blocked_sites,
    COALESCE(SUM(nb_cells_2g), 0) AS cells_2g,
    COALESCE(SUM(nb_cells_3g), 0) AS cells_3g,
    COALESCE(SUM(nb_cells_lte_4g), 0) AS cells_4g,
    COALESCE(SUM(nb_cells_5g), 0) AS cells_5g
FROM read_parquet('{SITES_PATH}')
WHERE {site_where}
GROUP BY snapshot_date
ORDER BY snapshot_date
""")

equipment_summary = query(f"""
SELECT
    CAST(snapshot_date AS VARCHAR) AS snapshot_date,
    object_type,
    COALESCE(SUM(nb_equipment), 0) AS equipment_count
FROM read_parquet('{EQUIPMENT_PATH}')
WHERE {equipment_where}
GROUP BY snapshot_date, object_type
ORDER BY snapshot_date, object_type
""")

left, right = st.columns(2)

with left:
    st.markdown(f'<div class="section-title">{_("sec_evol")}</div>', unsafe_allow_html=True)
    st.markdown('<div class="content-card">', unsafe_allow_html=True)
    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=summary["snapshot_date"],
        y=summary["nb_sites"],
        mode="lines+markers",
        line=dict(color="#eb1019", width=3),
        marker=dict(size=9),
        name=_("kpi_sites"),
    ))
    fig.update_layout(template="plotly_white", height=350, margin=dict(l=20, r=20, t=30, b=20))
    st.plotly_chart(fig, width="stretch")
    st.markdown('</div>', unsafe_allow_html=True)

with right:
    st.markdown(f'<div class="section-title">{_("sec_active_blocked")}</div>', unsafe_allow_html=True)
    st.markdown('<div class="content-card">', unsafe_allow_html=True)
    state_df = summary.melt(
        id_vars=["snapshot_date"],
        value_vars=["active_sites", "blocked_sites"],
        var_name="État",
        value_name=_("kpi_sites"),
    )
    state_df["État"] = state_df["État"].replace({
        "active_sites": _("state_active"),
        "blocked_sites": _("state_blocked"),
    })
    fig = px.bar(
        state_df,
        x="snapshot_date",
        y="Sites",
        color="État",
        barmode="group",
        color_discrete_map={"Actifs": "#eb1019", "Bloqués": "#ffb3b3"},
    )
    fig.update_layout(template="plotly_white", height=350, margin=dict(l=20, r=20, t=30, b=20))
    st.plotly_chart(fig, width="stretch")
    st.markdown('</div>', unsafe_allow_html=True)

st.markdown(f'<div class="section-title">{_("sec_cells")}</div>', unsafe_allow_html=True)
st.markdown('<div class="content-card">', unsafe_allow_html=True)

cells_df = summary.melt(
    id_vars=["snapshot_date"],
    value_vars=["cells_2g", "cells_3g", "cells_4g", "cells_5g"],
    var_name="Technologie",
    value_name="Cellules",
)

cells_df["Technologie"] = cells_df["Technologie"].replace({
    "cells_2g": "2G",
    "cells_3g": "3G",
    "cells_4g": "4G",
    "cells_5g": "5G",
})

fig_cells = px.bar(
    cells_df,
    x="snapshot_date",
    y="Cellules",
    color="Technologie",
    barmode="group",
    color_discrete_map={
        "2G": "#7a080d",
        "3G": "#b50d13",
        "4G": "#eb1019",
        "5G": "#ff8080",
    },
)

fig_cells.update_layout(template="plotly_white", height=400, margin=dict(l=20, r=20, t=30, b=20))
st.plotly_chart(fig_cells, width="stretch")
st.markdown('</div>', unsafe_allow_html=True)

st.markdown(f'<div class="section-title">{_("sec_equip")}</div>', unsafe_allow_html=True)
st.markdown('<div class="content-card">', unsafe_allow_html=True)

fig_eq = px.bar(
    equipment_summary,
    x="snapshot_date",
    y="equipment_count",
    color="object_type",
    barmode="group",
    color_discrete_sequence=["#eb1019", "#ff4d4d", "#ff8080", "#ffb3b3", "#ffe6e6"]
)

fig_eq.update_layout(template="plotly_white", height=430, margin=dict(l=20, r=20, t=30, b=20))
st.plotly_chart(fig_eq, width="stretch")
st.markdown('</div>', unsafe_allow_html=True)

st.markdown(f'<div class="section-title">{_("sec_synth")}</div>', unsafe_allow_html=True)
st.markdown('<div class="content-card">', unsafe_allow_html=True)

summary_display = summary.copy()
summary_display["availability_percent"] = (
    summary_display["active_sites"] / summary_display["nb_sites"] * 100
).round(2)

st.dataframe(summary_display, width="stretch", hide_index=True)
st.markdown('</div>', unsafe_allow_html=True)