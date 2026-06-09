-- Exécuter dans pgAdmin, connecté en tant que rio_db (ou postgres)
-- sur la base "postgres" ou "ran_intelligence"

-- 1) Créer ou réinitialiser l'utilisateur ran_auth
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ran_auth') THEN
        CREATE ROLE ran_auth WITH LOGIN PASSWORD 'ran_auth_dev';
    ELSE
        ALTER ROLE ran_auth WITH LOGIN PASSWORD 'ran_auth_dev';
    END IF;
END
$$;

-- 2) Créer la base si elle n'existe pas (ignorer l'erreur si déjà créée)
CREATE DATABASE ran_intelligence OWNER ran_auth;

-- 3) Droits sur la base (exécuter aussi grant_ran_auth_privileges.sql sur ran_intelligence)
GRANT ALL PRIVILEGES ON DATABASE ran_intelligence TO ran_auth;
