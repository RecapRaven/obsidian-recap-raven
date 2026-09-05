# Recap Raven Obsidian Plugin

[![CI](https://github.com/RecapRaven/obsidian-recap-raven/actions/workflows/ci.yml/badge.svg)](https://github.com/RecapRaven/obsidian-recap-raven/actions/workflows/ci.yml)
[![Security](https://github.com/RecapRaven/obsidian-recap-raven/actions/workflows/security.yml/badge.svg)](https://github.com/RecapRaven/obsidian-recap-raven/actions/workflows/security.yml)
[![MIT licence](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)

Import player-safe [Recap Raven](https://recapraven.com) session recaps into your vault as structured, local Markdown, with optional normalised transcripts in linked notes beneath each recap. Imports are manual and create-only: existing notes are never overwritten or deleted.

The plugin uses a campaign-bound Obsidian export key and never uploads vault content. Transcript importing is off by default and requires explicit permission in both the key and plugin settings. Transcripts may contain private GM material; use a vault intended to hold that material.

## Features

- Import one, several, or all new player-safe session recaps.
- Optionally import normalised transcripts beneath their recaps, including missing transcripts for previously imported recaps.
- Preview exact destination paths before anything is written.
- Detect previous imports by stable Recap Raven session ID, including notes moved or renamed while the plugin is enabled.
- Protect path collisions with deterministic alternate filenames.
- Add campaign, session, date, source, and content-hash properties.
- Optionally create a campaign index with a live Obsidian query, without changing an existing index.
- Open an imported recap in Recap Raven from the command palette.
- No background sync, vault uploads, client-side telemetry, or advertisements.

## Requirements

- Obsidian 1.11.4 or later on desktop.
- A Recap Raven account with an active campaign. Obsidian export keys are available on every plan, including Free.
- A campaign-bound **Obsidian export** key. A full MCP key cannot be used.

[Create or manage export keys](https://recapraven.com/account/api-keys).

## Installation

Once the plugin is listed in the Obsidian Community Plugins directory, install and enable **Recap Raven** from **Settings → Community plugins**.

Before the Community listing is available, download `main.js`, `manifest.json`, and `styles.css` from the latest [GitHub release](https://github.com/RecapRaven/obsidian-recap-raven/releases). Place them in `.obsidian/plugins/recap-raven/` inside a dedicated vault, reload Obsidian, and enable **Recap Raven** under **Community plugins**. Only install release assets published by the Recap Raven GitHub organization.

## Setup

1. Open **Settings → Recap Raven**.
2. Under **Recap Raven export API key**, create or select an Obsidian secret. Use a lowercase secret ID such as `recap-raven-api-key`, then paste your campaign-bound `raven_obs_…` key as its value.
3. Select **Test connection**. The bound campaign name should appear.
4. Optionally change the import folder, tags, or campaign-index preference.

The export key fixes the campaign on the server. The integration cannot select another campaign or broaden the key's access. New keys can be created for active campaigns; an existing key continues to support importing history after its campaign is archived.

## Import recaps

Select the download icon in the ribbon, or open the command palette and run one of these commands:

- **Import session recaps** — search and select individual recaps, preview the plan, then import.
- **Import all new recaps** — select every recap not already present in the vault and review the plan.
- **Preview new recap import** — show a dry-run plan without offering to write files.
- **Create campaign index** — create the live-query index without changing an existing file. When `Campaign index.md` contains different content, the plugin creates `Campaign index (Recap Raven).md` alongside it.
- **Open current imported recap** — available when the active note contains a valid Recap Raven session ID.

By default, notes are created under:

```text
Recap Raven/<Campaign name>/Sessions/YYYY-MM-DD - Session <number> - <Title>.md
```

The recorded-date prefix keeps notes in chronological filename order. When a recorded date is unavailable, the filename begins with the session number instead.

If a destination is already occupied by an unrelated note, the importer uses a stable short session-ID suffix. If the session ID is in the plugin's private import index, the recap is skipped. Files are never overwritten, updated, renamed, moved, or deleted.

To include normalised session transcripts, create an export key with transcript access and enable **Include session transcripts** in the plugin settings. This is off by default. Transcripts may contain private GM material; enable it only for a vault intended to hold that material. Each transcript is created at `<recap filename>/Transcript.md`, with a link back to the recap. New recaps also link to their transcript. Existing recaps can receive a missing transcript without changing the recap; existing transcript files are preserved. If a transcript write fails after its recap is created, repeat the import to retry the missing transcript. For an existing campaign index, run **Create campaign index** to create a recap-only index alongside it; existing files are preserved.

Existing export keys continue to work for recaps. To enable transcripts for an active campaign with an existing key, revoke that key, create a replacement with transcript access, and select the replacement secret in Obsidian before enabling **Include session transcripts**. Only one export key can be active per campaign. Rotating a key preserves its permissions and does not enable transcript access.

## Imported properties

Each session note includes YAML properties similar to:

```yaml
recap_raven_session_id: "00000000-0000-4000-8000-000000000000"
recap_raven_campaign_id: "00000000-0000-4000-8000-000000000001"
recap_raven_campaign: "The Glass Archive"
session_number: 7
title: "Through the Silver Door"
recorded_at: "2026-08-15T18:30:00Z"
ready_at: "2026-08-16T01:00:00Z"
artifact_created_at: "2026-08-16T00:59:00Z"
source_url: "https://recapraven.com/recaps/00000000-0000-4000-8000-000000000000"
content_sha256: "..."
tags: ["recap-raven", "session-recap"]
```

Before writing a note, the integration validates the campaign and session identities, source URL, content integrity, and size, and rejects potentially active content.

## Account and network use

This integration requires a Recap Raven account and a campaign-bound export key. Plugin-initiated network activity occurs only when you:

- select **Create an export key** in settings;
- select **Test connection**;
- open or preview an import;
- import recaps;
- create a campaign index; or
- explicitly open a recap in Recap Raven.

API requests are sent only to `https://api.recapraven.com`. They use read-only endpoints to download the bound campaign's player-safe metadata and recap Markdown, plus normalised transcripts when enabled in both the export key and plugin settings. Transcript identities, size, and SHA-256 integrity are checked before the text is escaped for safe Markdown display. Requests include the export credential and ordinary connection and request metadata. Recap Raven keeps limited operational and security logs, including API-key use and IP-related security events, as described in the [Recap Raven Privacy Policy](https://recapraven.com/privacy).

The plugin does **not** upload vault notes, attachments, filenames, or other vault content to Recap Raven, and contains no client-side analytics or tracking.

Opening a recap uses `https://recapraven.com`. The URL is reconstructed from the validated session ID rather than trusting an editable URL in note properties.

## Local data and API-key storage

Imported recaps and non-secret preferences are stored in the current vault. Non-secret settings and a private duplicate-detection index containing only imported session IDs and their local paths are written to `.obsidian/plugins/recap-raven/data.json`. The API-key value is stored through Obsidian SecretStorage; `data.json` retains only the selected secret's name.

Obsidian does not isolate SecretStorage entries from other installed community plugins. Another plugin running in the same Obsidian instance may be able to request a secret by name, so install only plugins you trust. SecretStorage is local to a vault/device and is not a substitute for revoking a key that may have been exposed.

Imported notes are ordinary vault files and may be copied by your Obsidian Sync, backup, sharing, or Publish configuration.

- Clearing the selection or disabling the plugin disconnects this plugin but does not delete the named secret or revoke the key.
- Delete the named entry through Obsidian SecretStorage to remove its local value.
- [Revoke the export key](https://recapraven.com/account/api-keys) to invalidate it at Recap Raven.

Removing or revoking a credential does not delete Markdown files already imported into your vault.

## Privacy and permissions

- No plugin telemetry, analytics, advertising, tracking libraries, or promotional note footers.
- No background network requests, startup synchronization, timers, or full-vault scans. Local Obsidian file events keep the private import index current when an indexed note is renamed, deleted, or has its session-ID property changed.
- No access to files outside the current vault.
- Transcript access requires explicit permission in the export key and plugin settings. No GM-note, campaign-memory, lore, entity, MCP, or write API access.
- No file overwrite, update, rename, move, or deletion behavior.
- No third-party service receives vault content.

The plugin is desktop-only while mobile behavior is tested. The implementation uses Obsidian's request and Vault APIs so mobile support can be evaluated later without changing the security model.

When upgrading from 1.2.0 or earlier, the plugin discovers prior imports only inside the selected campaign's managed `Sessions` folder. A prior import moved elsewhere while the plugin was disabled cannot be discovered without scanning unrelated vault files; importing that session again may therefore create another note. The plugin intentionally accepts this narrow migration limitation to avoid vault-wide enumeration.

## Installation for development

```bash
make check
```

The Makefile runs installation, ESLint and Obsidian Community CSS linting, tests, coverage, type-checking, and the production build
inside the pinned Node container; no host Node installation is required.

For manual testing, copy `main.js`, `manifest.json`, and `styles.css` into a folder named `recap-raven` under a dedicated test vault's plugins directory. Do not develop or test import behavior in your primary vault.

## Releases

Release tags exactly match the semantic version in `manifest.json` and do not use a `v` prefix. Each GitHub release contains:

- `main.js`
- `manifest.json`
- `styles.css`

Maintainers prepare a version with `make version VERSION=1.0.1`. This updates `package.json`, `package-lock.json`, `manifest.json`, and `versions.json`; the release workflow rejects mismatched versions, tags, or assets.

## Contributing

This is an owner-maintained repository. Please open an issue for bugs and improvement proposals; external code pull requests are closed without running contributed code. See [CONTRIBUTING.md](CONTRIBUTING.md) for the rationale and development standards.

## Support and security

Use the repository issue tracker for bugs and feature requests. Do not include API keys, authorization headers, SecretStorage contents, or private campaign material in an issue.

For a suspected credential exposure, revoke the key immediately from the [Recap Raven API-key page](https://recapraven.com/account/api-keys). Report vulnerabilities privately using the process in [SECURITY.md](SECURITY.md), never a public issue.

## Licence

[MIT](LICENSE)
