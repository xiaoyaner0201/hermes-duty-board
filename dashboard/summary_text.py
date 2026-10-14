"""Deterministic, bounded chat text. Catalogs and Python stdlib only."""
from __future__ import annotations

import json
import math
import re
from decimal import Decimal
from functools import lru_cache
from pathlib import Path

LOCALES = ("en", "zh", "zh-hant", "ja", "ko", "de", "es", "fr", "it", "pt", "ru", "uk", "tr", "hu", "af", "ga", "ar")
MAX_CHARS = 1900


def locale_name(value) -> str:
    raw = str(value or "").lower().replace("_", "-")
    if raw.startswith(("zh-tw", "zh-hk", "zh-mo", "zh-hant")):
        return "zh-hant"
    return raw if raw in LOCALES else raw.split("-")[0] if raw.split("-")[0] in LOCALES else "en"


def plural_category(locale: str, number) -> str:
    """CLDR cardinal rules for the 17 catalogs, matching Intl numeric operands."""
    locale = locale_name(locale)
    n = abs(Decimal(str(number)).normalize())
    i = int(n)
    v = max(0, -n.as_tuple().exponent)
    if locale in {"zh", "zh-hant", "ja", "ko"}:
        return "other"
    if locale in {"en", "de", "it"}:
        if locale == "it" and v == 0 and i != 0 and i % 1000000 == 0:
            return "many"
        return "one" if i == 1 and v == 0 else "other"
    if locale in {"es", "fr", "pt"}:
        one = n == 1 if locale == "es" else i in {0, 1}
        if one:
            return "one"
        return "many" if v == 0 and i != 0 and i % 1000000 == 0 else "other"
    if locale in {"tr", "hu", "af"}:
        return "one" if n == 1 else "other"
    if locale in {"ru", "uk"}:
        if v != 0:
            return "other"
        if i % 10 == 1 and i % 100 != 11:
            return "one"
        if i % 10 in {2, 3, 4} and i % 100 not in {12, 13, 14}:
            return "few"
        return "many"
    if locale == "ga":
        if v != 0:
            return "other"
        return "one" if n == 1 else "two" if n == 2 else "few" if 3 <= n <= 6 else "many" if 7 <= n <= 10 else "other"
    if locale == "ar":
        if n == 0:
            return "zero"
        if n == 1:
            return "one"
        if n == 2:
            return "two"
        if v == 0 and 3 <= n % 100 <= 10:
            return "few"
        if v == 0 and 11 <= n % 100 <= 99:
            return "many"
    return "other"


@lru_cache(maxsize=17)
def catalog(locale: str) -> dict:
    return json.loads((Path(__file__).parent / "i18n" / (locale_name(locale) + ".json")).read_text(encoding="utf-8"))


def message(locale: str, key: str, **values) -> str:
    value = catalog(locale)["chat"][key]
    if isinstance(value, dict):
        value = value[plural_category(locale, values["count"])]
    return value.format(**values)


def choose_locale(explicit=None, settings=None) -> str:
    if explicit:
        return locale_name(explicit)
    if settings and settings.get("chat_language"):
        return locale_name(settings["chat_language"])
    try:
        from agent.i18n import get_language
        return locale_name(get_language())
    except Exception:
        return "en"


def duration(seconds, locale: str) -> str:
    value = float(seconds or 0)
    minutes = int(max(0, value) // 60) if math.isfinite(value) else 0
    days, remainder = divmod(minutes, 1440)
    hours, mins = divmod(remainder, 60)
    units = catalog(locale)["chat"]["units"]
    if days:
        return f"{days}{units['day']}" + (f" {hours}{units['hour']}" if hours else "")
    if hours:
        return f"{hours}{units['hour']}" + (f" {mins}{units['minute']}" if mins else "")
    return f"{mins}{units['minute']}"


_MARKDOWN = re.compile(r"([\\`*_{}\[\]()<>#+.!|~\-])")
_LINK = re.compile(r"https://discord\.com/channels/(?:[0-9]{1,25}|@me)/[0-9]{1,25}(?:/[0-9]{1,25})?")


def safe_field(value, limit=70) -> str:
    # Collapse line/terminal controls before escaping. Bound the *escaped*
    # field without cutting an escape pair (which could re-enable Markdown).
    text = " ".join("".join(c if c.isprintable() else " " for c in str(value or "")).split())
    text = text.replace("@", "@\u200b")
    parts = []
    size = 0
    for char in text:
        token = "\\" + char if _MARKDOWN.fullmatch(char) else char
        if size + len(token) > limit - 1:
            return "".join(parts) + "…"
        parts.append(token)
        size += len(token)
    return "".join(parts)


def sections(data: dict):
    conv = data.get("conversations", {})
    deleg = data.get("delegations", {})
    return [
        ("waiting", list(conv.get("unanswered", [])) + list(conv.get("waiting", [])), 8),
        ("running", list(conv.get("running", [])) + list(deleg.get("running", [])), 5),
        ("dropped", list(deleg.get("dropped", [])), 5),
        ("cron", list(data.get("cron", {}).get("problems", [])), 5),
        ("goals", list(data.get("goals", {}).get("items", [])), 5),
    ]


def _item_line(item, section, locale, now, viewer):
    # Defense in depth: never trust private fields, even if a future collector
    # accidentally includes a title, ask, summary, goal or link with them.
    private = bool(item.get("private"))
    meta = item.get("session") or item
    if private:
        title = message(locale, "hidden")
        place = message(locale, "privatePlace")
    else:
        title = safe_field(item.get("goal") or item.get("name") or item.get("title") or meta.get("title")) or message(locale, "untitled")
        place = safe_field(meta.get("where"), 35) or safe_field(meta.get("source"), 25) or message(locale, "localPlace")
    timestamp = next((item[k] for k in ("since", "started_at", "completed_at", "dispatched_at", "last_at", "activity_at") if item.get(k) is not None), now)
    age = duration(now - float(timestamp), locale)
    if section == "running" and item.get("stalled"):
        age = message(locale, "stalled", age=age)
    text = message(locale, "item", title=title, place=place, age=age)
    link = meta.get("link")
    if not private and viewer.get("link_style") == "discord" and isinstance(link, str) and _LINK.fullmatch(link):
        text += " <" + link + ">"
    return "- " + text


def render_summary(data, *, locale, now, viewer) -> str:
    locale = locale_name(locale)
    if not viewer.get("is_owner"):
        return message(locale, "ownerOnly")
    groups = sections(data)
    counts = {key: len(items) for key, items, _ in groups}
    headline = message(locale, "headline", waiting=message(locale, "waitingCount", count=counts["waiting"]), running=message(locale, "runningCount", count=counts["running"]), cron=message(locale, "cronCount", count=counts["cron"]))
    if not any(counts.values()):
        return message(locale, "empty")
    if viewer.get("counts_only"):
        lines = [headline]
        for key, items, _ in groups:
            if items:
                lines.append(message(locale, key + "Count", count=len(items)))
        return "\n".join(lines)

    shown = {key: min(len(items), maximum) for key, items, maximum in groups}

    def compose():
        lines = [headline]
        for key, items, _ in groups:
            if not items:
                continue
            lines.append("\n" + message(locale, key + "Heading"))
            lines.extend(_item_line(item, key, locale, now, viewer) for item in items[:shown[key]])
            if len(items) > shown[key]:
                lines.append(message(locale, "more", count=len(items) - shown[key]))
        return "\n".join(lines)

    text = compose()
    # Preserve all section headers/counts, dropping complete item lines rather
    # than slicing Markdown/links or silently losing an entire later section.
    while len(text) > MAX_CHARS and any(shown.values()):
        key = max(shown, key=lambda k: shown[k])
        shown[key] -= 1
        text = compose()
    return text
