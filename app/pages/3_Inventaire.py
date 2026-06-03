import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

import streamlit as st

from app.components.navbar import hide_default_sidebar_nav, render_navbar
from app.components.sidebar_filters import render_sidebar_filters
from src.services.data_service import get_object_types, get_equipment
from app.utils.styles import inject_global_styles
from app.utils.i18n import _

inject_global_styles()
hide_default_sidebar_nav()
render_navbar("Inventaire")

filters = render_sidebar_filters()
effective_dates = filters["effective_dates"]

if not effective_dates:
    st.warning(_("warning_dates"))
    st.stop()

selected_date = sorted(effective_dates)[-1]

st.markdown(f'<div class="hero-title">{_("page_inv_title")}</div>', unsafe_allow_html=True)
st.markdown(f'<div class="hero-subtitle" style="margin-bottom: 24px;">{_("page_inv_sub")}</div>', unsafe_allow_html=True)

object_types = get_object_types(selected_date)

st.markdown('<div class="content-card">', unsafe_allow_html=True)
selected_objects = st.multiselect("Type équipement", object_types)
df = get_equipment(selected_date, selected_objects)
st.dataframe(df, width="stretch", hide_index=True)
st.markdown('</div>', unsafe_allow_html=True)