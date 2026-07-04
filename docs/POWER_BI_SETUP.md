# Intégration Power BI — RAN Intelligence

Guide étape par étape pour connecter un dashboard Power BI aux données traitées par la plateforme.

## Vue d'ensemble

```
XML Nokia → Pipeline → data/processed/*.csv
                           ↓ (auto-sync)
              data/exports/powerbi/
                ├── raw/           ← copies pipeline (audit)
                ├── dimensions/    ← star-schema (dim_date, dim_site, …)
                ├── facts/         ← KPI, qualité, anomalies, risques
                ├── bridge/        ← périodes de comparaison
                └── model/         ← powerbi_model.json (relations + pages)
                           ↓
              Power BI Desktop → Service → iframe dans /power-bi
```

---

## Étape 1 — Vérifier les données exportées

Après chaque ingestion snapshot, le pipeline copie et enrichit automatiquement les CSV vers :

```
C:\projects\RAN-INTELLIGENCE\data\exports\powerbi\
```

### Structure décisionnelle (v2)

| Dossier | Fichiers clés | Usage Power BI |
|---------|---------------|----------------|
| `dimensions/` | `dim_date`, `dim_period`, `dim_metric`, `dim_site`, `dim_severity` | Filtres et relations |
| `facts/` | **`fact_kpi.csv`** | Tous les KPI (snapshot, delta, techno, équipement, executive, spares) — format long |
| `facts/` | **`fact_signals.csv`** | Qualité, anomalies, risques, changements — format unifié |
| `bridge/` | `bridge_snapshot_period` | Périodes J-1/J |
| `model/` | `powerbi_model.json` | Relations, 6 pages recommandées, mesures DAX |
| `raw/` | 8 CSV pipeline | Couche analyste (inventaire complet) |

Fichiers legacy à la racine (`platform_delta_comparison.csv`, etc.) conservés pour compatibilité.

Sync manuelle (admin) :

```powershell
curl -X POST http://127.0.0.1:8010/integrations/powerbi/sync -H "Authorization: Bearer <token>"
```

Ou depuis l'UI : page **Power BI** → bouton **Synchroniser maintenant**.

---

## Étape 2 — Power BI Desktop

1. Télécharger [Power BI Desktop](https://powerbi.microsoft.com/desktop/)
2. **Obtenir des données** → **Texte/CSV**
3. Charger les dossiers `dimensions/` et `facts/` depuis `data/exports/powerbi/`
4. Consulter `model/powerbi_model.json` pour les relations et pages recommandées
5. Appliquer le thème Ooredoo : `docs/powerbi/ooredoo-ran-theme.json`

### Modèle de données suggéré

```
dim_date ──┬── fact_kpi ── dim_period / dim_metric
           └── fact_signals ── dim_site / dim_severity / dim_anomaly_type
```

**2 tables de faits seulement** — filtrer par `kpi_scope` ou `signal_type` dans Power BI.

### Mesures DAX (exemples)

```dax
Valeur KPI = SUM(fact_kpi[value])
Delta sites = CALCULATE(SUM(fact_kpi[delta]), fact_kpi[kpi_scope] = "delta", fact_kpi[metric_name] = "added_sites")
Anomalies critiques = CALCULATE(COUNTROWS(fact_signals), fact_signals[signal_type] = "anomaly", fact_signals[severity] = "critical")
Score qualité = CALCULATE(AVERAGE(fact_signals[score]), fact_signals[signal_type] = "quality")
```

### Pages recommandées (voir `powerbi_model.json`)

1. **Executive — Vue direction** — KPI globaux, disponibilité, alertes
2. **Delta & Évolutions** — comparaisons inter-snapshots
3. **Qualité des données** — complétude, risk_score, heatmap sites
4. **Anomalies & Signaux** — règles plateforme + moteur Guardian
5. **Prédictions & Risques** — spares, risk_predictions, change events
6. **Patrimoine réseau** — équipements, technologies, sites

---

## Étape 3 — Publier sur Power BI Service

1. **Accueil** → **Publier** → choisir un workspace
2. Ouvrir le rapport sur [app.powerbi.com](https://app.powerbi.com)
3. Copier l'URL du rapport

Pour l'embed simple (PFE / démo) :

- **Fichier** → **Intégrer le rapport** → **Publier sur le web**
- Copier l'URL `https://app.powerbi.com/view?r=...`

> En production Ooredoo, préférer l'embed sécurisé avec Azure AD + Service Principal.

---

## Étape 4 — Actualisation des données

### Option A — Dossier local (dev)

Power BI Desktop → **Actualiser** manuellement après chaque sync.

### Option B — SharePoint / OneDrive

1. Copier `data/exports/powerbi/` vers un dossier cloud
2. Power BI Service → **Paramètres** → **Gateway** → actualisation planifiée

### Option C — Gateway on-premise

1. Installer [On-premises data gateway](https://powerbi.microsoft.com/gateway/)
2. Pointer la source vers `data/exports/powerbi/`
3. Planifier refresh quotidien (après ingestion J-1)

---

## Étape 5 — Lier dans RAN Intelligence

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_POWER_BI_EMBED_URL=https://app.powerbi.com/view?r=YOUR_EMBED_ID
NEXT_PUBLIC_POWER_BI_REPORT_URL=https://app.powerbi.com/groups/.../reports/...
```

Redémarrer le frontend :

```powershell
cd frontend
npm run dev
```

Ouvrir : http://localhost:3000/power-bi

### Backend (optionnel, `.env.powerbi`)

```env
POWERBI_EXPORT_DIR=data/exports/powerbi
POWERBI_REPORT_URL=https://app.powerbi.com/groups/.../reports/...
POWERBI_EMBED_URL=https://app.powerbi.com/view?r=...
```

---

## API

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /integrations/powerbi/status` | User | Statut export + fichiers |
| `POST /integrations/powerbi/sync` | Admin | Force la copie CSV |

---

## Checklist soutenance

- [ ] Au moins 1 snapshot ingéré
- [ ] Dossier `data/exports/powerbi/` rempli
- [ ] Rapport Power BI publié avec page Executive
- [ ] URL embed dans `.env.local`
- [ ] Lien **Power BI** visible dans la navbar
- [ ] Démo : RAN Intelligence (drill-down) + Power BI (vue direction)
