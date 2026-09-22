# TL experience refresh

This revision preserves the existing visual identity and consolidates the three proposed improvement rounds. It is a review build; publishing is a separate step after the preview is reviewed.

## Calendar interaction

- Keep the open group and focused card across ordinary renders.
- Reflow expanded cards on viewport changes instead of closing them.
- Interrupt previous layout transitions rather than queueing them.
- Collapse neighboring cards when dragging and remove target-group shaking.
- Show a readable target-date badge without blurring the project title.
- Land immediately in local state, with one short spring transition and a late visual handoff.
- Return invalid or same-date drops to the original card.
- Defer incoming renders until dragging finishes.
- Provide guarded undo: a later edit or different account cannot be overwritten by an old undo action.
- Support edge scrolling, keyboard card navigation, and touch scroll versus hold-and-drag.

## Workflow

- Collapsible desktop overview and clickable project legend filters.
- Remember scroll positions between primary views.
- Accessible date selection and explicit pending-node count labels.
- Empty calendar actions to add a project or clear a filter.
- Optional project short names survive normalization, backup and cloud payloads.
- Collapse schedule paste and unused stages when editing.
- Group copy, template duplication and delete under More.
- Template duplication preserves account/platform/color but clears dates and completion.
- Protect unsaved edits, with explicitly saved local drafts isolated by account and project for 30 days.
- Retain actual-settlement form contents when dismissal is cancelled.

## Performance and visual hierarchy

- Separate publication accounting period from the natural publication month used for commission.
- Fold detailed accounting explanation instead of occupying the main reading path.
- Show numeric examples in account-pricing configuration.
- Expose the saved formula's contributing publication rows.
- Show both absolute and relative forecast differences.
- Show sample accumulation without presenting insufficient history as a reliable prediction.
- Add percentage-error charts and an accessible underlying data table.
- Keep action sizes, numeric widths, menu backgrounds and editor footer layout stable.
- Remove repeated full-view entrance animation; preserve action-driven card motion.

## Deliberate choices

- Keep all five primary destinations; no evidence justifies hiding timeline or risk.
- Preserve current authentication isolation and cloud reconciliation. Do not display another account's cached data or weaken first-login protections for speed.
- Preserve the existing forecasting formula and immutable historical snapshots. No automatic outlier exclusion or new statistical model is introduced in a UI refresh.
- Do not add decorative photography, subscription tiers, a new landing page, or compulsory onboarding to this operational calendar.
- Saved drafts survive refresh on the same device. Restoration checks for changed project data and fills the form without automatically saving.

## Validation

Browser checks cover refresh/resize persistence, valid and invalid drops, undo, edge bounds, drafts, duplication, account isolation, project filters, sidebar controls, percentage charts, and actual-entry dismissal. Run `npm run check` for syntax and data-integrity regression tests. `npm run dev` opens a local preview backed by the existing cloud API; edits after signing in affect the same account data as production.
