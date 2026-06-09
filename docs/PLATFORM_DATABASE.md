# Base plateforme vs données Ooredoo

## Principe

| Stockage | Contenu | Emplacement |
|----------|---------|-------------|
| **Base plateforme** | Auth, sessions, audit, activité app, questions IA, notifications | PostgreSQL `ran_intelligence` |
| **Données Ooredoo RAN** | Sites, équipements, compteurs, XML, inventaire | `data/lake/*.parquet`, `DATA.XML` |
| **Trust snapshots** | Empreintes XML (intégrité données réseau) | `data/trust/trust_audit.db` |

La base PostgreSQL enregistre **qui fait quoi** sur la plateforme, jamais le contenu métier RAN.

---

## Tables PostgreSQL (plateforme)

### Auth & comptes
- `users` — comptes admin / utilisateurs
- `otp_codes` — codes vérification
- `access_keys` — clés d'invitation
- `refresh_tokens` — sessions JWT
- `auth_audit` — connexions, signup, actions admin

### Activité application
- `app_activity` — chaque appel API authentifié (chemin, utilisateur, catégorie)
- `assistant_queries` — questions posées à l'assistant IA (sans résultats RAN)
- `notification_log` — envois email/SMS (destinataire masqué)

---

## Catégories d'activité

| Catégorie | Exemple |
|-----------|---------|
| `auth` | `/auth/login`, `/auth/signup` |
| `assistant` | Questions IA |
| `ooredoo_access` | Consultation sites, inventaire, delta… (log uniquement, pas les données) |
| `platform` | Autres actions |

---

## Consulter l'activité (admin)

```http
GET /auth/activity?limit=50
GET /auth/database/status
```

Dans pgAdmin : base `ran_intelligence` → tables `app_activity`, `assistant_queries`, `notification_log`.

---

## Configuration

```env
AUTH_DATABASE_URL=postgresql://ran_auth:ran_auth_dev@localhost:5432/ran_intelligence
PLATFORM_ACTIVITY_ENABLED=true
```

Voir aussi : [AUTH_DATABASE.md](./AUTH_DATABASE.md)
