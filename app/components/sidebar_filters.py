import sys
from pathlib import Path

import streamlit as st

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from src.services.data_service import query, SITES_PATH
from app.utils.image_utils import get_base64_image
from app.utils.i18n import _


def sql_in(values):
    if not values:
        return "('')"

    return "(" + ", ".join("'" + str(v).replace("'", "''") + "'" for v in values) + ")"


def render_sidebar_filters():
    st.sidebar.markdown(
        """
        <style>
        section[data-testid="stSidebar"] {
            background: #ffffff;
            border-right: 1px solid #e5e7eb;
            font-family: 'Inter', sans-serif;
        }

        .sidebar-logo-container {
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 10px 0;
            margin-bottom: 20px;
        }

        .sidebar-logo-container img {
            max-width: 160px;
            height: auto;
        }

        .control-header {
            background: linear-gradient(135deg, #eb1019 0%, #ba0d14 100%);
            padding: 18px 16px;
            border-radius: 18px;
            margin-bottom: 18px;
            color: white;
            box-shadow: 0 8px 20px rgba(235, 16, 25, 0.15);
        }

        .control-title {
            font-size: 21px;
            font-weight: 900;
            margin-bottom: 4px;
        }

        .control-subtitle {
            font-size: 12px;
            opacity: 0.9;
        }

        .status-card {
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-left: 4px solid #eb1019;
            border-radius: 12px;
            padding: 14px;
            margin-bottom: 16px;
            font-size: 13px;
            color: #374151;
            line-height: 1.8;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.03);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        
        .status-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 15px rgba(235, 16, 25, 0.08);
        }

        .section-title {
            font-size: 11px;
            font-weight: 900;
            color: #eb1019;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-top: 18px;
            margin-bottom: 8px;
        }

        .selection-summary {
            background: #fffafa;
            border: 1px solid #fecaca;
            border-radius: 12px;
            padding: 14px;
            margin-top: 14px;
            font-size: 13px;
            color: #374151;
            line-height: 1.8;
            box-shadow: 0 4px 10px rgba(235, 16, 25, 0.05);
        }

        .summary-number {
            color: #eb1019;
            font-weight: 900;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    dates_df = query(f"""
        SELECT DISTINCT CAST(snapshot_date AS VARCHAR) AS snapshot_date
        FROM read_parquet('{SITES_PATH}')
        ORDER BY snapshot_date DESC
    """)

    date_options = dates_df["snapshot_date"].dropna().astype(str).tolist()

    total_sites_df = query(f"""
        SELECT COUNT(DISTINCT CAST(site_id AS VARCHAR) || '-' || CAST(snapshot_date AS VARCHAR)) AS total_sites
        FROM read_parquet('{SITES_PATH}')
    """)

    total_xml_df = query(f"""
        SELECT COUNT(DISTINCT CAST(source_file AS VARCHAR) || '-' || CAST(snapshot_date AS VARCHAR)) AS total_xml
        FROM read_parquet('{SITES_PATH}')
    """)

    total_sites = int(total_sites_df.iloc[0]["total_sites"])
    total_xml = int(total_xml_df.iloc[0]["total_xml"])

    logo_base64 = get_base64_image("c:/projects/RAN-INTELLIGENCE/Ooredoo_logo_2017.png")
    if logo_base64:
        st.sidebar.markdown(
            f"""
            <div class="sidebar-logo-container">
                <img src="data:image/png;base64,{logo_base64}" alt="Ooredoo Logo">
            </div>
            """,
            unsafe_allow_html=True,
        )

    st.sidebar.markdown(
        f"""
        <div class="control-header">
            <div class="control-title">{_('sidebar_title')}</div>
            <div class="control-subtitle">{_('sidebar_subtitle')}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.sidebar.markdown(
        f"""
        <div class="status-card">
            <b>● {_('sidebar_datalake')} :</b> OK<br>
            <b>{_('sidebar_snapshots')} :</b> {len(date_options)}<br>
            <b>{_('sidebar_indexed_xml')} :</b> {total_xml:,}<br>
            <b>{_('sidebar_indexed_sites')} :</b> {total_sites:,}
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.sidebar.markdown(f'<div class="section-title">{_("sidebar_lang")}</div>', unsafe_allow_html=True)

    # Note: Streamlit re-runs immediately when language changes because of the 'key' param
    language = st.sidebar.radio(
        "Langue / Language",
        ["Français", "English"],
        horizontal=True,
        label_visibility="collapsed",
        key="language",
    )

    st.sidebar.markdown(f'<div class="section-title">{_("sidebar_dates")}</div>', unsafe_allow_html=True)

    select_all_dates = st.sidebar.checkbox(
        _("sidebar_dates_all"),
        value=False,
        key="filter_all_dates",
    )

    if select_all_dates:
        selected_dates = date_options
    else:
        selected_dates = st.sidebar.multiselect(
            _("sidebar_snapshots"),
            options=date_options,
            default=date_options[:1] if date_options else [],
            placeholder=_("sidebar_dates_ph"),
            key="filter_dates",
        )

    st.sidebar.caption(f"{len(selected_dates)} date(s)")

    st.sidebar.markdown(f'<div class="section-title">{_("sidebar_xml")}</div>', unsafe_allow_html=True)

    if selected_dates:
        files_df = query(f"""
            SELECT DISTINCT
                CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                CAST(source_file AS VARCHAR) AS source_file,
                CAST(snapshot_date AS VARCHAR) || ' | ' || CAST(source_file AS VARCHAR) AS file_key
            FROM read_parquet('{SITES_PATH}')
            WHERE CAST(snapshot_date AS VARCHAR) IN {sql_in(selected_dates)}
            ORDER BY snapshot_date DESC, source_file
        """)
    else:
        files_df = None

    file_options = (
        files_df["file_key"].dropna().astype(str).tolist()
        if files_df is not None and not files_df.empty
        else []
    )

    select_all_files = st.sidebar.checkbox(
        _("sidebar_xml_all"),
        value=False,
        key="filter_all_files",
        disabled=not file_options,
    )

    if select_all_files:
        selected_file_keys = file_options
    else:
        selected_file_keys = st.sidebar.multiselect(
            _("sidebar_xml"),
            options=file_options,
            default=[],
            placeholder=_("sidebar_xml_ph"),
            key="filter_files",
            disabled=not file_options,
        )

    selected_files = []
    selected_file_dates = []

    if selected_file_keys and files_df is not None:
        selected_files_df = files_df[files_df["file_key"].isin(selected_file_keys)]
        selected_files = selected_files_df["source_file"].astype(str).unique().tolist()
        selected_file_dates = selected_files_df["snapshot_date"].astype(str).unique().tolist()

    st.sidebar.caption(f"{len(selected_file_keys)} XML")

    st.sidebar.markdown(f'<div class="section-title">{_("sidebar_search")}</div>', unsafe_allow_html=True)

    date_search = st.sidebar.text_input(
        _("summary_search_date"),
        placeholder=_("sidebar_search_date_ph"),
        key="filter_date_search",
    )

    site_search = st.sidebar.text_input(
        _("summary_search_site"),
        placeholder=_("sidebar_search_site_ph"),
        key="filter_site_search",
    )

    effective_dates = selected_file_dates or selected_dates

    if date_search:
        effective_dates = [
            d for d in effective_dates
            if date_search.lower() in str(d).lower()
        ]

    st.sidebar.markdown(f'<div class="section-title">{_("sidebar_sites_title")}</div>', unsafe_allow_html=True)

    if selected_files and effective_dates:
        search_clause = ""

        if site_search:
            q = site_search.replace("'", "''").lower()
            search_clause = f"""
            AND (
                LOWER(CAST(site_id AS VARCHAR)) LIKE '%{q}%'
                OR LOWER(CAST(site_name AS VARCHAR)) LIKE '%{q}%'
                OR LOWER(CAST(ip_address AS VARCHAR)) LIKE '%{q}%'
                OR LOWER(CAST(sw_version AS VARCHAR)) LIKE '%{q}%'
            )
            """

        sites_df = query(f"""
            SELECT DISTINCT
                CAST(snapshot_date AS VARCHAR) AS snapshot_date,
                CAST(source_file AS VARCHAR) AS source_file,
                CAST(site_id AS VARCHAR) AS site_id,
                COALESCE(CAST(site_name AS VARCHAR), '') AS site_name,
                COALESCE(CAST(ip_address AS VARCHAR), '') AS ip_address,
                CAST(snapshot_date AS VARCHAR) || ' | ' ||
                CAST(site_id AS VARCHAR) || ' | ' ||
                COALESCE(CAST(site_name AS VARCHAR), '') AS site_key
            FROM read_parquet('{SITES_PATH}')
            WHERE CAST(snapshot_date AS VARCHAR) IN {sql_in(effective_dates)}
            AND CAST(source_file AS VARCHAR) IN {sql_in(selected_files)}
            {search_clause}
            ORDER BY snapshot_date DESC, site_id
        """)
    else:
        sites_df = None

    site_options = (
        sites_df["site_key"].dropna().astype(str).tolist()
        if sites_df is not None and not sites_df.empty
        else []
    )

    select_all_sites = st.sidebar.checkbox(
        _("sidebar_sites_all"),
        value=False,
        key="filter_all_sites",
        disabled=not site_options,
    )

    if select_all_sites:
        selected_site_keys = site_options
    else:
        selected_site_keys = st.sidebar.multiselect(
            _("sidebar_sites_title"),
            options=site_options,
            default=[],
            placeholder=_("sidebar_sites_ph"),
            key="filter_sites",
            disabled=not site_options,
        )

    selected_sites = []

    if selected_site_keys and sites_df is not None:
        selected_sites_df = sites_df[sites_df["site_key"].isin(selected_site_keys)]
        selected_sites = selected_sites_df["site_id"].astype(str).unique().tolist()

    st.sidebar.caption(f"{len(selected_sites)} site(s)")

    st.sidebar.markdown(f'<div class="section-title">{_("sidebar_summary")}</div>', unsafe_allow_html=True)

    st.sidebar.markdown(
        f"""
        <div class="selection-summary">
            <b>{_('summary_lang')} :</b> {language}<br>
            <b>{_('summary_dates')} :</b> <span class="summary-number">{len(selected_dates)}</span><br>
            <b>{_('summary_xml')} :</b> <span class="summary-number">{len(selected_file_keys)}</span><br>
            <b>{_('summary_sites')} :</b> <span class="summary-number">{len(selected_sites)}</span><br>
            <b>{_('summary_search_date')} :</b> {date_search if date_search else _('none')}<br>
            <b>{_('summary_search_site')} :</b> {site_search if site_search else _('none')}
        </div>
        """,
        unsafe_allow_html=True,
    )

    return {
        "language": language,
        "selected_dates": selected_dates,
        "selected_files": selected_files,
        "selected_sites": selected_sites,
        "selected_file_dates": selected_file_dates,
        "effective_dates": effective_dates,
        "site_search": site_search,
        "date_search": date_search,
        "select_all_dates": select_all_dates,
        "select_all_files": select_all_files,
        "select_all_sites": select_all_sites,
    }