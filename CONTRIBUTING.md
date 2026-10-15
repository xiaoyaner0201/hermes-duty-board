# Contributing

Thanks for helping. Duty Board is small on purpose. It is a read-only dashboard tab with model-free chat and CLI summaries that answers "what needs me right now?", and changes should keep it that way.

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

## Release-schema compatibility

Ordinary `python -m pytest -q` now builds synthetic homes from
`tests/fixtures/hermes-v0.22.0.sql`. This runs the existing privacy, authorization,
summary-budget and read-only assertions against release constraints without
installing or importing Hermes, accessing credentials, or making network calls.
`tests/test_release_schema.py` also proves that omitting a delegation origin and
reusing a nonempty session title are rejected. The legacy delegation test replaces
only its synthetic delegation table with explicit DDL lacking `origin_session_id`;
it does not try to drop a column from arbitrary release SQL.

The SQL was captured from a fresh real `hermes_state.SessionDB` in Hermes Agent
[v0.22.0](https://github.com/NousResearch/hermes-agent/releases/tag/v0.22.0), commit
[`e06df9c2eae6901f4c88f464e0ae6e753c0428b8`](https://github.com/NousResearch/hermes-agent/tree/e06df9c2eae6901f4c88f464e0ae6e753c0428b8).
`capture_release_schema.py` constructs a temporary fictional home with `make_home`,
sets `HERMES_HOME` before importing Hermes, replaces only that temporary DB with
SessionDB, closes it, then reads `sqlite_schema`. It preserves the SQL for the five
collector-facing tables, the referenced `system_prompts` table, and their explicit
indexes verbatim in deterministic order. It captures no rows, unrelated tables,
FTS objects or triggers; it is a collector-schema snapshot, not a full runtime DB.
Substantial SQL retains Nous Research's MIT notice in
`tests/fixtures/hermes-schema-LICENSE.txt`.

To independently check or recapture, supply a separately prepared interpreter and
read-only source archive at that exact commit (do not use a live Hermes home):

```bash
PYTHONPATH="$NETWORK_GUARD:$PWD:$RELEASE_SOURCE" "$RELEASE_PYTHON" -m tests.fixtures.capture_release_schema --check tests/fixtures/hermes-v0.22.0.sql
PYTHONPATH="$NETWORK_GUARD:$PWD:$RELEASE_SOURCE" "$RELEASE_PYTHON" -m tests.fixtures.capture_release_schema > schema-capture.sql
```

Run these under a bounded subprocess, with `HOME` and `HERMES_HOME` routed to
synthetic temporary directories and a credential-free environment.
`NETWORK_GUARD` must contain a `sitecustomize.py` that blocks outbound sockets and
is inherited by Python subprocesses. Ordinary pytest additionally installs the
suite's offline guard. Review capture output before replacing the committed SQL;
never infer a release schema by editing the simplified DDL. The optional
`make_home(..., schema="simplified")` fixture and `SESSION_DDL` remain available for
deliberate reduced-schema tests, separate from the default release snapshot.

## Pull requests

- Keep each PR to one change and use [Conventional Commits](https://www.conventionalcommits.org/) titles (`feat:`, `fix:`, `docs:`, ...).
- Add or update tests for any behaviour change. The suite needs no real Hermes install and no credentials.
- For UI changes, attach a screenshot from the harness.
- New UI strings go into `dashboard/i18n/en.json` first. Add the same key to every other catalog; if you cannot translate it, open the PR anyway and say so, and a maintainer will fill it in. Then run `node tools/build_i18n.mjs` to refresh the bundle.
- Never build sentences by concatenating translated fragments. Use one message with `{placeholders}` so translators can reorder words.
- The API returns codes (`issues`, `cron.problems[].reasons`) and the UI translates them. Do not put user-facing prose in the collectors (`dashboard/board.py`) or `plugin_api.py`.

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

### Chat strings and privacy tests

Add new summary strings to the top-level `chat` group in English first, then all 16 other catalogs. Keep complete sentences with matching placeholders. `chat.*Count` and `chat.more` are CLDR plural objects; include exactly the categories required by the locale. `chat.units` contains compact `minute`, `hour` and `day` abbreviations: the Python renderer uses these instead of browser `Intl`. Update `dashboard/summary_text.py` and pinned tests if the supported plural rules change. The normal bundle generator includes the group even though the dashboard UI does not use it.

Run `python -m pytest`, `node tests/js/i18n_check.mjs` and `node tools/build_i18n.mjs`. Tests use fictional homes and block outbound sockets. Command tests must prove refusal **before collection**, DM/channel separation, strict channel opt-in, private-field redaction and mention/Markdown/newline/length sanitation. For any changed access or privacy guard, prove RED: copy the candidate into a disposable directory, remove just that guard, run its named test and retain the failed assertion, then restore the bytes and run GREEN. Never mutate a live plugin or use a real Hermes home. No extra CI step is needed: pytest discovers these tests automatically.

To add a locale that Hermes itself starts shipping, add its code to `SUPPORTED` in `tests/js/i18n_check.mjs` and create the catalog.

Native-speaker review is the most useful contribution here. The non-English, non-Chinese and non-Japanese catalogs were drafted carefully but have not yet been checked by native speakers.

Optionally, extend the waiting and promise phrase lists in `dashboard/board.py` for your language, with tests in `tests/`. The question-mark rule already covers every language.

## Reporting bugs

Please include your Hermes version (`hermes --version`), what the tab showed, and what you expected. Redact message content; usually the card's section and timing are enough.
