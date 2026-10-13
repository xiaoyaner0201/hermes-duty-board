# Security Policy

## Supported versions

Security fixes go into the latest release only.

## Reporting a vulnerability

Please **do not** open a public issue. Report it privately through GitHub's **Report a vulnerability** button on the [Security tab](https://github.com/xiaoyaner0201/hermes-duty-board/security/advisories/new).

Please include affected versions, reproduction steps, and the impact you observed. Expect an acknowledgement within 7 days.

## Scope and design notes

What the plugin is designed to do, so reports can focus on deviations from it:

- The API is served by the Hermes dashboard under `/api/plugins/duty-board/` and sits behind the dashboard's authentication gate. Do not expose the dashboard publicly without authentication.
- It opens `<HERMES_HOME>/state.db` read-only (`mode=ro`) and reads `cron/jobs.json` and `gateway_state.json`.
- It writes only `<HERMES_HOME>/duty-board/dismissed.json`.
- It makes no outbound network requests, calls no model, and reads no credentials (`.env`, `auth.json`, keychains).
- Links it renders are built only from numeric platform IDs (`https://discord.com/channels/...` and `discord://-/channels/...`). Any way to make it render a link with another scheme or host is in scope.
- Message excerpts are rendered as text, not HTML. Any way to inject markup through message content is in scope.
