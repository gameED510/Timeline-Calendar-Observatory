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
- Pricing, history, actual settlement and nested template dialogs restore focus to their valid invoking control when dismissed. Account changes suppress stale focus restoration. Browser regression covers the four primary dialog paths; this is not yet a full screen-reader audit.
- Settlement CSV exports monthly totals and ad rows, preserves missing values and neutralizes formula-like text cells.
- Project search includes short names, accounts, platforms and combined terms; empty searches can reset filters.
- Calendar mode, project filters and sorting persist per account. Temporary search text is not persisted. Invalid stored choices are ignored.
- The last active page now persists per account alongside calendar/filter preferences. Switching between two accounts restores the correct view and both navigation states; invalid saved views fall back to calendar. Unit and 390px browser checks pass.
- Overview next actions are deduplicated by project and ordered by earliest pending stage; empty projects have honest empty states. Risk view includes single overdue nodes and names overdue, multiple shoots or node density without claiming every dense date is high risk. Desktop overview and 320px risk flows passed.
- The focus summary separates overdue and today counts instead of merging them into one ambiguous label. Risk rows show exact overdue days. Unit coverage and a 390px visual check verify wording and page width.
- Template copying has explicit account/platform/gift, appearance and date options. Dates default to cleared; completion is never copied. The compact mobile option dialog and full workflow regression passed.
- Local recovery history renders before remote requests finish. Cloud failures offer independent retry; stale account responses cannot populate the current history.
- A focused card can close on a second click. Date picker rescheduling supports undo.
- Timeline and milestone chips use separate native buttons for completion and selection, with full accessible names instead of nested button roles. Enter/Space browser flows and the broader workflow regression pass; this is not a complete screen-reader audit.
- Keyboard viewport adaptation is simulated in Chromium, not verified on physical iOS.
- More than six same-day nodes open a scrollable action list; 12 nodes at 320px were tested, including rescheduling the last node.
- Dense-day and reschedule dialogs restore focus to the originating card, or its newly rendered replacement after a move. A 390px browser flow covers successful move and cancellation; reduced-motion emulation reports no running animation longer than 1ms after expansion.
- Explicitly saved drafts persist locally per account for 30 days; recovery compares project fingerprints and never saves without user confirmation. Unit tests cover memory reset and account isolation.
- Recovery history offers read-only project/field comparison. Both restoration paths and cloud-conflict reconciliation stop before overwriting when local protection cannot be stored.
- Cloud restoration rejects pending sync work, locks editing/background sync for the request, and unlocks after failure or completion. Account changes reset the lock without allowing stale callbacks to change a new account.
- Successful cloud restoration unlocks without waiting for the independent history refresh. Late history failures cannot report against a different account or mislabel restoration as failed; deferred-promise tests cover this boundary.
- New service-worker activation prompts for user-controlled refresh; open dialogs, pending project uploads and offline status block the refresh action. Physical update timing still needs live verification.
- Browser and API boundaries were audited: the Supabase proxy restricts methods, paths, origins, body size and request rate; database policies scope records to the signed-in user; production targets now share strict CSP, HSTS, same-origin resource isolation and legacy cross-domain policy blocking. Dependency audit and 76 automated checks pass. Live two-account RLS and password-reset delivery remain separate release checks.
- All five tab groups now use a single roving keyboard stop and support Left/Right, Home and End navigation. A synthetic-account browser flow verifies view, calendar mode, project filter, performance period and sign-in mode switching without touching production data; 77 automated checks pass.
- Dynamic pricing, actual-settlement, template and recovery dialogs now expose their visible headings as accessible names and use the same icon-only close control as the rest of the product. A 320px browser flow verifies all four dialogs remain within the viewport without horizontal overflow.
- Mobile completion controls now reserve 44px touch boxes while keeping the visible circles compact; calendar, project, timeline, conflict and performance controls were scanned for names, duplicate IDs, undersized targets and overflow. A direct hit-test verifies the stacked calendar card's expanded invisible target, and the 40-state visual matrix remains overflow-free.
- The performance view now opens the active 15th-to-15th cycle instead of the calendar month: dates through the 15th stay in that month and dates from the 16th move to the next performance month. Completing publication names the destination month, and a browser flow verifies a September 17 publication appears as one item in October rather than disappearing from view.
- Password recovery now handles the recovery authentication event before reading the initial session, opens the account panel, exposes the new-password form and returns to normal sync status after success. Login, signup and recovery forms also provide distinct password-manager semantics instead of allowing current and new credentials to be cross-filled.
- Login, recovery, project search and smart-paste controls now have persistent accessible names instead of depending on disappearing placeholder text. Authentication inputs are required, linked to the live status message and tuned for mobile email/password entry.

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
