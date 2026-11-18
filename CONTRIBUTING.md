# Contributing

Bug reports, documentation fixes and pull requests are welcome. Start with the [development guide](docs/development.md) to run the app and its checks.

## Issues

For a bug, include the app version, operating system, processor type, steps to reproduce, expected behavior and actual behavior. Use the fictional example case or a small synthetic case where possible. Remove names, private offers, API keys and source documents from logs or screenshots before sharing them.

Security reports belong in the private process in [SECURITY.md](SECURITY.md), rather than a public issue.

## Pull requests

Keep a change focused and explain the user-visible problem it solves. Include the checks you ran and any limitation that remains. For interface changes, include screenshots of light and dark themes and a narrow window. Use synthetic data in every committed fixture and screenshot.

Follow the existing TypeScript, React and Tailwind conventions. Use the semantic color tokens in `src/app/globals.css` and `tailwind.config.ts`, label form controls, preserve visible keyboard focus and check both themes. Do not introduce `any`, blanket type suppressions or disabled lint rules to make a change pass.

Run the configured type and lint checks for code changes. Add a focused regression test when it catches a meaningful failure, such as lost case data, an incorrect recommendation or a changed security boundary. Styling and copy changes usually need visual or document review rather than new unit tests.

Database changes need an additive migration and checks against both a fresh database and a synthetic database with existing data. Preserve the app identity and data paths so installed users keep their cases. Scoring changes must explain their effect on category weights, unknown inputs and recommendation ceilings; a high score must never bypass a blocker.

Never commit `.env` files, real case databases, API keys, signing certificates, private reports or personal provider configuration. Contributions are provided under this repository's [MIT license](LICENSE).
