import streamlit as st
import plotly.express as px

from src.services.data_service import query, SITES_PATH, EQUIPMENT_PATH

st.set_page_config(page_title="Analytics", page_icon="📊", layout="wide")

st.title("Analytics RAN")
st.caption("Evolution des sites, cellules et équipements par date")

summary = query(f"""
SELECT
    CAST(snapshot_date AS VARCHAR) AS snapshot_date,
    COUNT(DISTINCT site_id) AS nb_sites,
    SUM(nb_cells_2g) AS cells_2g,
    SUM(nb_cells_3g) AS cells_3g,
    SUM(nb_cells_lte_4g) AS cells_4g,
    SUM(nb_cells_5g) AS cells_5g
FROM read_parquet('{SITES_PATH}')
GROUP BY snapshot_date
ORDER BY snapshot_date
""")

equipment = query(f"""
SELECT
    CAST(snapshot_date AS VARCHAR) AS snapshot_date,
    object_type,
    SUM(nb_equipment) AS equipment_count
FROM read_parquet('{EQUIPMENT_PATH}')
GROUP BY snapshot_date, object_type
ORDER BY snapshot_date, object_type
""")

st.subheader("Evolution du nombre de sites")
fig_sites = px.line(summary, x="snapshot_date", y="nb_sites", markers=True)
st.plotly_chart(fig_sites, width="stretch")

st.subheader("Evolution des cellules par technologie")
cells = summary.melt(
    id_vars=["snapshot_date"],
    value_vars=["cells_2g", "cells_3g", "cells_4g", "cells_5g"],
    var_name="technology",
    value_name="cells",
)
fig_cells = px.bar(cells, x="snapshot_date", y="cells", color="technology", barmode="group")
st.plotly_chart(fig_cells, width="stretch")

st.subheader("Distribution des équipements")
fig_eq = px.bar(equipment, x="snapshot_date", y="equipment_count", color="object_type", barmode="group")
st.plotly_chart(fig_eq, width="stretch")