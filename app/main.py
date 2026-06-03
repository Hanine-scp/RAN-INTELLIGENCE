import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from app.components.navbar import hide_default_sidebar_nav, render_navbar
from app.components.sidebar_filters import render_sidebar_filters
from src.services.data_service import query, SITES_PATH, EQUIPMENT_PATH


st.set_page_config(
    page_title="RAN Intelligence Platform",
    page_icon="📡",
    layout="wide",
)

hide_default_sidebar_nav()
render_navbar("Accueil")

st.markdown("""
<style>
.block-container {
    padding-top: 1rem;
    padding-left: 2.5rem;
    padding-right: 2.5rem;
}
.hero {
    background: linear-gradient(135deg, #ffffff 0%, #fff5f5 100%);
    border: 1px solid #e5e7eb;
    border-radius: 26px;
    padding: 28px 32px;
    margin-bottom: 24px;
    box-shadow: 0 14px 38px rgba(17,24,39,0.06);
}
.hero-title {
    font-size: 42px;
    font-weight: 950;
    color: #111827;
}
.hero-subtitle {
    color: #6b7280;
    font-size: 15px;
    margin-top: 8px;
}
.badge {
    display: inline-block;
    background: #fff1f2;
    color: #b91c1c;
    border: 1px solid #fecaca;
    padding: 7px 12px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 800;
    margin-top: 14px;
}
.kpi-card {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-left: 6px solid #b91c1c;
    border-radius: 20px;
    padding: 20px;
    box-shadow: 0 12px 30px rgba(17,24,39,0.05);
}
.kpi-label {
    color: #6b7280;
    font-size: 12px;
    font-weight: 850;
    text-transform: uppercase;
    letter-spacing: .8px;
}
.kpi-value {
    color: #111827;
    font-size: 34px;
    font-weight: 950;
    margin-top: 12px;
}
.kpi-sub {
    color: #6b7280;
    font-size: 13px;
    margin-top: 8px;
}
.section-title {
    font-size: 21px;
    font-weight: 900;
    color: #111827;
    margin: 18px 0 12px 0;
}
</style>
""", unsafe_allow_html=True)


def sql_in(values):
    if not values:
        return "('')"
    return "(" + ", ".join("'" + str(v).replace("'", "''") + "'" for v in values) + ")"


def kpi(label, value, sub):
    st.markdown(
        f"""
        <div class="kpi-card">
            <div class="kpi-label">{label}</div>
            <div class="kpi-value">{value}</div>
            <div class="kpi-sub">{sub}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


filters = render_sidebar_filters()

selected_dates = filters["effective_dates"] or filters["selected_dates"]
selected_files = filters["selected_files"]
selected_sites = filters["selected_sites"]

if not selected_dates:
    st.warning("Veuillez sélectionner au moins une date.")
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

st.markdown(
    f"""
    <div class="hero">
        <div class="hero-title">RAN Intelligence Platform</div>
        <div class="hero-subtitle">
            Plateforme C2 intelligente dédiée à la supervision consolidée du réseau RAN Nokia.
            Elle centralise les snapshots XML, analyse l’état des sites, l’inventaire hardware,
            les deltas entre dates, la qualité des données et prépare les indicateurs prédictifs
            pour le dimensionnement des spares et l’aide à la décision opérationnelle.
        </div>
        <div class="badge">
            Analyse active : {oldest_date} → {latest_date} · {len(selected_dates)} snapshot(s)
        </div>
    </div>
    """,
    unsafe_allow_html=True,
)

site_kpi = query(f"""
SELECT
    COUNT(*) AS total_sites,
    COALESCE(SUM(CASE WHEN LOWER(site_state) = 'active' THEN 1 ELSE 0 END), 0) AS active_sites,
    COALESCE(SUM(CASE WHEN LOWER(site_state) = 'blocked' THEN 1 ELSE 0 END), 0) AS blocked_sites,
    COALESCE(SUM(nb_cells_2g), 0) AS cells_2g,
    COALESCE(SUM(nb_cells_3g), 0) AS cells_3g,
    COALESCE(SUM(nb_cells_lte_4g), 0) AS cells_4g,
    COALESCE(SUM(nb_cells_5g), 0) AS cells_5g
FROM read_parquet('{SITES_PATH}')
WHERE {site_where}
""").iloc[0]

equipment_kpi = query(f"""
SELECT COALESCE(SUM(nb_equipment), 0) AS total_equipment
FROM read_parquet('{EQUIPMENT_PATH}')
WHERE {equipment_where}
""").iloc[0]

availability = round(
    int(site_kpi["active_sites"]) / int(site_kpi["total_sites"]) * 100,
    2,
) if int(site_kpi["total_sites"]) else 0

c1, c2, c3, c4, c5 = st.columns(5)

with c1:
    kpi("Sites", f"{int(site_kpi['total_sites']):,}", f"Dernier snapshot {latest_date}")
with c2:
    kpi("Sites actifs", f"{int(site_kpi['active_sites']):,}", "RAN opérationnel")
with c3:
    kpi("Sites bloqués", f"{int(site_kpi['blocked_sites']):,}", "Sites sous impact")
with c4:
    kpi("Équipements", f"{int(equipment_kpi['total_equipment']):,}", "Modules installés")
with c5:
    kpi("Disponibilité", f"{availability}%", "Taux opérationnel")

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
    st.markdown('<div class="section-title">Évolution des sites</div>', unsafe_allow_html=True)
    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=summary["snapshot_date"],
        y=summary["nb_sites"],
        mode="lines+markers",
        line=dict(color="#b91c1c", width=3),
        marker=dict(size=9),
        name="Sites",
    ))
    fig.update_layout(template="plotly_white", height=350, margin=dict(l=20, r=20, t=30, b=20))
    st.plotly_chart(fig, width="stretch")

with right:
    st.markdown('<div class="section-title">Sites actifs vs bloqués</div>', unsafe_allow_html=True)
    state_df = summary.melt(
        id_vars=["snapshot_date"],
        value_vars=["active_sites", "blocked_sites"],
        var_name="État",
        value_name="Sites",
    )
    state_df["État"] = state_df["État"].replace({
        "active_sites": "Actifs",
        "blocked_sites": "Bloqués",
    })
    fig = px.bar(
        state_df,
        x="snapshot_date",
        y="Sites",
        color="État",
        barmode="group",
        color_discrete_map={"Actifs": "#b91c1c", "Bloqués": "#fca5a5"},
    )
    fig.update_layout(template="plotly_white", height=350, margin=dict(l=20, r=20, t=30, b=20))
    st.plotly_chart(fig, width="stretch")

st.markdown('<div class="section-title">Répartition des cellules par technologie</div>', unsafe_allow_html=True)

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
        "2G": "#7f1d1d",
        "3G": "#991b1b",
        "4G": "#b91c1c",
        "5G": "#fca5a5",
    },
)

fig_cells.update_layout(template="plotly_white", height=400, margin=dict(l=20, r=20, t=30, b=20))
st.plotly_chart(fig_cells, width="stretch")

st.markdown('<div class="section-title">Distribution des équipements</div>', unsafe_allow_html=True)

fig_eq = px.bar(
    equipment_summary,
    x="snapshot_date",
    y="equipment_count",
    color="object_type",
    barmode="group",
)

fig_eq.update_layout(template="plotly_white", height=430, margin=dict(l=20, r=20, t=30, b=20))
st.plotly_chart(fig_eq, width="stretch")

st.markdown('<div class="section-title">Synthèse opérationnelle</div>', unsafe_allow_html=True)

summary_display = summary.copy()
summary_display["availability_percent"] = (
    summary_display["active_sites"] / summary_display["nb_sites"] * 100
).round(2)

st.dataframe(summary_display, width="stretch", hide_index=True)