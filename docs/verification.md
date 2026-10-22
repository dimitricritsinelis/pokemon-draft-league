# Multiplayer release verification

The game is deployed at https://pokemon-draft-league-jade.vercel.app/. Supabase health, nested multiplayer routes, full online auctions and matches, cross-device browser playtests, and all 32 Node tests pass. Production acceptance was completed after installing the database schema and fixing Vercel's nested API routing. A successful build alone is not an online readiness check.

## Automated game and API checks

Run `npm test` for the checked-in Node tests. Coverage includes all 386 kicker grades, 2–4-team auction roster sizes, legacy auction parsing, 100 score-reconciled simulations, 250 seeded kicker comparisons, career aggregation, frozen Fame/Shame records, authoritative complete auctions, permissions, concurrency, duplicate-action protection, expiry, persistent league read access, and chat handling.

Run `npm run build` to validate deployment files, JavaScript syntax, and referenced local assets. The Vercel configuration was also checked against its published configuration schema during development.

## Browser checks

The checked-in Python Playwright checks use local Chromium and WebKit. Their browser executable paths are specific to the development workspace; adapt them to another machine's Playwright installation.

- `tests/browser-online.py`: 82 checks covering separate host/guest contexts at iPhone viewport sizes, a complete four-team 92-Pokémon auction, shared 46-player match results, reconciled statistics, cross-device Hall of Shame induction/removal, refresh recovery, chat, typed-bid preservation, and keyboard-sized layouts.
- `tests/browser-formations.py`: 1,561 checks across all 20 offense/defense combinations at widths 320, 393, 844, and 1440 in both engines. Every position was physically selected in every formation at width 393. Checked for overlap, field clipping, and horizontal page overflow.
- `tests/browser-viewer-prospect.py`: 31 targeted checks for read-only guest prospect stats, live skip updates, modal chat, and legacy auction migration.
- Additional browser suites passed 46 leave/reload/expiry checks and 24 delayed-response checks across both engines, covering persistent league records, ownership permissions, invitation changes, and leaving during an in-flight request.

These are mobile browser-engine and viewport tests, not a claim of testing on physical iPhone hardware. The first production deployment should follow the two-device Safari checklist in `docs/deployment.md`.

## Additional phone and PC verification

The final device-fit pass completed 103 checks in Chromium and WebKit at 320×568, 393×852, 430×932, 844×390, 1366×768, and 1920×1080. It checked picker behavior, full stat dialogs, active-team bid counts, and desktop field height. A separate 321-check pass rechecked all 20 formation combinations at both desktop sizes after height-based scaling was added. No JavaScript errors or position overlaps were found.

## Production verification commands

1. Apply `supabase/001_multiplayer.sql` to the selected Supabase project.
2. Configure the two server-only environment variables and deploy on Vercel.
3. Run `npm run verify:deployment -- <public-url>`. This requires working Supabase reads and JSON responses from nested API routes.
4. Run `tests/browser-deployment.py` against the actual public URL with Python Playwright's Chromium and WebKit installed. It creates two isolated QA leagues, completes 4-team and 2-team auctions, and verifies real shared state. Its private browser-storage output contains QA access credentials and must not be committed. See its docstring for environment variables and output locations.
5. The real-device lobby, chat, refresh, match, and halls checklist in `docs/deployment.md` remains useful for the owner's own iPhone and PC. Automated mobile coverage uses WebKit and an iPhone viewport, not physical iPhone hardware.

The local SQLite database, browser test records, screenshots, credentials, and temporary logs are excluded from the deployment and distributable source package.

## Live deployment investigation, 2026-10-22

- Reproduced Create lobby failing on the actual public deployment in Chromium desktop and WebKit at an iPhone viewport. Safe diagnostics identified `DATABASE_SETUP_REQUIRED`. The owner executed the initial SQL script and the deployed Supabase health check passed. Provider response text and credentials are never exposed in these diagnostics.
- The first online playtest then found Vercel returning a plain-text 404 for nested URLs used by joining, polling, actions, and chat. Plain Node Functions do not provide Next.js catch-all behavior for the existing filename. Added an explicit `/api/:path*` rewrite to the single handler and reconstructed its API path before dispatch. Verified nested routes on the actual redeployment.
- All 32 automated Node tests and the deployment build pass, including missing schema, denied credentials, unreachable database, missing initial state, and nested route handling.
- Tested the deployed practice UI in Chromium at 1440px and WebKit at 393px across Gen 1, Gen 2, Gen 3, and all generations. Eight games passed 74 checks for 23-player rosters, duplicate prevention, full results, MVPs, biggest plays, quarter totals, dialog fit, and no JavaScript errors. These games use browser-local practice data and do not validate production database persistence.
- **Live online browser suite: 222 checks passed in 181 seconds.** Completed an entire four-team, 92-player Gen 3 auction with a Chromium desktop host and WebKit phone guest, then an entire two-team, 46-player all-generation auction with the host and guest devices reversed. Verified live chat, skips, bidding, budget deductions, placements, read-only guests, reload recovery, matching final results, all 46 player stat rows and score reconciliations, persistent careers, and both Hall collections including retirement, score reveals, frozen careers, and removal. No JavaScript errors. The four HTTP 409 responses were expected rejections of deliberate attempts to simulate retired players.
- **Live production API suite: 73 checks passed.** Completed three 23-player rosters and all three pairwise matchups; verified every drafted player's two career games and guest-visible results. Also exercised all 20 formation combinations, four-digit codes, capacity limits, backend guest permissions, cross-origin protection, over-budget rejection, simultaneous bids, idempotent bid/chat retries, free bids, average prices, conditional polling, and shared chat against the deployed Supabase adapter.
- **Independent database-backed ledger verification: 96 checks passed.** A fresh HTTP read verified all 92 winning awards against permanent draft counts, purchase counts, paid totals and average prices, including the initial $40 purchase; also checked persistent match count, 386 career entries, hidden future prospects, and clean Hall removals. QA leagues are separate from player leagues.
- **Live visual suite: 1,561 checks passed.** Rechecked all 20 formation combinations at 320px, 393px, 844px, and 1440px in Chromium and WebKit on the actual public site. Every board had 23 positions with no overlapping tiles, field clipping, horizontal overflow, or JavaScript errors. Physically clicked every position in every formation at 393px in both engines.
- **Live export/share checks passed in both engines.** Generated and downloaded a 1600×1550 PNG through the actual Export image UI, opened the generated lineup link in another tab, and verified the imported board and sharing notice. No JavaScript errors.
