# Optimization audit

Scope: the 100-item review in the conversation, followed by the request to fix and publish. This is not a completion certificate. Existing features do not prove every scenario in an item is covered.

## Verified incremental changes

- Import preview classifies additions, changes, removals and unchanged rows; account/data changes prevent stale application. Recovery storage failure and impossible dates are tested.
- Deletion undo is guarded against account transitions and existing IDs.
- Deleted projects are retained in an account-scoped local recycle bin for 30 days (up to 100 entries). Individual restoration never overwrites an existing ID; storage failure blocks deletion. Unit tests and a mobile browser flow cover these guarantees.
- Sync status distinguishes offline, pending, uploading and acknowledged project data. Pending uploads trigger unload protection.
- Empty accounts no longer report completion. Dates refresh across midnight without navigating away.
- Project editor prioritizes account/platform/dates and shows live formula hints; visual settings are folded.
- Settlement views show source month, missing detail balance, calibration sample months and readable errors.
- Chart windows use continuous months; missing and zero totals remain distinct.
- Actual amount parsing rejects blank and invalid values while preserving zero. Calibration/evaluation exclude invalid baseline snapshots. Browser tests cover blank rejection, zero submission, duplicate-submit protection and retry after failure.
- Historical ad editing preserves removed project associations and snapshot commission rates. Dirty month changes require confirmation; cancellation preserves all inputs. Browser checks confirm submitted associations/rates and immutable snapshots.
- Settlement differences separate matched-project variance, unallocated actual totals and estimates lacking complete details. Duplicate ad rows compare against a project estimate once, including both platforms. Unit tests cover incomplete rates and negative residuals; a 375px browser check verifies aggregation and no page overflow.
- Milestone completion preserves keyboard focus within the current view. Removed risk items advance to the next control; clearing the last risk returns focus to the risk tab. Synthetic browser keyboard checks pass.
- Desktop navigation also synchronizes mobile navigation state before resizing. All five views retain matching selected navigation across 20 viewport transitions (320/375/812/1280px); the 320px performance screenshot was inspected. Physical orientation testing remains open.
- Settlement CSV exports monthly totals and ad rows, preserves missing values and neutralizes formula-like text cells.
- Project search includes short names, accounts, platforms and combined terms; empty searches can reset filters.
- Calendar mode, project filters and sorting persist per account. Temporary search text is not persisted. Invalid stored choices are ignored.
- Overview next actions are deduplicated by project and ordered by earliest pending stage; empty projects have honest empty states. Risk view includes single overdue nodes and names overdue, multiple shoots or node density without claiming every dense date is high risk. Desktop overview and 320px risk flows passed.
- Template copying has explicit account/platform/gift, appearance and date options. Dates default to cleared; completion is never copied. The compact mobile option dialog and full workflow regression passed.
- Local recovery history renders before remote requests finish. Cloud failures offer independent retry; stale account responses cannot populate the current history.
- A focused card can close on a second click. Date picker rescheduling supports undo.
- Timeline and milestone chips use separate native buttons for completion and selection, with full accessible names instead of nested button roles. Enter/Space browser flows and the broader workflow regression pass; this is not a complete screen-reader audit.
- Keyboard viewport adaptation is simulated in Chromium, not verified on physical iOS.
- More than six same-day nodes open a scrollable action list; 12 nodes at 320px were tested, including rescheduling the last node.
- Explicitly saved drafts persist locally per account for 30 days; recovery compares project fingerprints and never saves without user confirmation. Unit tests cover memory reset and account isolation.
- Recovery history offers read-only project/field comparison. Both restoration paths and cloud-conflict reconciliation stop before overwriting when local protection cannot be stored.
- Cloud restoration rejects pending sync work, locks editing/background sync for the request, and unlocks after failure or completion. Account changes reset the lock without allowing stale callbacks to change a new account.
- New service-worker activation prompts for user-controlled refresh; open dialogs, pending project uploads and offline status block the refresh action. Physical update timing still needs live verification.

## Still open: do not claim all 100 complete

Smart paste now previews before applying and preserves unrecognized stages. Pricing changes require an impact preview and confirmation for the selected settlement month; historical snapshots remain unchanged. Browser checks cover preview invalidation after further edits.

- Physical iPhone Safari drag/keyboard/orientation testing (#2, #83-87).
- Live two-account RLS checks and full password reset delivery/login loop (#3, #12).
- Broader conflict-comparison scenarios, live update timing and expanded financial boundary cases (#5, #9-10, #13-15). Local recycle-bin support is implemented; cross-device recycle history is not provided.
- Motion stress/performance traces, edge scroll and cross-month drag, dependent stage rescheduling (#17-27, #29).
- Bulk project handling (#41-49); broader pricing-impact scenarios still need coverage.
- Actual-record audit trail, matching confirmation and anomaly annotations (#52-60, #65-69). Difference decomposition is implemented; it does not claim causal attribution.
- Overview deduplication, risk severity/action refinement, timeline labels and persistent per-account view preferences (#71-79).
- Full accessibility/large-text/contrast audit and consolidation of overlapping CSS/motion parameters (#85-100).

## Release gates

Run `npm run check`, browser workflows, inspect screenshots, bump changed shell resource versions, build with the existing public Supabase config, deploy EdgeOne production, then independently check xxltl.xyz and auth health. Preserve real user data; use synthetic records for browser regression. Document unverified gates rather than calling them passed.
