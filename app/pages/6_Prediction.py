import sys
from pathlib import Path

import streamlit as st
import plotly.express as px

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from src.services.data_service import query, EQUIPMENT_PATH

st.set_page_config(page_title="Prediction", page_icon="🔮", layout="wide")

st.title("Prediction & Spare Forecasting")
st.caption("Préparation de la prédiction des besoins en pièces de rechange")

df = query(f"""
SELECT
    object_type,
    SUM(nb_equipment) AS installed_base,
    COUNT(DISTINCT serial_number) AS unique_serials
FROM read_parquet('{EQUIPMENT_PATH}')
GROUP BY object_type
ORDER BY installed_base DESC
""")

df["risk_score"] = (df["installed_base"] / df["installed_base"].max() * 100).round(2)
df["estimated_spares_30d"] = (df["installed_base"] * 0.02).round(0).astype(int)

st.subheader("Score de risque par type d’équipement")

fig = px.bar(df, x="object_type", y="risk_score", title="Risk Score")
st.plotly_chart(fig, width="stretch")

st.subheader("Dimensionnement prévisionnel des spares")

st.dataframe(
    df[["object_type", "installed_base", "unique_serials", "risk_score", "estimated_spares_30d"]],
    width="stretch",
    hide_index=True,
)