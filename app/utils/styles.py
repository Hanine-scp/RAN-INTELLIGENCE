import streamlit as st

def inject_global_styles():
    st.markdown(
        """
        <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        /* Base Typography and Layout */
        .block-container {
            padding-top: 1rem;
            padding-left: 2.5rem;
            padding-right: 2.5rem;
            font-family: 'Inter', sans-serif;
            background-color: #FFFFFF;
        }

        /* Hero Section */
        .hero {
            background: linear-gradient(135deg, #ffffff 0%, #fffafa 100%);
            border: 1px solid #e5e7eb;
            border-radius: 26px;
            padding: 32px 40px;
            margin-bottom: 24px;
            box-shadow: 0 14px 38px rgba(17,24,39,0.06);
            display: flex;
            flex-direction: column;
            align-items: flex-start;
        }
        .hero-logo-container {
            margin-bottom: 20px;
        }
        .hero-logo-container img {
            max-height: 48px;
            width: auto;
        }
        .hero-title {
            font-size: 42px;
            font-weight: 900;
            color: #111827;
            letter-spacing: -0.5px;
        }
        .hero-subtitle {
            color: #6b7280;
            font-size: 16px;
            font-weight: 500;
            margin-top: 8px;
        }
        .badge {
            display: inline-block;
            background: #fffafa;
            color: #eb1019;
            border: 1px solid #ffb3b3;
            padding: 7px 14px;
            border-radius: 999px;
            font-size: 13px;
            font-weight: 800;
            margin-top: 18px;
            box-shadow: 0 4px 10px rgba(235, 16, 25, 0.05);
        }

        /* KPI Cards */
        .kpi-card {
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-left: 6px solid #eb1019;
            border-radius: 20px;
            padding: 20px;
            box-shadow: 0 12px 30px rgba(17,24,39,0.05);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            height: 100%;
        }
        .kpi-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 20px 40px rgba(235, 16, 25, 0.1);
        }
        .kpi-label {
            color: #6b7280;
            font-size: 12px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .kpi-value {
            color: #111827;
            font-size: 34px;
            font-weight: 900;
            margin-top: 12px;
            letter-spacing: -0.5px;
        }
        .kpi-sub {
            color: #6b7280;
            font-size: 13px;
            font-weight: 500;
            margin-top: 8px;
        }

        /* General UI Elements */
        .section-title {
            font-size: 21px;
            font-weight: 900;
            color: #111827;
            margin: 18px 0 12px 0;
            letter-spacing: -0.3px;
        }

        .content-card {
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.03);
        }

        /* Streamlit Overrides */
        div[data-testid="stMetricValue"] {
            color: #eb1019;
        }
        
        .stButton>button {
            background-color: #eb1019 !important;
            color: white !important;
            border-radius: 8px !important;
            border: none !important;
            font-weight: 600 !important;
        }
        .stButton>button:hover {
            background-color: #ba0d14 !important;
            box-shadow: 0 4px 10px rgba(235, 16, 25, 0.2) !important;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

def kpi(label, value, sub):
    st.markdown(
        f'''
        <div class="kpi-card">
            <div class="kpi-label">{label}</div>
            <div class="kpi-value">{value}</div>
            <div class="kpi-sub">{sub}</div>
        </div>
        ''',
        unsafe_allow_html=True,
    )
