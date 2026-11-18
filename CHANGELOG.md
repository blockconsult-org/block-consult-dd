# Changelog

## 0.3.0

- Replace visible native dropdowns with keyboard-accessible custom selects, including theme selection. Keep validation, default and empty values, resets and form submission intact.
- Separate Settings into provider connections, Appearance, Research and Usage. Retain drafts, show saved and failed states, and distinguish the active provider from the connection being configured.
- Edit existing intake and structured records while preserving nested data. Add guards against losing unsaved work when navigating or closing the app.
- Bring research actions forward, keep scorecard saving within reach, and make evidence and findings easier to review. Display saved finding impact and mitigation.
- Confirm replacement of the latest report snapshot. Keep current-case exports separate from that snapshot.
- Add regression checks for control behavior, settings persistence and complete case workflows, plus updated fictional-case screenshots.

The app identity, data folders, credential storage, scoring rules and report contracts remain unchanged. Existing AI narrative freshness rules do not independently detect intake or record edits; review and regenerate narrative after those changes.

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
