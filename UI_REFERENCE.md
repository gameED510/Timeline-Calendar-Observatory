# Calendar Motion Reference

Review date: 2026-09-08.

Revision: removed the separate floating deck and its title bar. Groups of two
or more use the original card elements inside their calendar day cell on every
screen size. Hover/tap changes their transforms in place; closing returns those
same DOM nodes to the stack without changing the calendar grid dimensions.
Cards now use translucent backdrop-filter material, staggered rotation, focus
translation and scale, pointer-captured dragging, neighbor wobble, destination
date emphasis, and squash/stretch on drop. The interaction layer does not
store or merge project records itself.

Source: user-provided local MP4, 960 x 720, 30 fps, 22.44 seconds,
673 decoded video frames. Reviewed all frames as 23 sequential contact sheets
(30 frames per sheet, last sheet partial), alongside larger key frames.
The video is reference material only and is not included in the deployed site.

| Time | Observed behavior | Application adaptation |
| --- | --- | --- |
| 0-1 s | Week overview zooms toward a three-card pile | Same-day groups of two or more form a compact pile on desktop and mobile |
| 1-4 s | Hover separates and tilts cards with soft shadows | Click or Enter opens the actual cards in an overlapping fan; selecting a card brings it forward and straightens it |
| 4-6 s | Detached card displays destination time, then settles | Drop target displays destination date; successful move settles over 340 ms |
| 6-8 s | Return to a quiet white calendar overview | Hairline calendar grid, neutral segmented controls, restrained surfaces |
| 8-12 s | Pink and purple events join an orange stack | Multiple project colors remain distinct within a same-day pile |
| 12-16 s | Cards move between dates and shrink into stacks | Existing date-change semantics are retained; no artificial hourly fields are added |
| 16-20 s | More cards gather into one group | A pointer-following glass card compresses into the destination group and rebounds; neighboring cards wobble |
| 20-22.44 s | Large radial fan opens and collapses | Floating tilted cards overlap above the calendar; focus reveals the full name and edit/completion actions |

## Intentional Differences

- The product manages date-only production stages, not hourly appointments.
- Mobile month cells remain compact and the selected-day list keeps full client names.
- No camera zoom, content blur during normal reading, or promotional scattering.
- Existing project colors are preserved; no user data is recolored or migrated.
- Dark theme and reduced-motion preferences remain supported.
- Expansion spacing adapts to available viewport height; there is no separate window, title bar, or pagination panel.
- The implementation uses day-cell-local elements, Pointer Events, CSS transforms, and Web Animations;
  there is no added animation framework.

## Account Data Boundary

- Initial and signed-out states contain no project records or sample data.
- Login loads only the authenticated account's cloud rows. Local data does not
  seed an empty cloud account. Legacy migration reads only that account's legacy cloud row.
- Cache and recovery keys are scoped by account ID; legacy unscoped keys are left
  untouched as a safety backup and are not automatically adopted by any account.
- Account changes abort outstanding data requests and invalidate their responses.
- Conflicts use the cloud row and retain local edits in account-scoped recovery
  history. No automatic conflict project is created or uploaded.
- Previously uploaded conflict copies are not deleted automatically: they are
  existing cloud data and may contain real work.

## Verification

- 26 automated tests cover sync, account transitions, request limits, motion build integration, and offline shell behavior.
- Browser checks: 1440 x 900, 834 x 1194, 390 x 844, light and dark.
- Verified empty signed-out state, zero horizontal overflow, floating expansion,
  focus, editing, mouse drag, touch drag into an existing group, same-node identity,
  reduced-motion support, and no project content remaining visible after logout
  using synthetic local data. A six-project fixture retained six projects after
  one node moved into a date already containing six nodes (seven nodes total).
- Production data was not edited for testing.
