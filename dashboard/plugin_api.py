"""Duty Board — read-only dashboard API.

Optional duty-board/settings.json: owner, hide_other_people_content (true),
people (id -> label), window_days (7), stall_seconds (600),
unanswered_grace_seconds (180), recent_done_hours (24), goal_lookback_days (14),
messaging_sources (DEFAULT_MESSAGING_SOURCES). DUTY_BOARD_OWNER overrides owner.
Unset owner means all conversations are mine. Numeric values are clamped.
Labels fall back to platform user names; settings and labels are optional.

One endpoint aggregates the things that get lost when work is spread over many
Discord threads: which conversations are running right now, which ones end on a
question to the user, which ones got a user message and never answered, which
background delegations are in flight (or finished but could not be delivered),
cron health, and standing goals.

Everything is computed deterministically from Hermes' own state (state.db,
cron/jobs.json, gateway_state.json). No model calls, no writes to Hermes state;
the only file this plugin writes is its own dismiss list under
``<HERMES_HOME>/duty-board/``.
"""
from __future__ import annotations

import json
import os
import logging
import re
import sqlite3
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter
from pydantic import BaseModel

try:
    from hermes_constants import get_hermes_home
except Exception:  # pragma: no cover - only outside a Hermes runtime
    def get_hermes_home() -> Path:  # type: ignore[misc]
        return Path(os.environ.get("HERMES_HOME") or Path.home() / ".hermes")


router = APIRouter()
logger = logging.getLogger(__name__)

DEFAULT_MESSAGING_SOURCES = ("discord", "feishu", "telegram", "wechat_android", "weixin", "wechat", "slack")
DEFAULTS = {
    "window_days": 7, "stall_seconds": 600, "unanswered_grace_seconds": 180,
    "recent_done_hours": 24, "goal_lookback_days": 14,
    "messaging_sources": DEFAULT_MESSAGING_SOURCES,
}
WINDOW_DAYS = 7               # conversations considered at all
RECENT_DONE_HOURS = 24        # "recently finished" column
UNANSWERED_GRACE_S = 180      # a user message with no live turn for this long = possibly dropped
STALL_S = 600                 # live turn with no activity for this long = possibly stuck
DROPPED_LOOKBACK_DAYS = 7
GOAL_LOOKBACK_DAYS = 14
CACHE_TTL_S = 4.0
SCAN_LIMIT_MSGS = 40

# Messages stored with role=user that were not typed by a person.
_INTERNAL_PREFIXES = (
    "[IMPORTANT:", "[ASYNC DELEGATION", "[CONTEXT COMPACTION", "[Gateway internal event",
    "[Your active task list", "[System:", "[Cron delivery", "[Note:", "[SYSTEM:",
)
_META_PREFIX_RE = re.compile(
    r"^\s*(?:\[(?:Verified sender|Untrusted sender|Triggering message id|Replying to|Voice channel)[^\]]*\]\s*)+"
)
_ORIGIN_BLOCK_RE = re.compile(
    r"^\s*Gateway message origin \(JSON data[^\n]*\n\{.*?\}\n(?:Do not guess[^\n]*\n)?\s*", re.S
)
# A finished reply that hands the decision back to the user: judged on its last
# meaningful lines only (attachments, links and footnotes stripped), so a "?" in a
# URL or a question asked mid-report does not count.
_ASK_RE = re.compile(
    r"？|\?(?=\s|$|[*_」”』）)\]])|要不要我|要不要先|需不需要我|是否需要|你定|你来定|拍板|请确认|你确认|确认要|"
    r"等你|说一声|告诉我|回一句|你选|还是你|可以吗|好吗|行吗|你看呢|你觉得"
)
# A finished reply that promises more work later.
_PROMISE_RE = re.compile(r"我会|稍后|到时候|完成后|跑完|做完|写完|再告诉你|再来跟你说|再汇报|回来告诉你|随后")
_NOISE_LINE_RE = re.compile(r"^(MEDIA:|https?://|<https?://|\[\d+\]|_.*_$|`[^`]*`$|-{3,}$)")
_URL_RE = re.compile(r"<?https?://\S+>?")


def _meaningful_tail(reply: str, n_lines: int = 2) -> str:
    lines = [ln.strip() for ln in reply.strip().splitlines()]
    kept: List[str] = []
    for ln in reversed(lines):
        if not ln or _NOISE_LINE_RE.match(ln):
            continue
        kept.append(_URL_RE.sub("", ln))
        if len(kept) >= n_lines:
            break
    return "\n".join(reversed(kept))

_cache_lock = threading.Lock()
_cache: Dict[str, Any] = {"at": 0.0, "data": None}


# ── helpers ────────────────────────────────────────────────────────────────

def _home() -> Path:
    return Path(get_hermes_home())


def _state_dir() -> Path:
    d = _home() / "duty-board"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _load_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _clamp_number(raw: Any, default: float, minimum: float, maximum: float, integer: bool = False) -> Any:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        value = default
    value = max(minimum, min(maximum, value))
    return int(value) if integer else value


def _runtime_settings() -> Dict[str, Any]:
    raw = _settings()
    env_owner = os.environ.get("DUTY_BOARD_OWNER")
    owner = env_owner if env_owner is not None else raw.get("owner")
    owner = str(owner).strip() if owner is not None else ""
    sources = raw.get("messaging_sources", DEFAULTS["messaging_sources"])
    if isinstance(sources, str):
        sources = [sources]
    if not isinstance(sources, (list, tuple)):
        sources = DEFAULTS["messaging_sources"]
    sources = tuple(str(source).strip() for source in sources if str(source).strip())
    if not sources:
        sources = DEFAULTS["messaging_sources"]
    return {
        "owner": owner,
        "hide_other_people_content": bool(raw.get("hide_other_people_content", True)),
        "people": {str(k): str(v) for k, v in (raw.get("people") or {}).items()} if isinstance(raw.get("people"), dict) else {},
        "window_days": _clamp_number(raw.get("window_days"), 7, 1, 365, integer=True),
        "stall_seconds": _clamp_number(raw.get("stall_seconds"), 600, 30, 7 * 86400),
        "unanswered_grace_seconds": _clamp_number(raw.get("unanswered_grace_seconds"), 180, 0, 7 * 86400),
        "recent_done_hours": _clamp_number(raw.get("recent_done_hours"), 24, 1, 30 * 24, integer=True),
        "goal_lookback_days": _clamp_number(raw.get("goal_lookback_days"), 14, 1, 365, integer=True),
        "messaging_sources": sources,
    }


def _settings() -> Dict[str, Any]:
    return _load_json(_state_dir() / "settings.json", {})


def _dismissed() -> Dict[str, Any]:
    return _load_json(_state_dir() / "dismissed.json", {})


def _is_owner(user_id: Any, settings: Optional[Dict[str, Any]] = None) -> bool:
    settings = settings or _runtime_settings()
    owner = str(settings.get("owner") or "")
    if not owner or not settings.get("hide_other_people_content", True):
        return True
    return str(user_id or "") == owner


def _connect() -> sqlite3.Connection:
    db_path = _home() / "state.db"
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=5.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA query_only=1")
    return conn


def _text(content: Any) -> str:
    if content is None:
        return ""
    s = str(content)
    if s.startswith('[{"') or s.startswith("[{'"):
        try:
            parts = json.loads(s)
            s = " ".join(p.get("text", "") for p in parts if isinstance(p, dict))
        except Exception:
            pass
    return s


def _is_internal(content: str, display_kind: Optional[str]) -> bool:
    if display_kind in ("internal_notification", "hidden"):
        return True
    head = content.lstrip()[:40]
    return head.startswith(_INTERNAL_PREFIXES)


def _clean_user(content: str) -> str:
    s = _ORIGIN_BLOCK_RE.sub("", content)
    s = _META_PREFIX_RE.sub("", s)
    cut = s.find("<memory-context>")
    if cut >= 0:
        s = s[:cut]
    return " ".join(s.split())


def _clip(s: str, n: int) -> str:
    s = " ".join((s or "").split())
    return s if len(s) <= n else s[: n - 1] + "…"


def _tail(s: str, n: int) -> str:
    s = " ".join((s or "").split())
    return s if len(s) <= n else "…" + s[-(n - 1):]


def _iso_to_epoch(v: Any) -> Optional[float]:
    if not v:
        return None
    try:
        dt = datetime.fromisoformat(str(v))
        if dt.tzinfo is None:
            dt = dt.astimezone()  # naive values are local time
        return dt.timestamp()
    except Exception:
        return None


_DIGITS_RE = re.compile(r"^[0-9]+$")


def _numeric_id(value: Any) -> Optional[str]:
    if value is None or isinstance(value, bool):
        return None
    text = str(value).strip()
    return text if _DIGITS_RE.fullmatch(text) else None


def _discord_links(
    source: Any,
    origin: Dict[str, Any],
    channel: Any,
    chat_type: Any,
    message_id: Any = None,
) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    if source != "discord":
        return None, None, None
    channel_id = _numeric_id(channel)
    if not channel_id:
        return None, None, None
    if message_id not in (None, "") and not _numeric_id(message_id):
        return None, None, None
    guild_id = _numeric_id(origin.get("guild_id"))
    if guild_id:
        path = f"{guild_id}/{channel_id}"
    elif chat_type == "dm":
        path = f"@me/{channel_id}"
    else:
        return None, None, None
    valid_message = _numeric_id(message_id)
    if valid_message:
        path = f"{path}/{valid_message}"
    web = f"https://discord.com/channels/{path}"
    app = f"discord://-/channels/{path}"
    return web, app, web if valid_message else None


def _session_meta(row: sqlite3.Row, people: Dict[str, str], message_id: Any = None) -> Dict[str, Any]:
    origin = {}
    try:
        origin = json.loads(row["origin_json"]) if row["origin_json"] else {}
    except Exception:
        origin = {}
    source = row["source"]
    channel = row["thread_id"] or row["chat_id"] or origin.get("thread_id") or origin.get("chat_id")
    link, app_link, message_link = _discord_links(source, origin, channel, row["chat_type"], message_id)
    display = row["display_name"] or origin.get("chat_name") or ""
    where = display
    if source == "discord" and " / " in display:
        where = " / ".join(display.split(" / ")[1:])  # drop the server name
    title = row["title"] or (display.split(" / ")[-1] if display else row["id"])
    if title.startswith("["):  # auto-title captured a gateway metadata prefix
        title = display.split(" / ")[-1] if display else title
    uid = str(row["user_id"] or origin.get("user_id") or "")
    who = people.get(uid) or origin.get("user_name") or ""
    return {
        "session_id": row["id"], "source": source, "title": _clip(title, 60),
        "where": _clip(where, 60), "link": link, "app_link": app_link, "message_link": message_link, "who": who,
    }


def _recent_messages(conn: sqlite3.Connection, sid: str) -> List[sqlite3.Row]:
    return conn.execute(
        """SELECT id, role, content, timestamp, display_kind, platform_message_id FROM messages
           WHERE session_id=? AND role IN ('user','assistant')
             AND content IS NOT NULL AND content != ''
           ORDER BY timestamp DESC LIMIT ?""",
        (sid, SCAN_LIMIT_MSGS),
    ).fetchall()


# ── collectors ─────────────────────────────────────────────────────────────

def _collect_conversations(conn: sqlite3.Connection, now: float) -> Dict[str, List[Dict[str, Any]]]:
    settings = _runtime_settings()
    people = {str(k): v for k, v in (settings.get("people") or {}).items()}
    owner = str(settings.get("owner") or "")
    # Conversations with other people: show that they exist (title, place, timing) but
    # never their content — the board is the owner's console, not a transcript viewer.
    private_others = bool(owner and settings.get("hide_other_people_content", True))
    dismissed = _dismissed()
    leases = {
        r["conversation_id"]: r for r in conn.execute(
            "SELECT conversation_id, acquired_at, expires_at FROM session_turn_leases WHERE expires_at > ?", (now,))
    }
    placeholders = ",".join("?" for _ in settings["messaging_sources"])
    rows = conn.execute(
        f"""SELECT id, source, user_id, title, display_name, origin_json, chat_id, thread_id, chat_type,
                   started_at, last_activity_at, last_activity_description
            FROM sessions
            WHERE source IN ({placeholders}) AND ended_at IS NULL
              AND COALESCE(last_activity_at, started_at) > ?""",
        (*settings["messaging_sources"], now - settings["window_days"] * 86400),
    ).fetchall()

    running, waiting, unanswered, done = [], [], [], []
    for row in rows:
        sid = row["id"]
        msgs = _recent_messages(conn, sid)
        last_real: Optional[sqlite3.Row] = None
        last_user: Optional[Tuple[str, float]] = None
        message_id = None
        last_any_ts = 0.0
        for m in msgs:
            content = _text(m["content"])
            last_any_ts = max(last_any_ts, float(m["timestamp"] or 0))
            if m["role"] == "assistant" and m["display_kind"] == "hidden":
                continue
            if m["role"] == "user" and _is_internal(content, m["display_kind"]):
                continue
            if last_real is None:
                last_real = m
            if m["role"] == "user" and message_id is None and m["platform_message_id"]:
                message_id = m["platform_message_id"]
            if m["role"] == "user" and last_user is None:
                cleaned = _clean_user(content)
                if cleaned:
                    last_user = (cleaned, float(m["timestamp"] or 0))
            if last_real is not None and last_user is not None and message_id is not None:
                break
        activity_at = float(row["last_activity_at"] or last_any_ts or row["started_at"] or 0)
        base = dict(_session_meta(row, people, message_id))
        uid = str(row["user_id"] or "")
        base["mine"] = _is_owner(uid, settings)
        base["ask"] = _clip(last_user[0], 140) if last_user else ""
        base["ask_at"] = last_user[1] if last_user else None
        base["activity_at"] = activity_at

        if sid in leases:
            started = last_user[1] if last_user else float(leases[sid]["acquired_at"] or now)
            quiet = now - activity_at if activity_at else None
            base.update({
                "started_at": started,
                "doing": _clip(row["last_activity_description"] or "", 80),
                "quiet_s": quiet,
                "stalled": bool(quiet is not None and quiet > settings["stall_seconds"]),
            })
            running.append(base)
            continue
        if last_real is None:
            continue
        msg_ts = float(last_real["timestamp"] or 0)
        if last_real["role"] == "user":
            if now - msg_ts > settings["unanswered_grace_seconds"]:
                key = f"{sid}:{last_real['id']}"
                if key not in dismissed:
                    base.update({"since": msg_ts, "dismiss_key": key})
                    unanswered.append(base)
            continue
        reply = _text(last_real["content"])
        key = f"{sid}:{last_real['id']}"
        tail = _meaningful_tail(reply)
        base.update({"since": msg_ts, "reply_tail": _tail(_strip_md(tail or reply), 180), "dismiss_key": key})
        if _ASK_RE.search(tail):
            if key not in dismissed:
                waiting.append(base)
        elif now - msg_ts < settings["recent_done_hours"] * 3600:
            base["promised"] = bool(_PROMISE_RE.search(_meaningful_tail(reply, 3)))
            done.append(base)

    if private_others:
        # Other people's threads are not the owner's to-do: drop them from the
        # waiting/answered lists, and keep only an anonymous presence while running.
        waiting = [x for x in waiting if x["mine"]]
        unanswered = [x for x in unanswered if x["mine"]]
        done = [x for x in done if x["mine"]]
        for item in running:
            if not item["mine"]:
                item.update({
                    "title": f"{item.get('who') or '其他人'}的对话", "where": "", "ask": "",
                    "doing": "", "link": None, "app_link": None, "message_link": None, "private": True,
                })

    running.sort(key=lambda x: x.get("started_at") or 0)
    waiting.sort(key=lambda x: x["since"])            # oldest wait first
    unanswered.sort(key=lambda x: x["since"])
    done.sort(key=lambda x: x["since"], reverse=True)
    return {"running": running, "waiting": waiting, "unanswered": unanswered, "done": done[:15]}


def _session_title(conn: sqlite3.Connection, sid: Optional[str], people: Dict[str, str]) -> Dict[str, Any]:
    if not sid:
        return {}
    row = conn.execute(
        """SELECT id, source, user_id, title, display_name, origin_json, chat_id, thread_id, chat_type
           FROM sessions WHERE id=?""", (sid,)).fetchone()
    return _session_meta(row, people) if row else {}


def _collect_delegations(conn: sqlite3.Connection, now: float) -> Dict[str, List[Dict[str, Any]]]:
    people = {str(k): v for k, v in (_runtime_settings().get("people") or {}).items()}
    dismissed = _dismissed()
    running, dropped = [], []
    rows = conn.execute(
        """SELECT delegation_id, state, delivery_state, dispatched_at, completed_at, updated_at,
                  parent_session_id, origin_session_id, task_json, result_json
           FROM async_delegations
           WHERE state='running' OR (delivery_state='dropped' AND COALESCE(completed_at, updated_at) > ?)
           ORDER BY dispatched_at DESC""",
        (now - DROPPED_LOOKBACK_DAYS * 86400,),
    ).fetchall()
    for r in rows:
        task = _load_task(r["task_json"])
        goal = task.get("goal") or ""
        goals = task.get("goals") or []
        item = {
            "id": r["delegation_id"],
            "goal": _clip(goal, 140),
            "count": len(goals) if isinstance(goals, list) and goals else 1,
            "model": task.get("model") or "",
            "dispatched_at": r["dispatched_at"],
            "session": _session_title(conn, r["parent_session_id"] or r["origin_session_id"], people),
        }
        if not _is_owner(task.get("user_id")):
            item.update({"goal": "（其他人的后台任务）", "model": "", "session": {}})
        if r["state"] == "running":
            running.append(item)
        elif r["delegation_id"] not in dismissed:
            item["completed_at"] = r["completed_at"] or r["updated_at"]
            item["summary"] = _clip(_strip_md(_result_summary(r["result_json"])), 200)
            item["dismiss_key"] = r["delegation_id"]
            dropped.append(item)
    return {"running": running, "dropped": dropped}


_MD_RE = re.compile(r"\*\*|__|`+|^#+\s*|^[-*]\s+", re.M)


def _strip_md(text: str) -> str:
    return _MD_RE.sub("", text or "")


def _load_task(raw: Optional[str]) -> Dict[str, Any]:
    try:
        d = json.loads(raw) if raw else {}
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def _result_summary(raw: Optional[str]) -> str:
    try:
        d = json.loads(raw) if raw else {}
    except Exception:
        return ""
    if isinstance(d, dict):
        res = d.get("results") or []
        parts = [str(x.get("summary") or "") for x in res if isinstance(x, dict)]
        return " / ".join(p for p in parts if p) or str(d.get("summary") or "")
    return ""


def _collect_cron(now: float) -> Dict[str, Any]:
    raw = _load_json(_home() / "cron" / "jobs.json", {})
    jobs = raw.get("jobs", []) if isinstance(raw, dict) else (raw or [])
    enabled = [j for j in jobs if j.get("enabled")]
    problems, running, upcoming = [], [], []
    for j in enabled:
        nxt = _iso_to_epoch(j.get("next_run_at"))
        last = _iso_to_epoch(j.get("last_run_at"))
        item = {
            "id": j.get("id"), "name": _clip(j.get("name") or j.get("id") or "", 48),
            "schedule": j.get("schedule_display") or (j.get("schedule") or {}).get("display") or "",
            "next_at": nxt, "last_at": last, "last_status": j.get("last_status"),
            "deliver": j.get("deliver") or "", "script_only": bool(j.get("no_agent")),
        }
        reasons = []
        if j.get("fire_claim"):
            running.append(item)
        if j.get("last_status") == "error":
            err = (j.get("last_error") or "").strip().splitlines()
            reasons.append("报错：" + _clip(err[-1] if err else "", 90))
        if j.get("last_delivery_error"):
            reasons.append("投递失败：" + _clip(str(j.get("last_delivery_error")), 80))
        if j.get("state") != "scheduled":
            reasons.append(f"状态 {j.get('state')}")
        if nxt and nxt < now - 600 and not j.get("fire_claim"):
            reasons.append("到点未跑")
        if reasons:
            item["reasons"] = reasons
            problems.append(item)
        elif nxt:
            upcoming.append(item)
    upcoming.sort(key=lambda x: x["next_at"] or 0)
    return {
        "enabled": len(enabled),
        "paused": sum(1 for j in jobs if not j.get("enabled") and j.get("state") == "paused"),
        "problems": problems, "running": running, "upcoming": upcoming[:8],
    }


def _collect_goals(conn: sqlite3.Connection, now: float) -> Dict[str, Any]:
    people = {str(k): v for k, v in (_runtime_settings().get("people") or {}).items()}
    live, stale = [], 0
    for r in conn.execute("SELECT key, value FROM state_meta WHERE key LIKE 'goal:%'").fetchall():
        try:
            g = json.loads(r["value"])
        except Exception:
            continue
        if g.get("status") not in ("active", "paused"):
            continue
        sid = r["key"].split(":", 1)[1]
        srow = conn.execute(
            """SELECT id, source, user_id, title, display_name, origin_json, chat_id, thread_id, chat_type,
                      COALESCE(last_activity_at, started_at) AS act FROM sessions WHERE id=?""", (sid,)).fetchone()
        if srow is None or srow["source"] not in _runtime_settings()["messaging_sources"]:
            continue
        if (srow["act"] or 0) < now - _runtime_settings()["goal_lookback_days"] * 86400:
            stale += 1
            continue
        if not _is_owner(srow["user_id"]):
            continue
        live.append({
            "goal": _clip(g.get("goal") or "", 120), "status": g.get("status"),
            "turns": g.get("turns_used"), "max_turns": g.get("max_turns"),
            "reason": _clip(g.get("last_reason") or g.get("paused_reason") or "", 120),
            "session": _session_meta(srow, people), "activity_at": srow["act"],
        })
    live.sort(key=lambda x: x["activity_at"] or 0, reverse=True)
    return {"items": live, "stale": stale}


def _collect_gateway() -> Dict[str, Any]:
    st = _load_json(_home() / "gateway_state.json", {})
    platforms = []
    for name, p in (st.get("platforms") or {}).items():
        if isinstance(p, dict):
            platforms.append({"name": name, "state": p.get("state"), "error": p.get("error_message")})
    return {"state": st.get("gateway_state"), "version": st.get("code_version"), "platforms": platforms}


def _build(now: float) -> Dict[str, Any]:
    conn = _connect()
    try:
        conv = _collect_conversations(conn, now)
        dele = _collect_delegations(conn, now)
        goals = _collect_goals(conn, now)
    finally:
        conn.close()
    return {
        "generated_at": now,
        "gateway": _collect_gateway(),
        "conversations": conv,
        "delegations": dele,
        "cron": _collect_cron(now),
        "goals": goals,
    }


# ── routes ─────────────────────────────────────────────────────────────────

@router.get("/summary")
def summary() -> Dict[str, Any]:
    now = time.time()
    with _cache_lock:
        if _cache["data"] is not None and now - _cache["at"] < CACHE_TTL_S:
            return _cache["data"]
    data = _build(now)
    with _cache_lock:
        _cache.update(at=now, data=data)
    return data


class DismissBody(BaseModel):
    key: str
    undo: bool = False


@router.post("/dismiss")
def dismiss(body: DismissBody) -> Dict[str, Any]:
    key = (body.key or "").strip()
    if not key or len(key) > 200:
        return {"ok": False, "error": "bad key"}
    path = _state_dir() / "dismissed.json"
    data = _dismissed()
    if body.undo:
        data.pop(key, None)
    else:
        data[key] = time.time()
    cutoff = time.time() - 30 * 86400
    data = {k: v for k, v in data.items() if isinstance(v, (int, float)) and v > cutoff}
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=0), encoding="utf-8")
    tmp.replace(path)
    with _cache_lock:
        _cache.update(at=0.0, data=None)
    return {"ok": True}
