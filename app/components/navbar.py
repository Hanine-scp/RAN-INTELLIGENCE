import streamlit as st
from app.utils.i18n import _

def hide_default_sidebar_nav():
    st.markdown(
        """
        <style>
        [data-testid="stSidebarNav"] {
            display: none;
        }

        .navbar-wrapper {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 18px;
            padding: 14px 0 22px 0;
            margin-bottom: 24px;
            border-bottom: 1px solid #f3f4f6;
            overflow-x: auto;
            white-space: nowrap;
            font-family: 'Inter', sans-serif;
        }

        .navbar-item {
            font-size: 15px;
            font-weight: 700;
            color: #4b5563;
            text-decoration: none;
            padding: 10px 18px;
            border-radius: 999px;
            transition: all 0.2s ease-in-out;
            background: transparent;
        }

        .navbar-item:hover {
            color: #eb1019;
            background: #fff1f2;
            transform: translateY(-1px);
        }

        .navbar-active {
            font-size: 15px;
            font-weight: 800;
            color: #ffffff;
            padding: 10px 18px;
            background: #eb1019;
            border-radius: 999px;
            transition: all 0.2s ease-in-out;
            box-shadow: 0 4px 10px rgba(235, 16, 25, 0.2);
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def render_navbar(active_page: str):
    pages = {
        _("nav_home"): "main.py",
        _("nav_sites"): "pages/2_Sites.py",
        _("nav_inventory"): "pages/3_Inventaire.py",
        _("nav_delta"): "pages/4_Delta.py",
        _("nav_stats"): "pages/5_Statistiques.py",
        _("nav_prediction"): "pages/6_Prediction.py",
        _("nav_delta_intel"): "pages/7_Delta_Intelligence.py",
        _("nav_analytics"): "pages/8_Analytics.py",
        _("nav_ai"): "pages/9_AI_Assistant.py",
    }

    # Map the old hardcoded active_page to the translated one
    # If active_page is a key like "Accueil", map it:
    active_mapping = {
        "Accueil": _("nav_home"),
        "Sites": _("nav_sites"),
        "Inventaire": _("nav_inventory"),
        "Delta": _("nav_delta"),
        "Statistiques": _("nav_stats"),
        "Prediction": _("nav_prediction"),
        "Delta Intelligence": _("nav_delta_intel"),
        "Analytics": _("nav_analytics"),
        "AI Assistant": _("nav_ai")
    }
    translated_active_page = active_mapping.get(active_page, active_page)

    st.markdown('<div class="navbar-wrapper">', unsafe_allow_html=True)

    cols = st.columns(len(pages), gap="small")

    for col, (label, path) in zip(cols, pages.items()):
        with col:
            if label == translated_active_page:
                st.markdown(
                    f'<div class="navbar-active">{label}</div>',
                    unsafe_allow_html=True,
                )
            else:
                st.page_link(path, label=label)

    st.markdown('</div>', unsafe_allow_html=True)