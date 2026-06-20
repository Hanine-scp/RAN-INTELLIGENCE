# Runbook opérationnel — RAN Intelligence

Guide pour démarrer, arrêter, ingérer les données et sauvegarder la plateforme.

---

## Démarrage rapide

### Mode développement (recommandé)

```powershell
cd C:\projects\RAN-INTELLIGENCE
.\.venv\Scripts\Activate.ps1

# Terminal 1 — API
python -m uvicorn api.main:app --host 127.0.0.1 --port 8010 --reload

# Terminal 2 — Frontend
cd frontend
npm run dev
```

Frontend : http://localhost:3000  
API : http://127.0.0.1:8010/health

### Mode Docker

```powershell
cd C:\projects\RAN-INTELLIGENCE
copy .env.docker.example .env.docker
# Éditer DATA_XML_HOST_PATH vers votre dossier XML

docker compose --env-file .env.docker up -d --build
```

Avec PostgreSQL auth :

```powershell
docker compose --env-file .env.docker --profile auth up -d --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API | http://localhost:8000/health |
| PostgreSQL auth | localhost:5433 |

---

## Arrêt

```powershell
# Docker
docker compose down

# Dev local — Ctrl+C dans chaque terminal
```

---

## Ingestion quotidienne J-1

### Manuel

```powershell
cd C:\projects\RAN-INTELLIGENCE
.\scripts\daily_ingest.ps1

# Date spécifique
.\scripts\daily_ingest.ps1 -Date "2026.05.14"
```

Étapes exécutées :
1. Scan `DATA.XML` → `data/bronze/snapshot_registry.csv`
2. Parse du snapshot J-1 → lake Parquet
3. Ancrage Data Trust (hash SHA-256)

### Planification Windows (Task Scheduler)

1. Ouvrir **Planificateur de tâches**
2. Créer une tâche **Quotidienne à 06:00**
3. Action : `powershell.exe`
4. Arguments :

```
-ExecutionPolicy Bypass -File "C:\projects\RAN-INTELLIGENCE\scripts\daily_ingest.ps1"
```

5. Démarrer dans : `C:\projects\RAN-INTELLIGENCE`

Logs : `logs/daily_ingest_YYYYMMDD_HHMMSS.log`

---

## Sauvegarde

```powershell
.\scripts\backup.ps1
```

Sauvegarde dans `backups/YYYYMMDD_HHMMSS/` :
- `data/lake/` (Parquet)
- `data/bronze/`
- `data/trust/`
- dump PostgreSQL auth (si `pg_dump` disponible)

Planifier à **23:00** via Task Scheduler (même procédure que daily ingest).

---

## Vérifications santé

| Check | Commande / URL | Attendu |
|-------|----------------|---------|
| API alive | `GET /health` | `{"status":"ok"}` |
| Lake prêt | `GET /ready` | `{"ready":true}` |
| Métriques | `GET /ops/query-metrics` (admin) | avg/p95 ms |
| Trust | `GET /trust/anchors` | liste ancres |

Console ops : http://localhost:3000/ops (admin)

---

## Logs

| Source | Emplacement |
|--------|-------------|
| Ingestion J-1 | `logs/daily_ingest_*.log` |
| API Docker | `docker logs ran-intelligence-api` |
| Frontend Docker | `docker logs ran-intelligence-frontend` |
| PostgreSQL | `docker logs ran-auth-postgres` |

---

## Rollback après ingestion ratée

```powershell
# 1. Supprimer le snapshot via API (admin) ou manuellement
#    POST /snapshots/delete  { "snapshot_dates": ["2026-06-08"] }

# 2. Restaurer le lake depuis backup
robocopy backups\DERNIER_BACKUP\data_lake data\lake /E

# 3. Redémarrer l'API
docker compose restart api
# ou relancer uvicorn
```

---

## Variables d'environnement clés

| Variable | Description |
|----------|-------------|
| `DATA_XML_HOST_PATH` | Chemin hôte vers DATA.XML (Docker) |
| `DATA_XML_ROOT` | Chemin XML vu par l'API |
| `DATA_ROOT` | Chemin lake Parquet |
| `AUTH_DATABASE_URL` | PostgreSQL auth |
| `NEXT_PUBLIC_API_BASE_URL` | URL API pour le frontend |
| `OPENAI_API_KEY` | Assistant IA (optionnel) |

---

## CI/CD

- **CI** : chaque push → lint frontend + build + compile backend
- **CD** : push sur `main` → build images Docker → GitHub Container Registry

Images :
- `ghcr.io/hanine-scp/ran-intelligence-api`
- `ghcr.io/hanine-scp/ran-intelligence-frontend`

---

## Dépannage

| Problème | Solution |
|----------|----------|
| `/ready` = false | Lancer `python pipeline/main_pipeline.py` ou `daily_ingest.ps1` |
| Frontend ne joint pas l'API | Vérifier `NEXT_PUBLIC_API_BASE_URL` |
| Docker : DATA.XML vide | Vérifier `DATA_XML_HOST_PATH` dans `.env.docker` |
| Auth échoue | `python scripts/init_auth_database.py` |
| CI rouge | `npm run lint` + `npm run build` + `pip install -r requirements.txt` |
