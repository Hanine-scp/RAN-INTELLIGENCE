import sqlite3
import sys
import types

from src.services.knowledge_database import knowledge_db_connect


def test_knowledge_db_connect_falls_back_to_sqlite_when_postgres_is_unreachable(monkeypatch, tmp_path):
    db_path = tmp_path / "knowledge.db"
    monkeypatch.setenv("KNOWLEDGE_DATABASE_URL", "postgresql://example:pass@127.0.0.1:5432/ran_meta")
    monkeypatch.setenv("KNOWLEDGE_SQLITE_PATH", str(db_path))

    captured_kwargs = {}

    fake_psycopg = types.ModuleType("psycopg")

    def connect(*args, **kwargs):
        captured_kwargs.update(kwargs)
        raise ConnectionError("postgres unavailable")

    fake_psycopg.connect = connect
    fake_rows = types.ModuleType("psycopg.rows")
    fake_rows.dict_row = lambda row: row
    monkeypatch.setitem(sys.modules, "psycopg", fake_psycopg)
    monkeypatch.setitem(sys.modules, "psycopg.rows", fake_rows)

    with knowledge_db_connect() as conn:
        assert conn.is_postgres is False
        conn.execute("CREATE TABLE test_table (id INTEGER PRIMARY KEY)")
        conn.execute("INSERT INTO test_table (id) VALUES (?)", [1])

    assert captured_kwargs.get("connect_timeout") == 2
    assert db_path.exists()
    with sqlite3.connect(db_path) as sqlite_conn:
        row = sqlite_conn.execute("SELECT COUNT(*) FROM test_table").fetchone()
        assert row[0] == 1
