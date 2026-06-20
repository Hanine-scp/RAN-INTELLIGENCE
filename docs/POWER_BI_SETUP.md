# Intégration Power BI — RAN Intelligence

Guide étape par étape pour connecter un dashboard Power BI aux données traitées par la plateforme.

## Vue d'ensemble

```
XML Nokia → Pipeline → data/processed/*.csv
                           ↓ (auto-sync)
                    data/exports/powerbi/*.csv
                           ↓
              Power BI Desktop → Service → iframe dans /power-bi
```

---

## Étape 1 — Vérifier les données exportées

Après chaque ingestion snapshot, le pipeline copie automatiquement les CSV vers :

```
C:\projects\RAN-INTELLIGENCE\data\exports\powerbi\
```

Fichiers principaux pour le dashboard global :

| Fichier | Usage Power BI |
|---------|----------------|
| `site_status.csv` | KPI sites (actifs, bloqués, cellules) |
| `snapshot_summary.csv` | Vue globale par snapshot |
| `delta_metrics.csv` | Évolution entre dates |
| `equipment_inventory.csv` | Inventaire détaillé |
| `site_change_report.csv` | Changements sites |

Sync manuelle (admin) :

```powershell
curl -X POST http://127.0.0.1:8010/integrations/powerbi/sync -H "Authorization: Bearer <token>"
```

Ou depuis l'UI : page **Power BI** → bouton **Synchroniser maintenant**.

---

## Étape 2 — Power BI Desktop

1. Télécharger [Power BI Desktop](https://powerbi.microsoft.com/desktop/)
2. **Obtenir des données** → **Texte/CSV**
3. Sélectionner le dossier `data/exports/powerbi/`
4. Charger au minimum :
   - `site_status`
   - `snapshot_summary`
   - `delta_metrics`

### Modèle de données suggéré

```
DimDate (colonne snapshot_date extraite)
    │
    ├── FactSites      ← site_status
    ├── FactSummary    ← snapshot_summary
    └── FactDelta      ← delta_metrics
```

### Mesures DAX (exemples)

```dax
Total Sites = DISTINCTCOUNT(site_status[site_id])
Sites Bloqués = CALCULATE(COUNTROWS(site_status), site_status[site_state] = "blocked")
Taux Dispo = DIVIDE([Sites Actifs], [Total Sites])
```

### Pages recommandées

1. **Executive** — KPI globaux + courbe snapshots
2. **Delta** — top changements équipements
3. **Qualité** — serials manquants / complétude
4. **Techno** — répartition 2G/3G/4G/5G

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
