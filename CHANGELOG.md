# Changelog

## 0.2.0

### Interface

- Block Consult light, dark and system themes, shared navigation and consistent form controls.
- Search, status and red-flag filters, sorting and narrow-window case cards on the dashboard.
- Reworked intake, case overview, evidence, findings, scorecard, reports and provider settings.
- Keyboard tab navigation and retained drafts when switching case sections.
- Clearer distinctions between the latest saved report snapshot and exports from the current case.

### Data and reliability

- Persist saved recommendation blockers across case reloads and research runs. Existing recognized blocker labels are retained conservatively during migration and can be reviewed in the scorecard.
- Combine saved and research blockers in scorecard previews and persisted recommendations.
- Keep live PDF exports separate from the saved report's file metadata, including exports created before this upgrade.
- Update compatible framework, validation, test and desktop dependencies.
- Keep the existing desktop app identity and user-data locations.

### Public repository

- MIT license, installation and development instructions, screenshots, contribution guidance and a private vulnerability reporting policy.

See the [release](https://github.com/blockconsult-org/block-consult-dd/releases/tag/v0.2.0) for downloadable builds and their signing status.
