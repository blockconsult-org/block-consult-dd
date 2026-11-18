# Working in the desktop app

## Cases and navigation

Cases and Settings stay available in the header at every window size. Desktop windows can be resized down to 640 × 480. The dashboard keeps its search, status, sorting and red-flag filter during the browser session, so returning from a case restores the list you were using.

The case overview shows the next review steps, research controls and the intake. Use **Edit intake** to update an existing case. Saving an intake edit keeps document requests, counterparties and nested details that the form does not expose. In **Records**, use the edit action beside a record to change its fields. Token allocations and unlock schedules remain intact when editing the token's other fields.

Visited case tabs and Settings sections keep their drafts while you switch between them. Forms show unsaved changes and warn before leaving the page or closing the window. Drafts are held in memory; saving writes them to the local database. Key drafts are never written to browser storage.

## Settings

- **AI providers** shows the active provider separately from the provider being configured. **Configure provider** switches the editor. Save changes, then choose **Use this provider** to change which provider handles new requests. Saving the first API key also activates its provider, as before.
- **Appearance** applies Light, Dark or System immediately. It stays synchronized with the theme control in the header.
- **Research** has its own Save and Discard actions. These defaults affect future AI research runs. CLI tool budgets remain instructions rather than guaranteed spending caps.
- **Usage** shows the app's recorded calls and estimated API costs. It does not contain prompts or answers.

Connection checks and test prompts use the saved configuration. The previous test result is hidden while that configuration has unsaved changes and becomes invalid when the saved configuration changes. A test prompt makes a provider request and can incur usage. Saved keys show only their presence and last four characters; replacing or removing a key uses the existing encrypted storage.

**Turn off AI** leaves case creation, evidence review, rule-based checks and exports available.

## Keyboard and menus

Tab moves between controls. Enter or Space opens a select; arrow keys move through its options, Home and End jump to the first and last enabled option, and typing searches option labels. Enter selects, Escape closes and returns focus to the field. Clicking outside dismisses the menu. Menus open in a portal, fit within the available viewport and scroll when needed.

The select chevron has a shared inset and dedicated space, including in compact controls. Labels, help text, invalid states, disabled controls and form values remain associated with the visible field.

## Reports

The latest saved report is one snapshot with an incrementing version. Generating it replaces the previous snapshot. Live HTML and PDF exports use the current case; they can differ from the saved snapshot. Download copies you need to retain.

AI narrative freshness keeps its existing rules. Intake and structured-record edits do not independently mark an existing narrative stale. Review the prose and regenerate it after those changes when necessary.

## Shared interface components

| Component | Responsibility |
| --- | --- |
| `components/ui/field.tsx` | Associated labels, hints and errors for inputs, text areas and selects |
| `components/ui/select.tsx` | Radix menu and native form bridge for values, validation, resets and FormData |
| `components/ui/draft-form.tsx` | Dirty-state tracking for forms that use FormData |
| `components/ui/use-unsaved-changes.ts` | Shared protection for unsaved edits and navigation |
| `components/ui/card.tsx`, `button.tsx` | Consistent containers, headings, actions and focus states |
| `components/shell/theme-select.tsx` | Light, Dark and System selection in the header and Settings |
| `components/shell/app-shell.tsx`, `app-ready.tsx` | Shared document layout and readiness before portal controls become interactive |
| `components/case/intake-fields.tsx` | Intake fields shared by creation and editing |

Use semantic color tokens from `globals.css` and the spacing, typography and motion tokens in `tailwind.config.ts`. Report HTML and PDF retain their separate document design system.

The shell enables selects after its initial hydration commits. Keep this boundary when changing the header or adding portal controls; server-rendered fields should not accept clicks before their handlers are ready. The native form bridge retains its own disabled state and submission behavior.
