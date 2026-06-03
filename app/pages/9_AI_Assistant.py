import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

import streamlit as st

from app.components.navbar import hide_default_sidebar_nav, render_navbar
from app.components.sidebar_filters import render_sidebar_filters, sql_in
from src.services.data_service import query, SITES_PATH, EQUIPMENT_PATH
from app.utils.styles import inject_global_styles
from app.utils.i18n import _

inject_global_styles()
hide_default_sidebar_nav()
render_navbar("AI Assistant")

filters = render_sidebar_filters()

st.markdown(f'<div class="hero-title">{_("page_ai_title")}</div>', unsafe_allow_html=True)
st.markdown(f'<div class="hero-subtitle" style="margin-bottom: 24px;">{_("page_ai_sub")}</div>', unsafe_allow_html=True)

st.markdown('<div class="content-card">', unsafe_allow_html=True)
question = st.chat_input("Posez une question sur les sites, équipements ou changements...")

if question:
    st.chat_message("user").write(question)

    q = question.lower()

    if "bloqué" in q or "blocked" in q:
        result = query(f"""
        SELECT snapshot_date, site_id, site_name, ip_address, sw_version
        FROM read_parquet('{SITES_PATH}')
        WHERE LOWER(site_state) = 'blocked'
        ORDER BY snapshot_date DESC, site_id
        LIMIT 50
        """)
        st.chat_message("assistant").write("Voici les sites bloqués détectés :")
        st.dataframe(result, width="stretch", hide_index=True)

    elif "rmod" in q:
        result = query(f"""
        SELECT snapshot_date, site_id, object_type, serial_number, product_code, product_name
        FROM read_parquet('{EQUIPMENT_PATH}')
        WHERE object_type = 'RMOD'
        LIMIT 100
        """)
        st.chat_message("assistant").write("Voici un échantillon des équipements RMOD :")
        st.dataframe(result, width="stretch", hide_index=True)

    elif "serial" in q:
        result = query(f"""
        SELECT serial_number, COUNT(*) AS occurrences
        FROM read_parquet('{EQUIPMENT_PATH}')
        WHERE serial_number IS NOT NULL
        GROUP BY serial_number
        HAVING COUNT(*) > 1
        ORDER BY occurrences DESC
        LIMIT 50
        """)
        st.chat_message("assistant").write("Voici les numéros de série répétés :")
        st.dataframe(result, width="stretch", hide_index=True)

    else:
        st.chat_message("assistant").write(
            "Je peux répondre pour l’instant aux questions sur : sites bloqués, RMOD, serial numbers répétés."
        )
else:
    st.info("Exemples :\n\n- Quels sont les sites bloqués ?\n- Affiche les RMOD\n- Quels serial numbers sont répétés ?")
st.markdown('</div>', unsafe_allow_html=True)