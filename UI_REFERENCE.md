# Calendar Motion Reference

Review date: 2026-09-08.

Source: user-provided local MP4, 960 x 720, 30 fps, 22.44 seconds,
673 decoded video frames. Reviewed all frames as 23 sequential contact sheets
(30 frames per sheet, last sheet partial), alongside larger key frames.
The video is reference material only and is not included in the deployed site.

| Time | Observed behavior | Application adaptation |
| --- | --- | --- |
| 0-1 s | Week overview zooms toward a three-card pile | Same-day groups of three or more form a compact pile on desktop |
| 1-4 s | Hover separates and tilts cards with soft shadows | Pointer/keyboard focus fans the cover cards; click or Enter expands actionable rows |
| 4-6 s | Detached card displays destination time, then settles | Drop target displays destination date; successful move settles over 340 ms |
| 6-8 s | Return to a quiet white calendar overview | Hairline calendar grid, neutral segmented controls, restrained surfaces |
| 8-12 s | Pink and purple events join an orange stack | Multiple project colors remain distinct within a same-day pile |
| 12-16 s | Cards move between dates and shrink into stacks | Existing date-change semantics are retained; no artificial hourly fields are added |
| 16-20 s | More cards gather into one group | Dense groups have bounded scrollable rows, with expansion retained after completion toggles |
| 20-22.44 s | Large radial fan opens and collapses | Adapted to readable vertical expansion, not a literal radial fan covering neighboring dates |

## Intentional Differences

- The product manages date-only production stages, not hourly appointments.
- Mobile month cells remain compact and the selected-day list keeps full client names.
- No camera zoom, content blur during normal reading, or promotional scattering.
- Existing project colors are preserved; no user data is recolored or migrated.
- Dark theme and reduced-motion preferences remain supported.
- The implementation uses native details/summary, CSS transforms, and Web Animations;
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

- 25 automated tests cover sync, account transitions, request limits, and offline shell behavior.
- Browser checks: 1440 x 900, 834 x 1194, 390 x 844, light and dark.
- Verified empty signed-out state, zero horizontal overflow, pile expansion,
  and no project content remaining visible after logout using synthetic local data.
- Production data was not edited for testing.
