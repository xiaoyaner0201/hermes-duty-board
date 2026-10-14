"""Owner-gated synchronous commands. No web, network or model dependencies."""
from __future__ import annotations

import json
import logging
import os
import shlex
import time

from . import board
from .summary_text import choose_locale, message, render_summary

logger = logging.getLogger(__name__)

try:
    from hermes_constants import get_hermes_home
    board.get_hermes_home = get_hermes_home
except ImportError:  # outside Hermes
    pass


def _session(name: str) -> str:
    try:
        from gateway.session_context import get_session_env
        return str(get_session_env(name) or "")
    except ImportError:
        # Old hosts have no context binding. Never use process-global session
        # values as an authorization substitute (they can belong to a cron).
        return ""


def _arguments(raw: str):
    if len(raw) > 512:
        raise ValueError("arguments too long")
    mode, lang = "", None
    tokens = shlex.split(raw)
    for token in tokens:
        if token in {"full", "counts"}:
            mode = token
        elif token.startswith("lang="):
            lang = token[5:]
        else:
            lang = token
    return mode, lang


def _error(locale, exc):
    logger.exception("Duty Board command failed (%s)", type(exc).__name__)
    return message(locale, "error", error=type(exc).__name__)


def duty(raw_args: str = "") -> str:
    locale = "en"
    try:
        settings = board._settings()
        locale = choose_locale(settings=settings)
        mode, explicit = _arguments(raw_args)
        locale = choose_locale(explicit, settings)
        platform = _session("HERMES_SESSION_PLATFORM").lower()
        user_id = _session("HERMES_SESSION_USER_ID")
        chat_type = _session("HERMES_SESSION_CHAT_TYPE").lower()
        in_gateway = os.environ.get("_HERMES_GATEWAY") == "1"
        local = platform in {"", "cli", "tui"} and not in_gateway
        if in_gateway and platform in {"", "cli", "tui"}:
            return message(locale, "oldHost")
        runtime = board._runtime_settings(settings)
        owner = runtime["owner"]
        if not local and not owner:
            return message(locale, "configureOwner")
        if not local and user_id != owner:
            return message(locale, "ownerOnly")
        full = local or chat_type == "dm"
        if mode == "full" and chat_type in {"group", "channel", "thread"}:
            full = settings.get("chat_full_in_channels") is True
        if mode == "counts":
            full = False
        data = board.cached_summary(settings=runtime)
        text = render_summary(data, locale=locale, now=time.time(), viewer={"is_owner": True, "platform": platform, "link_style": "discord" if platform == "discord" else "plain", "counts_only": not full})
        if mode == "full" and not full:
            text += "\n" + message(locale, "dmHint")
        return text
    except Exception as exc:
        try:
            return _error(locale, exc)
        except Exception:
            # Even a damaged catalog must not escape into the gateway.
            return "Duty Board unavailable (" + type(exc).__name__ + ")."


def setup_cli(parser) -> None:
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--full", action="store_true", help="Show item details (default)")
    group.add_argument("--counts", action="store_true", help="Show counts only")
    parser.add_argument("--lang", metavar="L", help="Summary language")
    parser.add_argument("--json", action="store_true", help="Print raw board JSON")


def cli_handler(args) -> None:
    # A terminal command runs as the local account that can already read the
    # home. No messaging context/owner id exists in Hermes's CLI dispatch.
    locale = "en"
    try:
        settings = board._settings()
        locale = choose_locale(args.lang, settings)
        data = board.cached_summary(settings=board._runtime_settings(settings))
        if args.json:
            print(json.dumps(data, ensure_ascii=False))
        else:
            print(render_summary(data, locale=locale, now=time.time(), viewer={"is_owner": True, "platform": "cli", "link_style": "plain", "counts_only": args.counts}))
    except Exception as exc:
        try:
            print(_error(locale, exc))
        except Exception:
            print("Duty Board unavailable (" + type(exc).__name__ + ").")
