"""Offline coverage of the captured release constraints and explicit legacy shape."""
from __future__ import annotations

import sqlite3

import pytest

from tests.fixtures.capture_release_schema import schema_sql
from tests.fixtures.make_home import RELEASE_SCHEMA, SESSION_DDL, add_session, db, use_legacy_delegations


def test_snapshot_round_trips_without_hermes():
    with sqlite3.connect(":memory:") as conn:
        conn.executescript(RELEASE_SCHEMA.read_text(encoding="utf-8"))
        assert schema_sql(conn) == RELEASE_SCHEMA.read_text(encoding="utf-8")
        assert conn.execute("SELECT count(*) FROM sessions").fetchone()[0] == 0
        assert conn.execute("SELECT count(*) FROM async_delegations").fetchone()[0] == 0


def test_release_delegation_requires_explicit_origin(home):
    conn = db(home)
    try:
        with pytest.raises(sqlite3.IntegrityError, match=r"NOT NULL constraint failed: async_delegations\.origin_session"):
            conn.execute(
                "INSERT INTO async_delegations (delegation_id, state, dispatched_at, updated_at) "
                "VALUES ('missing-origin', 'running', 1, 1)"
            )
        conn.execute(
            "INSERT INTO async_delegations (delegation_id, origin_session, state, dispatched_at, updated_at) "
            "VALUES ('explicit-origin', 'fictional-origin', 'running', 1, 1)"
        )
        assert conn.execute("SELECT origin_session FROM async_delegations").fetchall()[0][0] == "fictional-origin"
    finally:
        conn.close()


def test_release_duplicate_nonempty_title_refused(home):
    conn = db(home)
    try:
        conn.execute("INSERT INTO sessions (id, source, started_at, title) VALUES ('one', 'discord', 1, 'Distinct title')")
        with pytest.raises(sqlite3.IntegrityError, match=r"UNIQUE constraint failed: sessions\.title"):
            conn.execute("INSERT INTO sessions (id, source, started_at, title) VALUES ('two', 'discord', 1, 'Distinct title')")
        # The captured partial index permits NULL, not duplicate named titles.
        conn.execute("INSERT INTO sessions (id, source, started_at) VALUES ('unnamed-one', 'discord', 1)")
        conn.execute("INSERT INTO sessions (id, source, started_at) VALUES ('unnamed-two', 'discord', 1)")
        assert conn.execute("SELECT count(*) FROM sessions").fetchone()[0] == 3
    finally:
        conn.close()


def test_legacy_delegation_shape_is_explicit_and_isolated(home):
    add_session(home, "preserved", title="Preserved session")
    conn = db(home)
    try:
        use_legacy_delegations(conn)
        columns = {row[1] for row in conn.execute("PRAGMA table_info(async_delegations)")}
        assert "origin_session_id" not in columns
        assert {"origin_session", "parent_session_id", "task_json", "result_json"} <= columns
        assert conn.execute("SELECT id FROM sessions").fetchone()[0] == "preserved"
    finally:
        conn.close()


def test_simplified_schema_remains_separate():
    with sqlite3.connect(":memory:") as conn:
        conn.executescript(SESSION_DDL)
        conn.execute("INSERT INTO sessions (id, source, started_at, title) VALUES ('one', 'discord', 1, 'Same')")
        conn.execute("INSERT INTO sessions (id, source, started_at, title) VALUES ('two', 'discord', 1, 'Same')")
        conn.execute(
            "INSERT INTO async_delegations (delegation_id, state, dispatched_at, updated_at) "
            "VALUES ('simplified', 'running', 1, 1)"
        )
        assert conn.execute("SELECT count(*) FROM sessions").fetchone()[0] == 2
        assert conn.execute("SELECT origin_session FROM async_delegations").fetchone()[0] == ""
