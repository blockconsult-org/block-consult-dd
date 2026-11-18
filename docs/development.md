# Development and packaging

Use Node.js 24 or newer and npm. The lockfile pins dependency versions; `npm ci` also generates the Prisma client through the postinstall script.

## Local server

```bash
npm ci
cp .env.example .env
npm run dev:direct
```

This starts Next.js on `127.0.0.1:3000`. The server applies pending SQLite migrations when it starts. Load the fictional example from the dashboard to explore the case workflow.

`npm run dev` uses Portless, which must be installed separately. The script requests the `block-consult-dd` name, and a worktree may add a prefix. Open the URL reported by Portless rather than assuming a hostname or port. Use `dev:direct` for fixed-port tests and environments without the proxy.

Install Playwright's browser for PDF export from source:

```bash
npx playwright install chromium
```

The desktop app uses its bundled Chromium and does not need that browser download.

## Configuration and data

Copy [`.env.example`](../.env.example) for the supported settings. Keep the resulting `.env` private.

| Setting | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite URL; the default is `file:./dev.db`, relative to the Prisma directory |
| `STORAGE_DIR` | Generated reports and fetched source text |
| `BC_DATA_DIR` | Private app data, including the source installation's encryption key |
| `BC_SECRET_KEY` | Optional explicit encryption key, replacing the generated per-install key |
| `APP_ACCESS_TOKEN` | Shared access token for a team server |
| `BRAND_*` | Report branding overrides |
| Connector API keys | Optional web-search, market-data and explorer connections |

AI provider settings normally belong in the app's Settings page. Do not copy credentials from another installation into a fixture or public example.

Use a separate database, storage directory and data directory for tests. The seed command replaces an existing case with the example project's name, so do not use it against a client database. `db:reset` deletes the configured database's contents.

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The typecheck command generates Next.js route types before running TypeScript, including on a clean checkout. Unit tests cover domain rules, schemas, provenance, migration behavior, quote matching, source-fetch restrictions, provider key checks and report helpers. A build checks the production application and server bundle.

After building, run the production browser check against a disposable database:

```bash
npx playwright install chromium
npm run test:browser
# Optional: regenerate the four README screenshots from the fictional case
npm run test:browser -- --screenshots
```

This checks both themes, accessibility, narrow layouts, scorecard draft persistence, rule-based research and PDF export. It does not call an AI provider.

For database work, create an additive migration, regenerate the Prisma client and verify existing data survives:

```bash
npm run db:migration -- --name describe_change
npm run db:generate
npm run db:check-migrations
```

The migration smoke command uses temporary databases and, if present, a copy of the local development database. Use only synthetic data when sharing results. Its second migration pass checks that rerunning startup is safe.

For interface work, inspect light and dark themes at narrow and wide widths. Check keyboard navigation, visible focus, associated labels, drafts across tab changes and the behavior after saving or refreshing. Automated accessibility checks supplement these interactions.

## Desktop builds

```bash
npm run desktop:build
npm run desktop:smoke -- --packaged
```

Installers appear in `release/`. Build each operating system and processor on a matching machine: Prisma and image-processing dependencies include native files. The supported build targets are macOS arm64, macOS x64, Windows x64 and Linux x64.

| Command | Output or purpose |
| --- | --- |
| `npm run desktop:prepare` | Standalone Next.js server and bundled Electron entry points |
| `npm run desktop:start` | Start the prepared app with Electron |
| `npm run desktop:pack` | Unpacked application directory |
| `npm run desktop:build` | Installers for the host operating system and processor |
| `npm run desktop:smoke` | Smoke-test the prepared app with temporary user data |
| `npm run desktop:smoke -- --packaged` | Smoke-test the packaged application |

The build script copies the traced server, static files, Prisma engine and migrations. It removes environment files, databases and server caches from the packaged server. The smoke test checks startup, local access controls, the database, credential encryption, PDF rendering and window creation. On macOS, smoke tests use a mock keychain by default to avoid creating keychain items or waiting on prompts; this checks the encryption bridge, not the real Keychain. An interactive maintainer can opt into the real backend with `BC_SMOKE_REAL_KEYCHAIN=1`. Windows uses its system backend. Linux keychain verification can be skipped when the test environment has no OS keyring; this is reported separately from a passing keychain check.

Keep `appId: com.blockconsult.dd` and `productName: Block Consult DD` stable. Existing installations depend on the app identity and user-data location for cases and encrypted credentials.

### Signing

For macOS, configure `CSC_LINK` and `CSC_KEY_PASSWORD`, or use `CSC_NAME` to select an existing certificate in the local Keychain. Notarization requires a separately configured Apple account and the supported notarization environment variables. The build accepts `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`.

For Windows, configure `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` for the signing certificate. Keep certificates, private keys and passwords outside the repository and use the release environment's secret store.

Without a macOS certificate, the script signs ad hoc and skips notarization. An ad hoc signature does not establish a trusted publisher. A Developer ID signature and Apple notarization are separate checks. Report each artifact's actual status in its release notes; do not describe an unnotarized build as notarized.

### Releases

The [desktop workflow](../.github/workflows/desktop.yml) builds platform-specific installers and runs packaged smoke checks. Tag names use the package version, such as `v0.2.0`. Check all relevant platform results before publishing a release, then verify the uploaded files and their hashes.

Public release contents must exclude case databases, provider settings, private reports, credentials and local handoff notes. Screenshots must use synthetic data. A built installer and a passing source test suite exercise different boundaries; preserve both the source checks and packaged smoke check when changing the release path.

## Team hosting

```bash
npm run build
npm start
```

Production startup also listens on `127.0.0.1` by default. A reverse proxy on the same machine can provide HTTPS while leaving this local binding in place. If a deployment requires a different interface, start Next.js explicitly with `npx next start -H 0.0.0.0` after configuring access controls.

Set a strong `APP_ACCESS_TOKEN` before making the server reachable by others. Each browser enters it at `/unlock`; the cookie is marked Secure over HTTPS. Run a single application instance because research jobs are held in that server process.

All users of one server share provider configuration, saved keys and case data. The access token is not a separate account system. Give users separate desktop installations when they need their own provider credentials and case storage.
