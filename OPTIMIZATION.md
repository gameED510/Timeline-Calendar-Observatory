# UI and Performance Review

2026-09-08 follow-up: account isolation and full video-frame review are documented
in [UI_REFERENCE.md](UI_REFERENCE.md). This supersedes the earlier conflict-copy
behavior and six-frame reference review below. Current icon bundle: 52 icons,
14,121 bytes; no new animation dependency.

Date: 2026-09-07. Scope: preserve scheduling, optional stages, completion rules,
TL copying, themes, cloud conflict copies and recovery history.

## Visual Direction

Primary reference: [user-supplied calendar interaction video](https://xhslink.cn/o/1ThdlFx0jox).
Inspected six frames across the 22-second video. Adapted its pale calendar canvas,
colored events, edge highlights and small hover/drag responses. Deliberately did
not reproduce the promotional spinning/scattering sequence in the working calendar.

- Desktop calendar events prioritize client names, with stages below and no duplicate date.
- Mobile month cells stay compact; the selected day's list shows readable names.
- Reduced decorative blur/shadows; no extra animation dependency.
- Theme toggle and system theme remain supported. Reduced-motion preference is respected.

## Implementation

- Bundle only the 51 referenced Lucide icons; replace new icon placeholders once per frame.
- Render the selected view instead of rebuilding all four views after each change.
- Skip a full redraw when cloud project content has not changed; serialize concurrent reads.
- Pause offline writes and retry failures with exponential backoff, capped at 60 seconds.
- Persist each acknowledged cloud version and pending snapshot state for recovery after partial failure.
- Preserve edits/deletions made while an earlier upload is still in flight.
- Share proxy validation, bounded request buffering and streamed responses across deployment adapters.
- Check actual body size, not just Content-Length; cap per-instance rate-limit memory.
- Cache only application shell resources; never cache API data or replace the shell with server errors.
- Build compressed JS/CSS without requiring PowerShell or fetching configuration from Vercel.
- Escape project labels at HTML insertion points; remove an inline script event blocked by CSP.

## Release Asset Sizes

Raw file bytes, before HTTP gzip/Brotli. These are transfer-size reductions, not
claims about end-to-end network latency.

| Asset | Previous | Release | Reduction |
| --- | ---: | ---: | ---: |
| Lucide | 423,290 | 13,927 | 96.7% |
| app.js | 121,597 | 92,505 | 23.9% |
| styles.css | 83,582 | 70,870 | 15.2% |

## Verification

- `npm run check`: 19 tests covering project acknowledgements, in-flight changes,
  snapshot retries, unchanged/single-flight reads, optional-stage completion,
  proxy forwarding/origin/path/body/rate checks and offline-cache behavior.
- Browser checks: 1440x900, 834x1194 and 390x844; light/dark; calendar, projects,
  timeline and conflicts. No document-level overflow or unresolved icons in 24 combinations.
- Project and account dialogs fit all three viewports. Checked optional date input,
  smart paste, TL copying, keyboard completion, theme persistence and reduced motion.
- Native desktop drag/drop changed the expected stage date in isolated test data.
- Netlify preview: public auth settings GET succeeds; malformed auth POST reaches
  Supabase validation; offline reload succeeds; cache contains no API entries.
- Synthetic browser data only. No personal cloud projects were edited for testing.

## Remaining Boundaries

- A real authenticated two-device conflict/recovery run was not performed in this audit.
- Database schema and RLS policies were not changed; deployment smoke checks are not a full security audit.
- Per-instance rate limits are a lightweight guard, not a shared/global abuse-prevention service.
- Netlify/Supabase network distance, outages and free-tier restrictions cannot be eliminated by front-end optimization.
- Keep asset query versions and the service-worker cache version aligned when publishing later changes.
