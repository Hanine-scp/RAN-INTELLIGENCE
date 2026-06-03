import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

import pandas as pd
import plotly.express as px
import streamlit as st

from app.components.navbar import hide_default_sidebar_nav, render_navbar
from src.services.data_service import get_snapshot_dates, get_site_kpis, get_equipment_kpis

hide_default_sidebar_nav()
render_navbar("Accueil")

st.title("Accueil")
st.caption("Vue exécutive de la plateforme RAN Intelligence Platform")

dates = get_snapshot_dates()
selected_date = st.selectbox("Date", dates)

site_kpi = get_site_kpis(selected_date)
equip_kpi = get_equipment_kpis(selected_date)

c1, c2, c3, c4 = st.columns(4)

c1.metric("Sites", int(site_kpi["total_sites"]))
c2.metric("Sites actifs", int(site_kpi["active_sites"]))
c3.metric("Sites bloqués", int(site_kpi["blocked_sites"]))
c4.metric("Équipements", int(equip_kpi["total_equipment"]))

tech_df = pd.DataFrame({
    "Technologie": ["2G", "3G", "4G", "5G"],
    "Cellules": [
        int(site_kpi["cells_2g"]),
        int(site_kpi["cells_3g"]),
        int(site_kpi["cells_4g"]),
        int(site_kpi["cells_5g"]),
    ],
})

fig = px.bar(
    tech_df,
    x="Technologie",
    y="Cellules",
    title="Répartition des cellules",
)

st.plotly_chart(fig, width="stretch")