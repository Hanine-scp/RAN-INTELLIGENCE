# Samples — données de démo

Ce dossier décrit comment préparer des **snapshots XML de démonstration** sans exposer les exports NOC réels dans Git.

## Structure attendue

```text
DATA.XML/
├── 2025.09.11/
│   ├── MRBTS....xml
│   └── ...
└── YYYY.MM.DD/
    └── *.xml
```

Convention : un dossier date `YYYY.MM.DD` (ou `YYYY-MM-DD`) contient un fichier XML ≈ un site BTS Nokia.

## Usage local

1. Placez vos snapshots dans `DATA.XML/` à la racine du projet **ou** dans un chemin externe.
2. Pointez le backend via `DATA_XML_ROOT` / `config/settings.py`.
3. Lancez le pipeline :

```powershell
python pipeline/main_pipeline.py --source .\DATA.XML
```

4. Vérifiez la readiness API : `GET http://127.0.0.1:8010/ready`

## Règles Git

- **Ne pas committer** de nouveaux dumps massifs ni de données opérateurs sensibles.
- `DATA.XML/` est listé dans `.gitignore` pour les ajouts futurs.
- Pour une démo publique / jury : utilisez un **petit sous-ensemble anonymisé** (quelques sites, quelques dates).

## Clients

La même API alimente :

| Client | URL API typique |
|--------|-----------------|
| Web Next.js (ce PC) | `http://127.0.0.1:8010` |
| Émulateur Android | `http://10.0.2.2:8010` |
| Téléphone / autre PC (même Wi‑Fi) | `http://<IP_PC>:8010` |
