# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Model-free `/duty` chat summaries and `hermes duty` CLI (`--full`, `--counts`, `--lang`, `--json`), sharing the read-only dashboard collectors.
- Chat strings and compact durations in all 17 locales, with pinned Python CLDR plural rules.
- Owner-only chat access on Hermes 0.21.7+, full details in DMs and counts-only shared-channel replies unless explicitly opted in; mentions and Markdown in item fields are neutralized.
- Offline synthetic coverage for command registration, CLI output, access, privacy, rendering, locale fallback and settings-aware caching.

### Fixed

- Improved Turkish dashboard wording after native-speaker review. Thanks to [@farukttbasar](https://github.com/farukttbasar) for the corrections ([#4](https://github.com/xiaoyaner0201/hermes-duty-board/pull/4)).

## [0.3.0] - 2026-10-14

### Added

- The tab now speaks all 17 languages the Hermes dashboard ships: English, 简体中文, 繁體中文, 日本語, 한국어, Deutsch, Español, Français, Italiano, Português, Русский, Українська, Türkçe, Magyar, Afrikaans, Gaeilge and العربية.
- Right-to-left layout for Arabic. Titles, channel names and quoted messages keep their own direction, so an English reply inside the Arabic UI still reads correctly.
- The tab follows the dashboard's language switch live, without a reload.
- Counts use each language's CLDR plural rules. Durations, numbers and lists are formatted by the browser's `Intl` APIs.
- A translation guide in CONTRIBUTING.md and a *Translation fix* issue template. Catalogs are plain JSON in `dashboard/i18n/`.

### Changed

- The summary API reports section problems as structured `issues` (`{section, code, detail}`), so the UI can translate them. `schema_version` is now 2. The plain-text `warnings` list is kept for older bundles.
- A failed collector reports only the exception class name, never its message.
- The question-mark rule for *Waiting on you* also accepts the Arabic question mark (`؟`), and a question mark followed by a closing quote or guillemet.

### Fixed

- An unsupported locale whose name matches a JavaScript object property (`constructor`) no longer breaks the tab.

## [0.2.1] - 2026-10-13

First public release.

### Added

- Dashboard sections: *Waiting on you*, *You wrote, but no reply arrived*, *Running*, *Background jobs*, *Scheduled jobs*, *Recently completed* and *Standing goals*.
- **Open in Discord** buttons that jump to a thread in the Discord desktop app, landing on your message when its ID is known. A header toggle switches to opening in the browser.
- English, Simplified Chinese, Traditional Chinese and Japanese UI, following the dashboard's language setting.
- Optional `settings.json`: owner, privacy, tunable windows and the list of messaging sources.
- Per-section degradation with a warning banner when Hermes's internal schema changes.
- Fictional demo home (`dev/demo_home.py`) and a local harness for screenshots and UI work.

### Security

- Shared threads are attributed to the sender of the latest message when the gateway recorded one, so another person's words are never shown as the owner's.
- Other people's background-job summaries are hidden along with their goals.
- Rewound (undone) messages are ignored.
- Discord links are built only from ASCII-digit ids.
- Dismiss writes are serialised and capped at 2000 entries.

[Unreleased]: https://github.com/xiaoyaner0201/hermes-duty-board/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/xiaoyaner0201/hermes-duty-board/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/xiaoyaner0201/hermes-duty-board/releases/tag/v0.2.1
