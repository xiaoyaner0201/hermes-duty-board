# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/xiaoyaner0201/hermes-duty-board/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/xiaoyaner0201/hermes-duty-board/releases/tag/v0.2.1
