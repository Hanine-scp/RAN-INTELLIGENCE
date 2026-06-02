import streamlit as st

from src.services.data_service import query, SITES_PATH, EQUIPMENT_PATH

st.set_page_config(page_title="Assistant IA RAN", page_icon="🤖", layout="wide")

st.title("Assistant IA RAN")
st.caption("Assistant intelligent basé sur les données Nokia traitées")

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