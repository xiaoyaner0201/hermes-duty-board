# Contributing

Thanks for helping. Duty Board is small on purpose. It is one read-only dashboard tab that answers "what needs me right now?", and changes should keep it that way.

## Ground rules

- **Read-only.** Never write to Hermes state (`state.db`, `cron/jobs.json`, sessions). The plugin may write only to its own directory, `<HERMES_HOME>/duty-board/`.
- **No network and no model calls.** Waiting detection is deterministic on purpose. It is cheap and predictable, and it runs on every refresh.
- **Public surfaces only.** Use the dashboard plugin SDK (`window.__HERMES_PLUGIN_SDK__`) and the plugin API mount. Do not patch Hermes or the dashboard at runtime.
- **Degrade, don't crash.** Hermes's internal tables can change between releases. A collector that cannot find the table or column it needs returns an empty section plus a warning. It must never fail the whole response.
- **No personal data in the repo.** Use fictional IDs and names in tests, fixtures and screenshots.

## Development setup

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
python -m pytest
ruff check .
node --check dashboard/dist/index.js
node tests/js/i18n_check.mjs
```

To see the UI, use the harness in `dev/` (see `dev/README.md`). It renders the tab against a synthetic Hermes home, so no real data is involved.

## Pull requests

- Keep each PR to one change and use [Conventional Commits](https://www.conventionalcommits.org/) titles (`feat:`, `fix:`, `docs:`, ...).
- Add or update tests for any behaviour change. The suite needs no real Hermes install and no credentials.
- For UI changes, attach a screenshot from the harness.
- New UI strings go into **every** locale in the `MESSAGES` catalog at the top of `dashboard/dist/index.js`. If you are unsure of a translation, copy the English text and say so in the PR; `i18n_check.mjs` fails on missing keys, not on untranslated ones.

## Adding a language

1. Add a locale object to `MESSAGES` in `dashboard/dist/index.js`, keyed by the dashboard's locale code (`hermes-locale`, e.g. `ko`, `de`).
2. Optionally extend the waiting and promise phrase lists in `dashboard/plugin_api.py` for that language, with tests in `tests/`.
3. Optionally add a `README.<lang>.md` and link it from the language bar at the top of every README.

## Reporting bugs

Please include your Hermes version (`hermes --version`), what the tab showed, and what you expected. Redact message content; usually the card's section and timing are enough.
