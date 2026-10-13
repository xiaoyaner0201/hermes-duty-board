"""Local acceptance harness: serves the real plugin bundle + the real plugin API
(read-only against live state.db) on 127.0.0.1 so the page can be rendered and
screenshotted without the authenticated production Dashboard."""
import importlib.util
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn

HERE = Path(__file__).parent
PLUGIN = Path(__file__).resolve().parents[2] / "dashboard"

spec = importlib.util.spec_from_file_location("duty_board_api", PLUGIN / "plugin_api.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

app = FastAPI()
app.include_router(mod.router, prefix="/api/plugins/duty-board")
app.mount("/plugin", StaticFiles(directory=PLUGIN / "dist"), name="plugin")


@app.get("/")
def index():
    return FileResponse(HERE / "index.html")


@app.get("/sdk.js")
def sdk():
    return FileResponse(HERE / "sdk.js")


@app.get("/theme.css")
def theme():
    return FileResponse(HERE / "theme.css")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=9188, log_level="warning")
