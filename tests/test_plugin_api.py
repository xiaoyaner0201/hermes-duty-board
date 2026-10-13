from __future__ import annotations

import json
import sqlite3
import time
from datetime import datetime, timezone

from tests.fixtures.make_home import add_lease, add_message, add_session, db


def summary(client):
    response = client.get("/api/plugins/duty-board/summary")
    assert response.status_code == 200
    return response.json()


def test_waiting_detection_localized_and_noise(client, home):
    now = float((home / "fixture-now").read_text())
    cases = {
        "cn": "要不要我继续？",
        "en": "Should I go ahead?",
        "ja": "進めてもよろしいですか",
        "url": "See https://example.test/?q=1",
        "mid": "Should I go ahead?\nThe report is complete.",
        "media": "要不要我继续？\nMEDIA: image.png\n[^1]: footnote",
    }
    for index, (name, reply) in enumerate(cases.items()):
        sid = f"waiting-{name}"
        add_session(home, sid, title=name, now=now)
        add_message(home, sid, "user", "Please handle this", timestamp=now - 120, platform_message_id=str(9000 + index))
        add_message(home, sid, "assistant", reply, timestamp=now - 60)

    data = summary(client)
    waiting = {item["session_id"]: item for item in data["conversations"]["waiting"]}
    assert {"waiting-cn", "waiting-en", "waiting-ja", "waiting-media"} <= set(waiting)
    assert "waiting-url" not in waiting
    assert "waiting-mid" not in waiting
    assert waiting["waiting-en"]["app_link"].startswith("discord://-/channels/")


def test_unanswered_and_live_lease_are_distinct(client, home):
    now = float((home / "fixture-now").read_text())
    add_session(home, "unanswered", title="unanswered", now=now)
    add_message(home, "unanswered", "user", "Did it deploy?", timestamp=now - 600, platform_message_id="123456789012345678")
    add_session(home, "running", title="running", now=now)
    add_message(home, "running", "user", "Start the deploy", timestamp=now - 600, platform_message_id="123456789012345679")
    add_lease(home, "running", now=now)

    data = summary(client)["conversations"]
    assert [item["session_id"] for item in data["unanswered"]] == ["unanswered"]
    assert [item["session_id"] for item in data["running"]] == ["running"]
    assert not data["waiting"]


def test_internal_rows_and_gateway_preamble_are_ignored(client, home):
    now = float((home / "fixture-now").read_text())
    add_session(home, "clean", title="clean", now=now)
    add_message(home, "clean", "user", "[IMPORTANT: internal event]", timestamp=now - 400, display_kind="internal_notification")
    add_message(home, "clean", "user", "Gateway message origin (JSON data follows)\n{\"chat_id\": \"x\"}\nDo not guess sender\n[Verified sender Alice] What should I do?", timestamp=now - 300, platform_message_id="123")

    item = summary(client)["conversations"]["unanswered"][0]
    assert item["ask"] == "What should I do?"


def test_links_cover_thread_dm_invalid_and_non_discord(client, home):
    now = float((home / "fixture-now").read_text())
    add_session(home, "thread", thread_id="333333333333333333", title="thread", now=now)
    add_message(home, "thread", "user", "Thread question", timestamp=now - 500, platform_message_id="444444444444444444")
    add_session(home, "dm", chat_id="555555555555555555", guild_id=None, chat_type="dm", title="dm", now=now)
    add_message(home, "dm", "user", "DM question", timestamp=now - 500, platform_message_id="666666666666666666")
    add_session(home, "bad-id", chat_id="not-numeric", title="bad", now=now)
    add_message(home, "bad-id", "user", "Bad channel", timestamp=now - 500, platform_message_id="777")
    add_session(home, "bad-message", title="bad-message", now=now)
    add_message(home, "bad-message", "user", "Bad message", timestamp=now - 500, platform_message_id="not-numeric")
    add_session(home, "feishu", source="feishu", title="feishu", now=now)
    add_message(home, "feishu", "user", "Feishu question", timestamp=now - 500, platform_message_id="888")

    waiting = {item["session_id"]: item for item in summary(client)["conversations"]["unanswered"]}
    assert waiting["thread"]["link"].endswith("/333333333333333333/444444444444444444")
    assert waiting["thread"]["app_link"].startswith("discord://-/channels/111111111111111111/")
    assert waiting["dm"]["link"].startswith("https://discord.com/channels/@me/")
    assert waiting["bad-id"]["link"] is None
    assert waiting["bad-message"]["link"] is None
    assert waiting["feishu"]["link"] is None
    assert waiting["feishu"]["app_link"] is None


def test_place_line_does_not_repeat_the_thread_title(client, home):
    now = float((home / "fixture-now").read_text())
    add_session(home, "named", thread_id="333333333333333333", title="Fix the login bug", now=now)
    conn = db(home)
    conn.execute(
        "UPDATE sessions SET display_name=? WHERE id=?",
        ("Home Lab / #work / Fix the login bug", "named"),
    )
    conn.commit()
    conn.close()
    add_message(home, "named", "user", "Please look at it", timestamp=now - 500, platform_message_id="444444444444444444")

    item = summary(client)["conversations"]["unanswered"][0]
    assert item["title"] == "Fix the login bug"
    assert item["where"] == "#work"


def test_privacy_hides_other_people_content_but_keeps_running_presence(client, home):
    now = float((home / "fixture-now").read_text())
    (home / "duty-board" / "settings.json").write_text(json.dumps({"owner": "222222222222222222", "people": {"999": "Bob"}}))
    add_session(home, "mine-wait", user_id="222222222222222222", title="mine", now=now)
    add_message(home, "mine-wait", "assistant", "Should I continue?", timestamp=now - 100)
    add_session(home, "other-wait", user_id="999", title="other", now=now)
    add_message(home, "other-wait", "assistant", "Should I continue?", timestamp=now - 100)
    add_session(home, "other-run", user_id="999", title="other-run", now=now)
    add_message(home, "other-run", "user", "Secret request", timestamp=now - 100, platform_message_id="999999999999999999")
    add_lease(home, "other-run", now=now)

    conversations = summary(client)["conversations"]
    assert [item["session_id"] for item in conversations["waiting"]] == ["mine-wait"]
    private = conversations["running"][0]
    assert private["private"] is True
    assert private["title"] == ""
    assert private["ask"] == ""
    assert private["link"] is None and private["app_link"] is None


def test_dismiss_undo_and_prune_are_atomic(client, home):
    now = float((home / "fixture-now").read_text())
    add_session(home, "dismiss-me", title="dismiss", now=now)
    message_id = add_message(home, "dismiss-me", "assistant", "Should I dismiss this?", timestamp=now - 100)
    key = f"dismiss-me:{message_id}"
    response = client.post("/api/plugins/duty-board/dismiss", json={"key": key})
    assert response.json() == {"ok": True}
    assert not summary(client)["conversations"]["waiting"]
    assert client.post("/api/plugins/duty-board/dismiss", json={"key": key, "undo": True}).json() == {"ok": True}
    assert summary(client)["conversations"]["waiting"][0]["session_id"] == "dismiss-me"
    assert client.post("/api/plugins/duty-board/dismiss", json={"key": ""}).json()["ok"] is False
    path = home / "duty-board" / "dismissed.json"
    path.write_text(json.dumps({"old": time.time() - 31 * 86400, "new": time.time()}))
    assert client.post("/api/plugins/duty-board/dismiss", json={"key": "fresh"}).json()["ok"] is True
    stored = json.loads(path.read_text())
    assert "old" not in stored and "fresh" in stored


def test_schema_drift_keeps_summary_healthy_and_warns(client, home):
    now = float((home / "fixture-now").read_text())
    add_session(home, "drift", title="drift", now=now)
    add_message(home, "drift", "user", "still working", timestamp=now - 600)
    conn = sqlite3.connect(home / "state.db")
    conn.execute("DROP TABLE session_turn_leases")
    conn.commit()
    conn.close()

    response = client.get("/api/plugins/duty-board/summary")
    assert response.status_code == 200
    data = response.json()
    assert data["schema_version"] == 1
    assert data["plugin_version"] == "0.2.0"
    assert data["conversations"]["running"] == []
    assert any(warning.startswith("running: table session_turn_leases not found") for warning in data["warnings"])


def test_cron_reason_codes_are_structured(client, home):
    now = float((home / "fixture-now").read_text())
    old = datetime.fromtimestamp(now - 3600, timezone.utc).isoformat()
    soon = datetime.fromtimestamp(now + 3600, timezone.utc).isoformat()
    jobs = {
        "jobs": [
            {"id": "error", "name": "Error job", "enabled": True, "state": "scheduled", "last_status": "error", "last_error": "boom", "next_run_at": soon},
            {"id": "overdue", "name": "Overdue job", "enabled": True, "state": "scheduled", "next_run_at": old},
            {"id": "paused", "name": "Paused job", "enabled": False, "state": "paused"},
        ]
    }
    (home / "cron" / "jobs.json").write_text(json.dumps(jobs))
    problems = {job["id"]: job for job in summary(client)["cron"]["problems"]}
    assert {reason["code"] for reason in problems["error"]["reasons"]} == {"last_error"}
    assert {reason["code"] for reason in problems["overdue"]["reasons"]} == {"overdue"}
    assert {reason["code"] for reason in problems["paused"]["reasons"]} == {"state"}
