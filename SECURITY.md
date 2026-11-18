# Security policy

Security fixes target the latest release. Check the [release notes](https://github.com/blockconsult-org/block-consult-dd/releases) for changes and known installation limitations.

## Report a vulnerability

Use GitHub's [private vulnerability reporting](https://github.com/blockconsult-org/block-consult-dd/security/advisories/new) for this repository. Include the affected version and platform, the impact, and a minimal reproduction using synthetic data. Do not put exploit details, credentials, private case material or personal information in a public issue.

## Data and credentials

The desktop app stores cases and artifacts in its local data folder. Its server listens on `127.0.0.1` on a random port and checks a per-launch session cookie and the expected Host header. This protects the local server boundary; it does not encrypt the case database or protect a compromised operating-system account.

Saved desktop API keys use Electron's operating-system credential encryption. On Linux, key storage requires a supported keyring; the app refuses the unprotected `basic_text` fallback. Source installations use AES-256-GCM with a per-install key in `BC_DATA_DIR/secret.key`, or an explicitly configured `BC_SECRET_KEY`. Protect that key and the data folder together. The API returns only key presence and a four-character hint.

AI requests send case material to the selected provider. Source retrieval contacts the referenced websites from the computer running the app. The fetcher rejects private, loopback and link-local destinations, including redirects. External content and AI findings still require analyst review.

The packaged app disables the Electron run-as-Node, Node-options and inspect fuses. PDF rendering disables scripts and network access. These controls address specific execution and rendering paths; they are not a claim that all imported content is trustworthy.

## Hosting

Source commands listen on loopback by default. A team server needs `APP_ACCESS_TOKEN`, HTTPS and a single running application instance. Users of one server share its provider configuration and saved keys. This is shared-token access, not separate user accounts or tenant isolation. See [team hosting](docs/development.md#team-hosting).

## Dependencies

On 18 November 2026, the runtime dependency audit for 0.2.0 reported no known vulnerabilities with `npm audit --omit=dev`. The full development audit still reports affected build, lint and test dependency paths through `picomatch` ≤4.0.7. [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) had no published patched version on that date. Review the upstream advisory when updating the lockfile. This is a dated audit result, not a guarantee that dependencies have no vulnerabilities.

## Release verification

Use downloads from this repository's Releases page and check the signing and notarization information for that version. A published checksum detects a changed download but is not a substitute for an operating-system signature. Do not assume that an installer is notarized or signed merely because it is hosted on GitHub.
