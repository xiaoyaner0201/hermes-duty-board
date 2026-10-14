"""Caller resolution against a real session-context module.

The other chat tests stub ``commands._session``. These do not: they bind the
session ContextVars (or leave them unset) the way Hermes does and let the
command resolve the caller itself, so a regression there shows up here.

They use Hermes's own ``gateway.session_context`` when it is importable, and a
faithful stand-in otherwise (``tests/fixtures/fake_session_context.py``).
"""
from __future__ import annotations

import importlib
import json
import sys

import pytest

from tests.fixtures.make_home import add_message, add_session

OWNER = "222222222222222222"


@pytest.fixture(params=["host", "stand-in"])
def session_context(request, monkeypatch):
    if request.param == "host":
        try:
            module = importlib.import_module("gateway.session_context")
        except ImportError:
            pytest.skip("Hermes is not importable here")
    else:
        from tests.fixtures import fake_session_context as module

        gateway = type(sys)("gateway")
        gateway.session_context = module
        monkeypatch.setitem(sys.modules, "gateway", gateway)
        monkeypatch.setitem(sys.modules, "gateway.session_context", module)
    module.reset_session_vars()
    yield module
    module.reset_session_vars()


@pytest.fixture
def duty(commands, session_context, monkeypatch):
    # Undo conftest's stubs so the command resolves the caller and the process itself.
    monkeypatch.setattr(commands, "_session", commands.real_resolvers["_session"])
    monkeypatch.setattr(commands, "_in_gateway", commands.real_resolvers["_in_gateway"])
    return commands.duty


def _as_gateway_process(monkeypatch, is_gateway=True):
    """Make this test process look like the live gateway: the marker is set
    and the gateway PID file names this process."""
    import os

    monkeypatch.setenv("_HERMES_GATEWAY", "1")
    status = type(sys)("gateway.status")
    status.get_running_pid = lambda cleanup_stale=True: os.getpid() if is_gateway else os.getpid() + 1
    monkeypatch.setitem(sys.modules, "gateway.status", status)
    package = sys.modules.get("gateway")
    if package is not None:
        monkeypatch.setattr(package, "status", status, raising=False)


def _settings(home, **values):
    (home / "duty-board" / "settings.json").write_text(json.dumps(values))


def _waiting(home):
    now = float((home / "fixture-now").read_text())
    add_session(home, "mine", title="OWNERTITLE", now=now)
    add_message(home, "mine", "assistant", "May I continue?", timestamp=now - 300)


def test_process_environment_never_identifies_the_caller(duty, home, monkeypatch):
    """A local CLI/TUI started from a gateway-spawned terminal inherits the
    gateway's HERMES_SESSION_* values in os.environ. They describe whoever ran
    that earlier turn, not the person typing now."""
    _settings(home, owner=OWNER)
    _waiting(home)
    monkeypatch.setenv("HERMES_SESSION_PLATFORM", "discord")
    monkeypatch.setenv("HERMES_SESSION_USER_ID", OWNER)
    monkeypatch.setenv("HERMES_SESSION_CHAT_TYPE", "dm")
    _as_gateway_process(monkeypatch)
    # Inside a gateway nothing is bound for this call: an old host. It must refuse
    # even though os.environ names the owner in a DM.
    result = duty()
    assert "OWNERTITLE" not in result
    assert "0.21.7" in result


def test_inherited_environment_does_not_lock_out_the_local_cli(duty, home, monkeypatch):
    _settings(home, owner=OWNER)
    _waiting(home)
    monkeypatch.setenv("HERMES_SESSION_PLATFORM", "discord")
    monkeypatch.setenv("HERMES_SESSION_USER_ID", "999")
    monkeypatch.setenv("HERMES_SESSION_CHAT_TYPE", "channel")
    # The hermes CLI imports gateway.run, which sets the marker, but it is not the gateway.
    _as_gateway_process(monkeypatch, is_gateway=False)
    result = duty()
    assert "only available" not in result
    assert "OWNERTITLE" in result


def test_bound_owner_and_stranger(duty, home, monkeypatch, session_context):
    _settings(home, owner=OWNER)
    _waiting(home)
    _as_gateway_process(monkeypatch)
    tokens = session_context.set_session_vars(platform="discord", user_id=OWNER, chat_type="dm", chat_id="1")
    try:
        assert "OWNERTITLE" in duty()
    finally:
        session_context.clear_session_vars(tokens)
    session_context.reset_session_vars()
    tokens = session_context.set_session_vars(platform="discord", user_id="999", chat_type="dm", chat_id="1")
    try:
        assert "only available" in duty()
    finally:
        session_context.clear_session_vars(tokens)


def test_bound_thread_gets_counts(duty, home, monkeypatch, session_context):
    _settings(home, owner=OWNER)
    _waiting(home)
    _as_gateway_process(monkeypatch)
    tokens = session_context.set_session_vars(platform="discord", user_id=OWNER, chat_type="thread", chat_id="1", thread_id="2")
    try:
        result = duty()
    finally:
        session_context.clear_session_vars(tokens)
    assert "OWNERTITLE" not in result
    assert "1 waiting on you" in result


def test_bound_messaging_surface_without_a_caller_fails_closed(duty, home, session_context):
    """A surface bound with a messaging platform but no user id must not fall
    through to local trust, even outside a gateway process."""
    _settings(home, owner=OWNER)
    _waiting(home)
    tokens = session_context.set_session_vars(platform="telegram", chat_type="dm", chat_id="1")
    try:
        result = duty()
    finally:
        session_context.clear_session_vars(tokens)
    assert "OWNERTITLE" not in result
    assert "only available" in result


def test_cleared_context_is_local(duty, home, session_context):
    """After a turn the host clears the vars to "" (not unset). That is a bound,
    empty, local context: the local user is trusted."""
    _settings(home, owner=OWNER)
    _waiting(home)
    tokens = session_context.set_session_vars(platform="discord", user_id=OWNER, chat_type="dm", chat_id="1")
    session_context.clear_session_vars(tokens)
    assert "OWNERTITLE" in duty()
