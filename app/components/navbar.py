import re
import urllib.parse
import streamlit as st
from app.utils.i18n import _


def hide_default_sidebar_nav():
    st.markdown(
        """
        <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        /* Hide the default Streamlit sidebar navigation */
        [data-testid="stSidebarNav"] {
            display: none;
        }

        /* ── Navbar container ────────────────────────────────────────────── */
        /* Flows inside the normal Streamlit block — no fixed/sticky,
           so it never escapes the content column and never triggers
           horizontal scroll. */
        .nav-bar {
            display: flex;
            flex-direction: row;
            flex-wrap: wrap;             /* wraps gracefully on narrow screens  */
            align-items: center;
            justify-content: center;
            gap: 4px;
            width: 100%;               /* fills exactly the content column     */
            box-sizing: border-box;
            padding: 6px;
            border-radius: 16px;
            background: #ffffff;
            border: 1px solid #e5e7eb;
            box-shadow: 0 2px 12px rgba(0,0,0,0.06);
            font-family: 'Inter', sans-serif;
            margin-bottom: 28px;
        }

        /* ── Every link ──────────────────────────────────────────────────── */
        /* !important is required to override Streamlit's default blue/underline */
        div[data-testid="stMarkdownContainer"] .nav-bar a.nav-link {
            display: inline-flex  !important;
            align-items: center   !important;
            justify-content: center !important;
            white-space: nowrap   !important;
            font-family: 'Inter', sans-serif !important;
            font-size: 13.5px    !important;
            font-weight: 600     !important;
            color: #4b5563       !important;
            text-decoration: none !important;
            padding: 9px 16px    !important;
            border-radius: 10px  !important;
            border: 1px solid transparent !important;
            background: transparent !important;
            transition: color 0.18s ease,
                        background 0.18s ease,
                        box-shadow 0.18s ease,
                        transform  0.18s ease !important;
            cursor: pointer !important;
        }

        /* ── Hover state ─────────────────────────────────────────────────── */
        div[data-testid="stMarkdownContainer"] .nav-bar a.nav-link:hover {
            color: #111827       !important;
            background: #f3f4f6 !important;
            transform: translateY(-1px) !important;
        }

        /* ── Active state ────────────────────────────────────────────────── */
        div[data-testid="stMarkdownContainer"] .nav-bar a.nav-link.is-active {
            color: #eb1019          !important;
            background: #fff1f2    !important;
            border-color: #fecaca  !important;
            font-weight: 700       !important;
            box-shadow: 0 2px 8px rgba(235, 16, 25, 0.12) !important;
        }

        div[data-testid="stMarkdownContainer"] .nav-bar a.nav-link.is-active:hover {
            transform: none !important;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def _page_url(path: str) -> str:
    """Convert an app-relative file path to its Streamlit URL."""
    if path == "main.py":
        return "/"
    filename = path.split("/")[-1].replace(".py", "")
    page_name = re.sub(r"^\d+_", "", filename)   # strip numeric prefix
    return "/" + urllib.parse.quote(page_name)


def render_navbar(active_page: str):
    pages = {
        _("nav_home"):        "main.py",
        _("nav_sites"):       "pages/2_Sites.py",
        _("nav_inventory"):   "pages/3_Inventaire.py",
        _("nav_delta"):       "pages/4_Delta.py",
        _("nav_stats"):       "pages/5_Statistiques.py",
        _("nav_prediction"):  "pages/6_Prediction.py",
        _("nav_delta_intel"): "pages/7_Delta_Intelligence.py",
        _("nav_analytics"):   "pages/8_Analytics.py",
        _("nav_ai"):          "pages/9_AI_Assistant.py",
    }

    key_map = {
        "Accueil":          _("nav_home"),
        "Sites":            _("nav_sites"),
        "Inventaire":       _("nav_inventory"),
        "Delta":            _("nav_delta"),
        "Statistiques":     _("nav_stats"),
        "Prediction":       _("nav_prediction"),
        "Delta Intelligence": _("nav_delta_intel"),
        "Analytics":        _("nav_analytics"),
        "AI Assistant":     _("nav_ai"),
    }
    active_label = key_map.get(active_page, active_page)

    links = []
    for label, path in pages.items():
        url = _page_url(path)
        extra = " is-active" if label == active_label else ""
        links.append(
            f'<a href="{url}" target="_self" class="nav-link{extra}">{label}</a>'
        )

    html = '<div class="nav-bar">' + "".join(links) + "</div>"
    st.markdown(html, unsafe_allow_html=True)