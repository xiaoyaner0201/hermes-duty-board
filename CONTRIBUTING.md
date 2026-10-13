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
node tools/build_i18n.mjs --check
node tests/js/i18n_check.mjs
node tests/js/runtime_check.mjs
(cd tests/js && npm install --no-package-lock) && node tests/js/render_check.mjs
```

To see the UI, use the harness in `dev/` (see `dev/README.md`). It renders the tab against a synthetic Hermes home, so no real data is involved.

## Pull requests

- Keep each PR to one change and use [Conventional Commits](https://www.conventionalcommits.org/) titles (`feat:`, `fix:`, `docs:`, ...).
- Add or update tests for any behaviour change. The suite needs no real Hermes install and no credentials.
- For UI changes, attach a screenshot from the harness.
- New UI strings go into `dashboard/i18n/en.json` first. Add the same key to every other catalog; if you cannot translate it, open the PR anyway and say so, and a maintainer will fill it in. Then run `node tools/build_i18n.mjs` to refresh the bundle.
- Never build sentences by concatenating translated fragments. Use one message with `{placeholders}` so translators can reorder words.
- The API returns codes (`issues`, `cron.problems[].reasons`) and the UI translates them. Do not put user-facing prose in `plugin_api.py`.

## Translations

The tab ships every locale the Hermes dashboard has. Catalogs are plain JSON in `dashboard/i18n/<locale>.json`, and `en.json` is the source of truth. The bundle carries a generated copy (between the `i18n:start` and `i18n:end` markers in `dashboard/dist/index.js`). Edit the JSON, never the bundle.

To fix or improve a translation:

1. Edit `dashboard/i18n/<locale>.json`.
2. Run `node tests/js/i18n_check.mjs --only <locale>`. It checks:
   - that no key is missing or extra;
   - that every `{placeholder}` from English is present;
   - that plural messages carry exactly your language's [CLDR plural categories](https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html) (`one`, `few`, `many`, …).
3. Run `node tools/build_i18n.mjs`, then commit both the JSON and the bundle.

Plural messages are objects such as `{ "one": "{count} paused", "other": "{count} paused" }`. Durations ("5 min") are formatted by the browser and passed in as `{value}` or `{duration}`, so you only translate the sentence around them.

To add a locale that Hermes itself starts shipping, add its code to `SUPPORTED` in `tests/js/i18n_check.mjs` and create the catalog.

Native-speaker review is the most useful contribution here. The non-English, non-Chinese and non-Japanese catalogs were drafted carefully but have not yet been checked by native speakers.

Optionally, extend the waiting and promise phrase lists in `dashboard/plugin_api.py` for your language, with tests in `tests/`. The question-mark rule already covers every language.

## Reporting bugs

Please include your Hermes version (`hermes --version`), what the tab showed, and what you expected. Redact message content; usually the card's section and timing are enough.
