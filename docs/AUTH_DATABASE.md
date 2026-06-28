# Base de données Auth — RAN Intelligence

L'API auth supporte **SQLite** (dev rapide) et **PostgreSQL** (recommandé, compatible pgAdmin).

> **Architecture complète** : cette base stocke toute l'activité plateforme (auth, logs, assistant, notifications) — **pas** les données métier Ooredoo (sites, XML, inventaire). Voir [PLATFORM_DATABASE.md](./PLATFORM_DATABASE.md).

## PostgreSQL (recommandé)

### Option A — PostgreSQL déjà installé (Windows / pgAdmin local)

Si PostgreSQL tourne déjà sur le port `5432` (comme sur cette machine) :

```powershell
cd C:\projects\RAN-INTELLIGENCE
# Remplacez VOTRE_MDP par le mot de passe du superuser postgres
$env:POSTGRES_ADMIN_URL="postgresql://postgres:VOTRE_MDP@localhost:5432/postgres"
python scripts/setup_local_postgres_auth.py
python scripts/init_auth_database.py
```

**pgAdmin local** — ajouter un serveur :
- Host : `localhost`
- Port : `5432`
- Database : `ran_intelligence`
- Username : `ran_auth`
- Password : `ran_auth_dev`

### Option B — Docker (PostgreSQL + pgAdmin web)

### 1. Démarrer PostgreSQL + pgAdmin

```powershell
cd C:\projects\RAN-INTELLIGENCE
docker compose -f docker-compose.auth.yml up -d
```

| Service | URL / port |
|---------|------------|
| PostgreSQL | `localhost:5433` (Docker, pour éviter conflit avec PG local) |
| pgAdmin | http://localhost:5050 |
| Base | `ran_intelligence` |
| Utilisateur | `ran_auth` |
| Mot de passe | `ran_auth_dev` |

**pgAdmin** — connexion serveur :
- Host : `postgres-auth` (depuis pgAdmin Docker) ou `host.docker.internal` / IP machine
- Port : `5432`
- Database : `ran_intelligence`
- Username : `ran_auth`
- Password : `ran_auth_dev`

### 2. Lier l'API

Dans `.env.auth` :

```env
AUTH_DATABASE_URL=postgresql://ran_auth:ran_auth_dev@localhost:5432/ran_intelligence
```

Installer le driver :

```powershell
pip install "psycopg[binary]"
```

Initialiser le schéma + compte admin :

```powershell
python scripts/init_auth_database.py
```

### Créer le premier admin (email + SMS, style Google)

1. Dans `.env.auth` :

```env
SEED_DEFAULT_ADMIN=false
ADMIN_BOOTSTRAP_KEY=votre-cle-secrete-bootstrap
```

2. Purger la base si besoin :

```powershell
python scripts/reset_auth_database.py --no-seed
```

3. Ouvrir http://localhost:3000/admin/setup — saisir **votre** email, téléphone, mot de passe et la clé bootstrap.

4. Vérifier les codes reçus par **email** et **SMS**, puis activer le compte.

5. Connexion admin : onglet **Admin** sur `/login` — email + mot de passe, puis double OTP email + SMS à chaque session.

Redémarrer l'API :

```powershell
python -m uvicorn api.main:app --host 127.0.0.1 --port 8010
```

Vérifier :

```powershell
curl http://127.0.0.1:8010/auth/database/status
```

### Tables

| Table | Rôle |
|-------|------|
| `users` | Comptes admin / utilisateurs |
| `otp_codes` | Codes vérification email & SMS |
| `access_keys` | Clés d'invitation & admin |
| `refresh_tokens` | Sessions JWT |
| `auth_audit` | Journal des actions |

---

## SQLite (fallback)

Si `AUTH_DATABASE_URL` est vide ou absent :

| Élément | Valeur |
|---------|--------|
| Fichier | `data/auth/platform_auth.db` |
| Variable | `AUTH_DB_PATH` (optionnel) |

```powershell
# Retirer AUTH_DATABASE_URL de .env.auth pour revenir à SQLite
python scripts/init_auth_database.py
```

---

## Compte admin par défaut

Créé automatiquement si `SEED_DEFAULT_ADMIN=true` au premier démarrage.

| Variable | Exemple (`.env.auth`) |
|----------|------------------------|
| `ADMIN_EMAIL` | `hbenahmed2001@gmail.com` |
| `ADMIN_PHONE` | `+21623669609` |
| `ADMIN_ACCESS_KEY` | `RAN-ADMIN-MASTER-KEY` |
| `ADMIN_BOOTSTRAP_KEY` | `RAN-BOOTSTRAP-OOREDOO-2026` |
| `TWILIO_FROM_NUMBER` | `+21652266224` (fallback SMS) |

Toutes les valeurs sont lues depuis `.env.auth` (voir `.env.auth.example`).
