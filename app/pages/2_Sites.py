import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

import streamlit as st

st.set_page_config(page_title="Sites — RAN Intelligence", page_icon="📡", layout="wide")

from app.components.navbar import hide_default_sidebar_nav, render_navbar
from app.components.sidebar_filters import render_sidebar_filters
from src.services.data_service import get_sites
from app.utils.styles import inject_global_styles
from app.utils.i18n import _

inject_global_styles()
hide_default_sidebar_nav()
render_navbar("Sites")

filters = render_sidebar_filters()
effective_dates = filters["effective_dates"]

if not effective_dates:
    st.warning(_("warning_dates"))
    st.stop()

selected_date = sorted(effective_dates)[-1]
search = filters["site_search"]

st.markdown(f'<div class="hero-title">{_("page_sites_title")}</div>', unsafe_allow_html=True)
st.markdown(f'<div class="hero-subtitle" style="margin-bottom: 24px;">{_("page_sites_sub")}</div>', unsafe_allow_html=True)

df = get_sites(selected_date, search)

st.markdown('<div class="content-card">', unsafe_allow_html=True)
st.dataframe(df, width="stretch", hide_index=True)
st.markdown('</div>', unsafe_allow_html=True)