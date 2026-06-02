from pathlib import Path

import duckdb
import pandas as pd
import plotly.express as px
import streamlit as st

st.set_page_config(
    page_title="RAN Intelligence Platform",
    page_icon="📡",
    layout="wide",
    initial_sidebar_state="expanded",
)

SITES_PATH = "data/lake/sites/*.parquet"
EQUIPMENT_PATH = "data/lake/equipment/*.parquet"
DELTA_PATH = "data/lake/delta/delta_metrics.parquet"
SITE_CHANGES_PATH = "data/lake/site_changes/site_changes.parquet"

st.markdown("""
<style>
.stApp { background: #ffffff; }
.block-container { padding-top: 1rem; max-width: 100%; }
h1, h2, h3 { color: #111827; }
section[data-testid="stSidebar"] {
    background: #ffffff;
    border-right: 1px solid #e5e7eb;
}
.metric-card {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-left: 5px solid #b91c1c;
    border-radius: 16px;
    padding: 18px;
    box-shadow: 0 8px 22px rgba(0,0,0,0.04);
}
.card-title {
    color: #6b7280;
    font-size: 13px;
    font-weight: 700;
}
.card-value {
    color: #111827;
    font-size: 32px;
    font-weight: 900;
}
</style>
""", unsafe_allow_html=True)


def lake_ready() -> bool:
    return Path("data/lake/sites").exists() and any(Path("data/lake/sites").glob("*.parquet"))


@st.cache_data(show_spinner=False)
def query(sql: str) -> pd.DataFrame:
    return duckdb.query(sql).to_df()


def metric_card(title: str, value: str):
    st.markdown(
        f"""
        <div class="metric-card">
            <div class="card-title">{title}</div>
            <div class="card-value">{value}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


TEXT = {
    "Français": {
        "title": "RAN Intelligence Platform",
        "subtitle": "Plateforme intelligente de suivi RAN, inventaire, delta et prédiction",
        "overview": "Vue générale",
        "sites": "Sites",
        "inventory": "Inventaire",
        "delta": "Delta",
        "quality": "Qualité",
        "total_sites": "Sites",
        "active_sites": "Sites actifs",
        "blocked_sites": "Sites bloqués",
        "equipment": "Équipements",
        "date": "Date",
    },
    "English": {
        "title": "RAN Intelligence Platform",
        "subtitle": "Intelligent RAN monitoring, inventory, delta and prediction platform",
        "overview": "Overview",
        "sites": "Sites",
        "inventory": "Inventory",
        "delta": "Delta",
        "quality": "Quality",
        "total_sites": "Sites",
        "active_sites": "Active sites",
        "blocked_sites": "Blocked sites",
        "equipment": "Equipment",
        "date": "Date",
    },
}


with st.sidebar:
    st.markdown("## RAN Intelligence Platform")
    lang = st.selectbox("Langue / Language", ["Français", "English"])
    t = TEXT[lang]

    page = st.radio(
        "Navigation",
        [t["overview"], t["sites"], t["inventory"], t["delta"], t["quality"]],
    )

if not lake_ready():
    st.error("Aucune donnée trouvée. Lance d’abord le pipeline Nokia.")
    st.code(
        'python pipeline\\main_pipeline.py --root . --source-root "C:\\Users\\espace info\\OneDrive - ESPRIT\\Bureau\\DATA.XML" --max-workers 2 --no-recursive-xml',
        language="powershell",
    )
    st.stop()

st.markdown(f"<h1>{t['title']}</h1>", unsafe_allow_html=True)
st.caption(t["subtitle"])

dates = query(f"""
SELECT DISTINCT CAST(snapshot_date AS VARCHAR) AS snapshot_date
FROM read_parquet('{SITES_PATH}')
ORDER BY snapshot_date DESC
""")["snapshot_date"].tolist()

selected_date = st.sidebar.selectbox(t["date"], dates)

site_kpi = query(f"""
SELECT
    COUNT(DISTINCT site_id) AS total_sites,
    COALESCE(SUM(CASE WHEN site_state = 'active' THEN 1 ELSE 0 END), 0) AS active_sites,
    COALESCE(SUM(CASE WHEN site_state = 'blocked' THEN 1 ELSE 0 END), 0) AS blocked_sites,
    COALESCE(SUM(nb_cells_2g), 0) AS cells_2g,
    COALESCE(SUM(nb_cells_3g), 0) AS cells_3g,
    COALESCE(SUM(nb_cells_lte_4g), 0) AS cells_4g,
    COALESCE(SUM(nb_cells_5g), 0) AS cells_5g
FROM read_parquet('{SITES_PATH}')
WHERE CAST(snapshot_date AS VARCHAR) = '{selected_date}'
""").iloc[0]

equip_kpi = query(f"""
SELECT COALESCE(SUM(nb_equipment), 0) AS total_equipment
FROM read_parquet('{EQUIPMENT_PATH}')
WHERE CAST(snapshot_date AS VARCHAR) = '{selected_date}'
""").iloc[0]

if page == t["overview"]:
    c1, c2, c3, c4 = st.columns(4)

    with c1:
        metric_card(t["total_sites"], f"{int(site_kpi['total_sites']):,}")
    with c2:
        metric_card(t["active_sites"], f"{int(site_kpi['active_sites']):,}")
    with c3:
        metric_card(t["blocked_sites"], f"{int(site_kpi['blocked_sites']):,}")
    with c4:
        metric_card(t["equipment"], f"{int(equip_kpi['total_equipment']):,}")

    st.divider()

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
        title="Répartition des cellules par technologie",
    )
    st.plotly_chart(fig, width="stretch")

elif page == t["sites"]:
    search = st.text_input("Recherche site / IP / version SW")

    where = f"CAST(snapshot_date AS VARCHAR) = '{selected_date}'"

    if search:
        q = search.replace("'", "''").lower()
        where += f"""
        AND (
            LOWER(CAST(site_id AS VARCHAR)) LIKE '%{q}%'
            OR LOWER(CAST(site_name AS VARCHAR)) LIKE '%{q}%'
            OR LOWER(CAST(ip_address AS VARCHAR)) LIKE '%{q}%'
            OR LOWER(CAST(sw_version AS VARCHAR)) LIKE '%{q}%'
        )
        """

    df_sites = query(f"""
    SELECT
        site_id,
        site_name,
        site_state,
        ip_address,
        sw_version,
        nb_cells,
        technologies,
        source_file
    FROM read_parquet('{SITES_PATH}')
    WHERE {where}
    ORDER BY site_id
    """)

    st.dataframe(df_sites, width="stretch", hide_index=True)

elif page == t["inventory"]:
    object_types = query(f"""
    SELECT DISTINCT object_type
    FROM read_parquet('{EQUIPMENT_PATH}')
    WHERE CAST(snapshot_date AS VARCHAR) = '{selected_date}'
    ORDER BY object_type
    """)["object_type"].tolist()

    selected_objects = st.multiselect("Types équipements", object_types)

    where = f"CAST(snapshot_date AS VARCHAR) = '{selected_date}'"

    if selected_objects:
        values = ", ".join("'" + x.replace("'", "''") + "'" for x in selected_objects)
        where += f" AND object_type IN ({values})"

    df_inv = query(f"""
    SELECT
        site_id,
        object_type,
        id,
        serial_number,
        product_code,
        product_name,
        nb_equipment,
        source_file
    FROM read_parquet('{EQUIPMENT_PATH}')
    WHERE {where}
    ORDER BY site_id, object_type, id
    LIMIT 5000
    """)

    st.dataframe(df_inv, width="stretch", hide_index=True)

elif page == t["delta"]:
    if not Path("data/lake/delta/delta_metrics.parquet").exists():
        st.warning("Aucun delta disponible.")
    else:
        df_delta = query(f"""
        SELECT *
        FROM read_parquet('{DELTA_PATH}')
        ORDER BY metric
        """)

        st.dataframe(df_delta, width="stretch", hide_index=True)

    if Path("data/lake/site_changes/site_changes.parquet").exists():
        st.subheader("Sites ajoutés / supprimés")
        df_changes = query(f"""
        SELECT *
        FROM read_parquet('{SITE_CHANGES_PATH}')
        ORDER BY change_type, site_id
        """)
        st.dataframe(df_changes, width="stretch", hide_index=True)

elif page == t["quality"]:
    df_quality = query("""
    SELECT
        snapshot_date,
        site_id,
        object_type,
        total_rows,
        serial_missing,
        product_code_missing,
        product_name_missing,
        completeness_percent
    FROM read_parquet('data/lake/completeness/*.parquet')
    ORDER BY completeness_percent ASC
    LIMIT 5000
    """)

    st.dataframe(df_quality, width="stretch", hide_index=True)