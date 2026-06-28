# Guide de configuration — Auth, Email & SMS

Ce guide explique comment activer l’envoi **réel** des codes OTP, clés d’accès et messages de bienvenue pour la plateforme **RAN Intelligence** (Ooredoo).

---

## 1. Vue d’ensemble

| Canal | Service | Usage |
|-------|---------|--------|
| **Email** | SMTP (Gmail, Outlook, serveur interne…) | Codes OTP, clés d’accès, mot de passe temporaire |
| **SMS** | [Vonage Verify](https://developer.vonage.com/en/verify/overview) | Codes OTP (Twilio en fallback optionnel) |

Sans configuration, le système reste en **mode secours** : les codes s’affichent dans l’interface uniquement si `AUTH_DEV_MODE=true` et que l’envoi a échoué.

---

## 2. Prérequis

- Python 3.11+ avec les dépendances du projet (`pip install -r requirements.txt`)
- Compte email avec accès SMTP (ou relais SMTP Ooredoo)
- Compte [Vonage](https://dashboard.nexmo.com/) avec API Key + Secret (Verify activé)
- API et frontend démarrés localement ou sur serveur

---

## 3. Fichier de configuration `.env.auth`

### 3.1 Créer le fichier

À la racine du projet :

```powershell
cd C:\projects\RAN-INTELLIGENCE
copy .env.auth.example .env.auth
```

Le fichier `.env.auth` est chargé automatiquement au démarrage de l’API (`api/main.py`).

> **Ne commitez jamais** `.env.auth` (mots de passe, clés Vonage/Mailtrap).

### 3.2 Variables obligatoires — Auth de base

Modèle identique à `.env.auth` / `.env.auth.example` :

```env
AUTH_JWT_SECRET=change-me-in-production
AUTH_DEV_MODE=false
AUTH_NOTIFICATIONS_ENABLED=true
AUTH_OTP_MINUTES=10

SEED_DEFAULT_ADMIN=true
ADMIN_BOOTSTRAP_KEY=RAN-BOOTSTRAP-OOREDOO-2026

ADMIN_EMAIL=hbenahmed2001@gmail.com
ADMIN_PASSWORD=*** (dans .env.auth uniquement)
ADMIN_PHONE=+21623669609
ADMIN_ACCESS_KEY=RAN-ADMIN-MASTER-KEY
DEFAULT_SIGNUP_KEY=RAN-USER-INVITE-2026

APP_FRONTEND_URL=http://localhost:3000
APP_WEBOTP_DOMAIN=localhost

MAILTRAP_API_TOKEN=
SMTP_HOST=live.smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=api
SMTP_PASS=
SMTP_FROM=RAN Intelligence <noreply@votre-domaine-verifie.com>
SMTP_USE_TLS=true

SMS_PROVIDER=vonage
VONAGE_API_KEY=CHANGE_ME
VONAGE_API_SECRET=CHANGE_ME
VONAGE_BRAND=RANIntel
VONAGE_CODE_LENGTH=6

NOTIFY_BRAND_NAME=RAN Intelligence · Ooredoo
AUTH_OTP_RESEND_SECONDS=59
AUTH_OTP_MAX_PER_HOUR=5
```

| Variable | Description |
|----------|-------------|
| `ADMIN_EMAIL` | Email admin seed (`hbenahmed2001@gmail.com`) |
| `ADMIN_PHONE` | Téléphone admin E.164 (`+21623669609`) |
| `VONAGE_BRAND` | Nom expéditeur SMS (max **18 caractères**, ex. `RANIntel`) |
| `MAILTRAP_API_TOKEN` | Token Mailtrap Live → recopié dans `SMTP_PASS` si vide |

## 4. Configuration Email (Mailtrap Live — recommandé)

### 4.1 Mailtrap Live SMTP

1. [mailtrap.io](https://mailtrap.io) → **Email Sending** → vérifier un **domaine d'envoi**
2. **Sending Domains → votre domaine → Integrations → SMTP**
3. **Settings → API Tokens** → créer un token Admin (`mt_...`)

```env
AUTH_DEV_MODE=false
AUTH_NOTIFICATIONS_ENABLED=true

MAILTRAP_API_TOKEN=mt_votre_token
SMTP_HOST=live.smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=api
SMTP_PASS=mt_votre_token
SMTP_FROM=RAN Intelligence <noreply@votre-domaine-verifie.com>
SMTP_USE_TLS=true
NOTIFY_BRAND_NAME=RAN Intelligence · Ooredoo
```

> `MAILTRAP_API_TOKEN` est copié automatiquement vers `SMTP_PASS` si celui-ci est vide (`config/env_loader.py`).

### 4.2 Gmail / Outlook / SMTP interne

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=votre-email@gmail.com
SMTP_PASSWORD=mot-de-passe-application
SMTP_FROM=RAN Intelligence <votre-email@gmail.com>
SMTP_USE_TLS=true
```

### 4.3 Gmail (dev rapide)

1. Activer la **validation en 2 étapes** sur le compte Google.
2. Aller dans **Compte Google → Sécurité → Mots de passe des applications**.
3. Créer un mot de passe pour « Mail » / « Autre ».
4. Coller ce mot de passe (16 caractères) dans `SMTP_PASSWORD` (sans espaces).

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=mon.email@gmail.com
SMTP_PASSWORD=abcdefghijklmnop
SMTP_FROM=RAN Intelligence <mon.email@gmail.com>
SMTP_USE_TLS=true
```

### 4.3 Outlook / Microsoft 365

```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=prenom.nom@ooredoo.tn
SMTP_PASSWORD=votre-mot-de-passe
SMTP_FROM=RAN Intelligence <prenom.nom@ooredoo.tn>
SMTP_USE_TLS=true
```

> Si l’authentification de base est désactivée par la politique IT, utilisez le relais SMTP interne Ooredoo (demander `SMTP_HOST` / port au équipe infra).

### 4.3 Serveur SMTP interne (production)

```env
SMTP_HOST=mail.ooredoo.tn
SMTP_PORT=587
SMTP_USER=ran-intelligence@ooredoo.tn
SMTP_PASSWORD=***
SMTP_FROM=RAN Intelligence <ran-intelligence@ooredoo.tn>
SMTP_USE_TLS=true
```

---

## 5. Configuration SMS (Vonage Verify)

### 5.1 Créer un compte Vonage

1. Inscription sur [dashboard.nexmo.com](https://dashboard.nexmo.com/).
2. **Settings → API credentials** : copier `API Key` et `API Secret`.
3. Activer **Verify** sur le compte (crédits requis pour l’envoi SMS).
4. Pour la Tunisie (+216), tester la livraison avec un numéro réel.

### 5.2 Variables

```env
SMS_PROVIDER=vonage
VONAGE_API_KEY=xxxxxxxx
VONAGE_API_SECRET=xxxxxxxx
VONAGE_BRAND=RANIntel
VONAGE_CODE_LENGTH=6
```

- `VONAGE_BRAND` : max **18 caractères** (éviter `RAN Intelligence · Ooredoo`).
- L’API Verify v2 attend le numéro **sans `+`** (ex. `21623669609`) — normalisé automatiquement côté backend.

### 5.3 Twilio (fallback optionnel)

Si `SMS_PROVIDER=twilio` ou si Vonage n’est pas configuré, Twilio Verify reste supporté :

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxx
```

### 5.4 Format des numéros utilisateurs

À l’inscription, saisir un numéro tunisien valide :

| Saisie utilisateur | Converti en |
|--------------------|-------------|
| `23669609` | `+21623669609` |
| `023669609` | `+21623669609` |
| `21623669609` | `+21623669609` |
| `+21623669609` | `+21623669609` |

---

## 6. Configuration Frontend

Fichier `frontend/.env.local` :

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8010
NEXT_PUBLIC_SIGNUP_INVITE_KEY=RAN-USER-INVITE-2026
```

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | URL de l’API FastAPI |
| `NEXT_PUBLIC_SIGNUP_INVITE_KEY` | Clé d’invitation pré-remplie sur `/signup` (optionnel) |

---

## 7. Démarrage

### Terminal 1 — API

```powershell
cd C:\projects\RAN-INTELLIGENCE
python -m uvicorn api.main:app --host 127.0.0.1 --port 8010
```

### Terminal 2 — Frontend

```powershell
cd C:\projects\RAN-INTELLIGENCE\frontend
npm run dev
```

URLs :

- Application : `http://localhost:3000`
- Login : `http://localhost:3000/login`
- Sign Up : `http://localhost:3000/signup`
- API docs : `http://127.0.0.1:8010/docs`

---

## 8. Vérifier que tout fonctionne

### 8.1 Statut des notifications

```http
GET http://127.0.0.1:8010/auth/notifications/status
```

Réponse attendue :

```json
{
  "data": {
    "enabled": true,
    "email_ready": true,
    "email_otp_ready": true,
    "sms_ready": true,
    "sms_otp_ready": true,
    "sms_provider": "vonage",
    "vonage_verify_ready": true,
    "twilio_verify_ready": false
  }
}
```

- `email_ready: false` → remplir `MAILTRAP_API_TOKEN` / `SMTP_PASS` + domaine vérifié dans `SMTP_FROM`
- `vonage_verify_ready: false` → remplir `VONAGE_API_KEY`, `VONAGE_API_SECRET`, `SMS_PROVIDER=vonage`

### 8.2 Test Sign Up complet

1. Aller sur `/signup`.
2. Remplir email **réel** et téléphone **réel**.
3. Après **Sign Up** :
   - Email reçu : code OTP + clé d’accès personnelle
   - SMS reçu : code OTP SMS
4. Saisir les **6 chiffres** (pas l’email ni le numéro de téléphone) sur l’écran **Verify**.
5. Après validation : nouvelle clé de session envoyée par email + SMS.

### 8.3 Test Login utilisateur

1. `/login` → onglet **Utilisateur**.
2. Email + mot de passe → étape MFA.
3. Codes reçus par email et SMS.
4. Après MFA : nouvelle clé de session par email + SMS.

---

## 9. Contenu des messages envoyés

| Événement | Email | SMS |
|-----------|-------|-----|
| Inscription (`/signup`) | OTP email + clé personnelle | OTP SMS |
| Vérification signup | — | — |
| Activation réussie | Clé prochaine session | Clé prochaine session |
| Login MFA (user) | OTP | OTP |
| Login réussi (user) | Nouvelle clé session | Nouvelle clé session |
| Création admin (`/admin/users`) | OTP + MDP temporaire + clé | OTP SMS |
| Login admin | OTP email uniquement | — |

Les **admins** ne reçoivent pas de clé de session rotative par SMS.

---

## 10. Comptes par défaut (développement)

| Rôle | Email | Téléphone | Clé |
|------|-------|-----------|-----|
| Admin | `hbenahmed2001@gmail.com` | `+21623669609` | `RAN-ADMIN-MASTER-KEY` |
| Sign Up | — | — | `RAN-USER-INVITE-2026` |

---

## 11. Dépannage

### Les codes s’affichent encore en orange (mode dev)

- L’envoi a échoué → consulter les logs du terminal uvicorn.
- Messages typiques : `Email delivery failed`, `SMS delivery failed`.

### Erreur SMTP Gmail « Username and Password not accepted »

- Utiliser un **mot de passe d’application**, pas le mot de passe du compte.
- Vérifier `SMTP_USER` = adresse Gmail exacte.

### SMS Vonage non reçu

- Vérifier les crédits Vonage (dashboard → Billing).
- Vérifier `VONAGE_API_KEY` / `VONAGE_API_SECRET` et `SMS_PROVIDER=vonage`.
- `VONAGE_BRAND` max 18 caractères (`RANIntel`).
- Vérifier le format du numéro utilisateur (8 chiffres minimum, converti en E.164).

### SMS Twilio (fallback) non reçu

- Vérifier les crédits Twilio (console → Billing).
- Vérifier que le pays +216 est autorisé sur le compte.
- Vérifier le format du numéro utilisateur (8 chiffres minimum).

### `Invalid OTP` à la vérification

- Saisir le **code à 6 chiffres**, pas l’email ni le téléphone.
- Le code expire après `AUTH_OTP_MINUTES` minutes.
- Chaque nouvelle inscription génère de **nouveaux** codes.

### L’API ne lit pas `.env.auth`

- Fichier à la racine : `C:\projects\RAN-INTELLIGENCE\.env.auth`
- Redémarrer uvicorn après modification.

### Réinitialiser la base auth

```powershell
Remove-Item data\auth\platform_auth.db
python -m uvicorn api.main:app --host 127.0.0.1 --port 8010
```

Le compte admin par défaut sera recréé au premier démarrage.

---

## 12. Sécurité — production

- [ ] Changer `AUTH_JWT_SECRET` (valeur longue aléatoire)
- [ ] Mettre `AUTH_DEV_MODE=false` (masquer les OTP à l’écran)
- [ ] Utiliser HTTPS pour l’API et le frontend
- [ ] Restreindre les clés d’invitation (`DEFAULT_SIGNUP_KEY`)
- [ ] Ne pas exposer `.env.auth` dans Git
- [ ] Configurer un relais SMTP et un contrat SMS Ooredoo pour la prod

---

## 13. Fichiers concernés

| Fichier | Rôle |
|---------|------|
| `.env.auth` | Configuration secrète (à créer) |
| `.env.auth.example` | Modèle |
| `config/env_loader.py` | Chargement automatique |
| `src/services/notification_service.py` | Envoi email / SMS |
| `src/services/auth_service.py` | OTP, clés, intégration |
| `frontend/.env.local` | URL API frontend |

---

*RAN Intelligence · Ooredoo — Plateforme interne*
