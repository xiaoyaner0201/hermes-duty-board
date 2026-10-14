from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.fixtures.make_home import make_home

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    import os
    import socket

    # Never authorize tests from the invoking agent's real chat context.
    for name in tuple(os.environ):
        if name.startswith("HERMES_SESSION_") or name in {"_HERMES_GATEWAY", "HERMES_LANGUAGE", "DUTY_BOARD_OWNER"}:
            monkeypatch.delenv(name, raising=False)

    def refuse(*args, **kwargs):
        raise AssertionError("Tests may not access the network")

    monkeypatch.setattr(socket.socket, "connect", refuse)
    monkeypatch.setattr(socket, "create_connection", refuse)


@pytest.fixture
def commands(home, monkeypatch):
    from tests.test_board import load_plugin
    import importlib

    package = load_plugin("duty_commands_" + str(id(home)))
    module = importlib.import_module(package.__name__ + ".dashboard.commands")
    monkeypatch.delenv("_HERMES_GATEWAY", raising=False)
    monkeypatch.setattr(module, "_session", lambda name: "")
    return module


@pytest.fixture
def home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    result = make_home(tmp_path / "hermes-home")
    monkeypatch.setenv("HERMES_HOME", str(result))
    monkeypatch.delenv("DUTY_BOARD_OWNER", raising=False)
    return result


@pytest.fixture
def api_module(home: Path):
    name = f"duty_board_test_{id(home)}"
    spec = importlib.util.spec_from_file_location(name, ROOT / "dashboard" / "plugin_api.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    module._cache.update(at=0.0, data=None, home=None)
    return module


@pytest.fixture
def client(api_module):
    app = FastAPI()
    app.include_router(api_module.router, prefix="/api/plugins/duty-board")
    with TestClient(app) as test_client:
        yield test_client
