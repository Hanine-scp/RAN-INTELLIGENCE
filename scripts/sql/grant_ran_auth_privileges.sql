-- Exécuter dans pgAdmin connecté en rio_db
-- Base : ran_intelligence  (important : pas "postgres")

ALTER DATABASE ran_intelligence OWNER TO ran_auth;

GRANT CONNECT ON DATABASE ran_intelligence TO ran_auth;
GRANT ALL ON SCHEMA public TO ran_auth;
GRANT CREATE ON SCHEMA public TO ran_auth;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ran_auth;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ran_auth;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES TO ran_auth;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON SEQUENCES TO ran_auth;
