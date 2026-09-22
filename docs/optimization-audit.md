# Optimization audit

Scope: the 100-item review in the conversation, followed by the request to fix and publish. This is not a completion certificate. Existing features do not prove every scenario in an item is covered.

## Verified incremental changes

- Import preview classifies additions, changes, removals and unchanged rows; account/data changes prevent stale application. Recovery storage failure and impossible dates are tested.
- Deletion undo is guarded against account transitions and existing IDs.
- Sync status distinguishes offline, pending, uploading and acknowledged project data. Pending uploads trigger unload protection.
- Empty accounts no longer report completion. Dates refresh across midnight without navigating away.
- Project editor prioritizes account/platform/dates and shows live formula hints; visual settings are folded.
- Settlement views show source month, missing detail balance, calibration sample months and readable errors.
- Chart windows use continuous months; missing and zero totals remain distinct.
- Settlement CSV exports monthly totals and ad rows, preserves missing values and neutralizes formula-like text cells.
- Project search includes short names, accounts, platforms and combined terms; empty searches can reset filters.
- A focused card can close on a second click. Date picker rescheduling supports undo.
- Keyboard viewport adaptation is simulated in Chromium, not verified on physical iOS.

## Still open: do not claim all 100 complete

- Physical iPhone Safari drag/keyboard/orientation testing (#2, #83-87).
- Live two-account RLS checks and full password reset delivery/login loop (#3, #12).
- Conflict comparison UI, persistent recycle bin, update protection and expanded financial boundary cases (#5, #9-10, #13-15).
- Dense day layouts, motion stress/performance traces, edge scroll and cross-month drag, dependent stage rescheduling (#17-27, #29).
- Import parsing preview, persistent drafts, formula-change impact, configurable template copying and bulk project handling (#41-49).
- Actual-record audit trail, matching confirmation, anomaly annotations and source-of-error decomposition (#52-60, #65-69).
- Overview deduplication, risk severity/action refinement, timeline labels and persistent per-account view preferences (#71-79).
- Full accessibility/large-text/contrast audit and consolidation of overlapping CSS/motion parameters (#85-100).

## Release gates

Run `npm run check`, browser workflows, inspect screenshots, bump changed shell resource versions, build with the existing public Supabase config, deploy EdgeOne production, then independently check xxltl.xyz and auth health. Preserve real user data; use synthetic records for browser regression. Document unverified gates rather than calling them passed.
