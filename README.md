<a href="https://www.blockconsult.org">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/branding/blockconsult-logo.png">
    <img src="docs/branding/blockconsult-logo-light.png" alt="Block Consult" width="280">
  </picture>
</a>

# Block Consult DD

A desktop workbench from [Block Consult](https://www.blockconsult.org) for due diligence on crypto, token, real-world asset (RWA), stablecoin and private-offer opportunities. Collect evidence, review findings, score a case and export a branded report. Case records are stored locally. The interface is in English; AI research is optional and uses your own provider account.

[![Latest release](https://img.shields.io/github/v/release/blockconsult-org/block-consult-dd)](https://github.com/blockconsult-org/block-consult-dd/releases/latest) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) · [Platform builds](https://github.com/blockconsult-org/block-consult-dd/actions/workflows/desktop.yml)

**[Download for macOS or Windows](https://github.com/blockconsult-org/block-consult-dd/releases/latest)** · [Development guide](docs/development.md) · [Research and scoring](docs/architecture.md) · [Report an issue](https://github.com/blockconsult-org/block-consult-dd/issues)

![Block Consult DD dashboard in light mode, showing case totals, search and a case list](docs/screenshots/dashboard-light.png)

The case dashboard brings status, red flags and the latest review activity into one view.

## What you can do

- Organize cases by status, search the dashboard and find cases with red flags.
- Capture an offer, its entities, contracts, counterparties and questions. Optional AI extraction turns pasted material into a draft intake for you to review.
- Keep sources and evidence claims alongside findings, red flags and structured project records.
- Run rule-based checks, or use AI to research sources and propose findings with citations.
- Review category scores and blockers. Each score shows whether it came from an analyst, rules or AI; blockers can only lower the recommendation.
- Generate a saved report snapshot, export HTML, Markdown and an evidence manifest, or preview and export a PDF from the current case.

The interface uses Block Consult's light and dark palettes, with a system theme option, keyboard navigation and layouts for narrow windows.

## Get started

1. Open Block Consult DD and choose **Load example case** to explore the fictional Meridian RWA Token case, or create a new case.
2. Review the intake and add the sources you have. Missing evidence remains visible as missing.
3. Run the rule-based checks from the case overview. To use AI, choose and configure a provider in Settings first.
4. Review the findings and scorecard, including every active blocker.
5. Open the Report tab to generate a saved report or export the current case.

## Screenshots

Screenshots use the fictional Meridian RWA Token case. The overview keeps intake details and research controls together; the scorecard shows category scores, their sources and active blockers.

![The Meridian example case in dark mode, with its intake summary and workflow controls](docs/screenshots/case-overview-dark.png)

![The light-mode scorecard, showing category scores, provenance and recommendation blockers](docs/screenshots/scorecard-light.png)

## Download and install

The [latest release](https://github.com/blockconsult-org/block-consult-dd/releases/latest) contains the installers and release notes. The app bundles its server, SQLite database support and PDF renderer; you do not need Node.js or a separate database.

| Platform | Download | Installation |
| --- | --- | --- |
| macOS, Apple silicon | `mac-arm64.dmg` | Open the disk image and drag the app to Applications. |
| macOS, Intel | `mac-x64.dmg` | Open the disk image and drag the app to Applications. |
| Windows, Intel or AMD 64-bit | `win-x64.exe` | Run the installer. |

Choose the filename ending shown above. Apple silicon and Intel Macs have separate builds because the database engine is native to each processor. ZIP archives and Linux AppImage/DEB packages are also available on the release page.

Release notes state the signing and notarization status of each download. The macOS apps in v0.2.0 are Developer ID signed but not notarized, and the Windows installer is unsigned. Operating-system security controls may block installation; follow your organization's installation policy. Check `SHA256SUMS.txt` against the downloaded file using `shasum -a 256` (macOS) or `Get-FileHash -Algorithm SHA256` (PowerShell).

## Your data

Case records, sources and generated reports are stored locally. The rule-based workflow needs no provider account; optional AI and web research contact external services as described below.

Use **Help → Open data folder** in the desktop app. Default locations are:

| OS | Data folder |
| --- | --- |
| macOS | `~/Library/Application Support/Block Consult DD` |
| Windows | `%APPDATA%\Block Consult DD` |
| Linux | `~/.config/Block Consult DD` |

The folder holds the SQLite database, generated reports, fetched source text and application logs. Quit the app before copying the folder for a backup. The app also backs up the database before applying a schema upgrade. Encrypted API keys may require re-entry on another computer. Version 0.2.0 keeps the existing app identity and data location.

## Optional AI

The rule-based workflow works without an AI account. AI can extract intake fields, research public sources, propose findings and draft report prose. You review the results before using them.

| Connection | Requirement | Usage |
| --- | --- | --- |
| Claude API | Your Anthropic API key | Billed to your Anthropic account |
| OpenAI API | Your OpenAI API key | Billed to your OpenAI account |
| Claude Code | A locally installed, signed-in Claude Code CLI | Subject to your account and plan limits |
| Codex | A locally installed, signed-in Codex CLI | Subject to your account and plan limits |

AI requests send the relevant intake, evidence or report material to the selected provider. Web research also contacts external sources. Consider the confidentiality of a case before enabling these features. Settings shows usage and estimated API cost; estimates are not invoices.

Desktop API keys are encrypted through the operating system's credential storage. The app reports a saved key's presence and last four characters, never the full key. See [provider behavior and storage](docs/architecture.md#ai-providers) and the [security policy](SECURITY.md).

## Scores and report snapshots

Ten categories use a 1–10 scale, where a higher score means stronger evidence or lower risk. Nine categories contribute to the weighted result; transparency and disclosure is informational. An unscored category stays unknown. A high average cannot override a blocker.

Saved blockers persist when you reopen a case or run research. When upgrading an older database, the app conservatively retains recognized blockers from its saved labels. Review these retained choices in the scorecard and clear one only when the evidence supports doing so.

Each case has one latest saved report snapshot with an incrementing version number. Regenerating replaces that snapshot; it is not a history of every report version. Live HTML and PDF exports reflect the current case, which may differ from the saved snapshot. Export copies you need to retain.

The tool supports professional review; its scores and reports are not legal, tax, accounting or investment advice. AI output can be incomplete or wrong, and a matching source quotation does not establish that the source's claim is true. For a lighter planning exercise without case records or research, use the [Web3 Due Diligence Scorecard](https://github.com/blockconsult-org/web3-due-diligence).

## Run from source

Requires Node.js 24 or newer and npm.

```bash
git clone https://github.com/blockconsult-org/block-consult-dd.git
cd block-consult-dd
npm ci
cp .env.example .env
npm run dev:direct
```

Open `http://localhost:3000`. The server listens on `127.0.0.1` and applies database migrations at startup. `npm run dev` uses a separately installed Portless proxy; use the URL it reports. For PDF export from source, install the browser with `npx playwright install chromium`.

```bash
npm run typecheck
npm run lint
npm test
npm run desktop:build
```

The last command builds installers for the current operating system and processor into `release/`. See the [development guide](docs/development.md) for packaging, signing, checks and team hosting. The [architecture guide](docs/architecture.md) explains research, score provenance and reports.

## Project layout

| Path | Responsibility |
| --- | --- |
| `src/app/` and `src/components/` | Case pages, API routes and shared interface components |
| `src/domain/` | Schemas, scores, blockers and domain tests |
| `src/ai/` and `src/harness/` | Optional providers, research jobs and rule-based checks |
| `src/report/` | Saved report snapshots, HTML, Markdown and PDF output |
| `prisma/` | SQLite schema and additive database migrations |
| `electron/` and `scripts/` | Desktop host, packaging and smoke checks |
| `docs/` | Development guide, architecture and example screenshots |

## Release and maintenance

See the [release instructions](docs/development.md#releases), [security policy](SECURITY.md) and [contribution guide](CONTRIBUTING.md). The [desktop workflow](.github/workflows/desktop.yml) builds each platform and runs packaged smoke checks. Releases include signing details, checksums and verification limits. Download updates from this repository's Releases page and back up your case data before upgrading.

## Contributing and license

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Report vulnerabilities privately through the process in [SECURITY.md](SECURITY.md).

[MIT](LICENSE). Copyright © 2026 Block Consult GmbH. The license covers the code; it does not grant rights to use Block Consult's name or logo as an endorsement.
