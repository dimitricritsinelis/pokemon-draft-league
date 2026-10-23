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

## Responsive interface revision

The main entry is **New game**, with matching **This device** and **Online** setup views. Switching modes preserves team count, pool, and names. Online hosting and manual code joining share that entry, while invitation links still open the join form directly. Saved local auctions can be resumed from the same setup.

Formation controls live beside the field. Sharing is a small board menu with matchup links and PNG exports. Clear board is a board action with explicit cancel/confirm choices and is unavailable for auction rosters. Team settings open as a fixed desktop popover or an iPhone bottom sheet; opening them keeps the board stationary. The More room control and fullscreen help were removed. Mobile controls use 44px touch targets, and setup/settings keep the focused input visible above the keyboard.

Verification for this revision:

- All 32 Node tests and the deployment build pass.
- The actual public Vercel site passed **398 interface checks** in Chromium and WebKit across widths 320, 393, 560, 768, 1024, and 1440. These cover settings geometry, focus/Escape/outside clicks, toolbar controls, export, clear cancellation/current-team confirmation, setup-mode copying, and 18 simulated keyboard assertions.
- The actual Vercel/Supabase deployment passed **499 full online checks** in 207 seconds. Completed four-team/92-player and two-team/46-player auctions and matches with separate Chromium desktop and WebKit phone clients. The desktop-host case used an invitation link; the phone-host case used the new manual four-digit join flow. Verified chat, skips, budgets, assignments, reload recovery, career draft prices, all 46 match stats and score reconciliations, and both halls. No JavaScript errors; four deliberate retired-player simulations correctly returned HTTP 409.
- Local formation regression passed **1,561 checks**, covering every formation, every phone position selection, field clipping, and horizontal overflow after the toolbar change.
- The actual public site passed a complete **three-team local auction** and match in iPhone-sized WebKit, including skipping, purchased-player reload recovery, 69 unique placements, 46 match stat rows, return to practice, and resuming the saved auction. The 16 checks passed without JavaScript errors. These practice/local tests do not write shared league records.

Run the portable `tests/browser-interface.py` for the shell checks and `tests/browser-deployment.py` for complete online auctions. Both accept `DRAFT_QA_URL`, `DRAFT_QA_OUTPUT`, `DRAFT_CHROMIUM_PATH`, and `DRAFT_WEBKIT_PATH`. The older browser checks were updated for the same entry flow.

## Live per-player auction redesign

The older host/viewer browser reports above describe the previous host-operated auction. They do not verify the new live-bidding interaction. `tests/browser-players.py` is the acceptance harness for the current player-operated protocol; host-only fixtures in the Node suite are explicitly marked legacy.

Each coach now owns one team, bids from their own device, receives a visible public leader/price and countdown, and places their own winning picks. Desktop uses a nonmodal auction beside the field; phones receive bidding automatically and return to the field for placement. Default bids do not open a numeric keyboard. Local same-device auctions keep the multi-team bid form.

Local validation for this change:

- 46 Node tests passed, including independent complete 2/3/4-coach drafts, concurrent raises, late extensions, automatic expiry, stale commands, ownership, same-seat recovery, and coherent match/career ledgers.
- 398 shell checks passed across Chromium and WebKit at widths 320–1440, including settings, local/online setup, sharing/export, clear confirmation, and simulated keyboard space.
- All twenty formations passed online field geometry checks at 320, 393, 768, 1024, and 1440 pixels (23 positions, no overlap, every tile in the field, no horizontal overflow).
- Actual local browser gameplay passed complete two-player (46 purchases) and four-player (92 purchases) auctions using independent Chromium PC and WebKit phone contexts. Each award was placed by its actual owner; tests covered budgets, free awards, protected rosters, reload/reconnect, coherent 46-player match stats, career prices, and shared halls. No JavaScript errors.
- A separate three-coach browser probe used real timed $1 → $2 → $3 outbids and late extension, plus custom amounts, Enter submission, skip/stale controls, and chat draft preservation. A reduced visualViewport checked the custom input and bid action above simulated keyboard space.

WebKit at an iPhone viewport is browser-engine coverage; it is not a test on a physical iPhone. Countdown expiry is settled by authenticated polling or a game action, rather than a background scheduled job.

Final handoff review also verified custom-bid validation before submission, visible reconnect state with bidding disabled, retained typed bids after reconnect, and the phone’s inline auction action reopening bidding. The phone action lives above the field; completed guest rosters have no redundant summary overlay. Before a first win, tapping the field shows next-step guidance rather than an empty catalog. Opening a new live round clears any underlying roster picker.

### Vercel and Supabase acceptance

The public game at https://pokemon-draft-league-jade.vercel.app/ served the final versioned assets and confirmed Supabase-backed 23-player rosters. Nested lobby and league routes reached the live API.

- A full four-coach production auction completed all 92 purchases and owner placements, then a physical PC “Play match” flow, shared results, reconciled 46-player statistics, career prices, and both hall operations. This validated the player/live protocol in `f14cf6b`.
- The final `6db9c47` release completed a fresh two-coach production auction through all 46 purchases, the physical phone “Play match” flow, saved results/careers, and hall operations. Its 210 acceptance checks passed without runtime errors; deliberate unauthorized/starter requests were rejected as expected.
- A separate three-coach production probe exercised real timed public raises, late extensions, automatic awards, custom bids, chat preservation, and keyboard-sized WebKit layouts.
- Final handoff checks covered the empty-team hint, returning from roster editing to a new bidding round, and closing the old phone auction before match results appear. Completed boards were visually reviewed as well as checked for tile and control overlap.

The first combined production run exposed a race in the browser test: it assumed a placement phase identified a particular prospect. Consecutive free awards can remain in that phase. The harness now waits for the exact nominee and pending award on the winning device before acting. The original failure evidence was retained, and the fresh two-coach run passed. Production QA used isolated test leagues, not the user’s room.

### Five-dollar quick raises

The online primary action now offers the current leading bid plus $5, with the exact total shown before submission. Custom amounts remain available. If the coach can outbid the leader but cannot afford a full $5 raise, the action explicitly offers the remaining budget as “All in.” Leading, full-roster, offline, and expired-round restrictions continue to apply.

Local verification: all 46 Node tests and deployment checks passed. The three-coach Chromium/WebKit live probe exercised physical $5 → $10 → $15 clicks, a real late extension, correct winner charges, chat preservation, and custom bids. A separate phone/PC budget probe verified custom $996 bidding, an explicit final $4 all-in, no overspending, and the action fitting a 320-pixel-wide phone.

### Continuous auctions and PC Box

Online auctions now run independently of field placement. A win is recorded once, stored in the owning coach’s PC Box, and followed by the next prospect. Coaches can minimize the auction, select a boxed Pokémon, and tap a field position while bidding continues. Minimizing persists across picks. Simulation remains disabled until all 23 positions on every team are assigned.

Funded picks open for 20 seconds, with a two-second introduction between prospects. Early bids do not extend the clock; late bids restore at least five seconds. The server allows a two-second transit buffer after displayed zero, honors bids received before the deadline even if database processing is slow, and reports processing duration separately so client round-trip clock estimates do not count database time as network delay. When all eligible wallets are empty, free draws advance every three seconds instead of flooding the Box instantly.

The WR/CB fix checks the painted perspective sidelines at the full bounds of each player tile, rather than merely checking the outer page. Outside positions are inset; phone line spacing and tablet/PC tile widths were adjusted together. Exported labels and art use the same spacing.

Current local checks include 43 passing Node tests, complete continuous 2/3/4-coach drafts with deferred lineups and reconciled matches, a delayed-browser live probe with a 90-second client clock skew, and the shell/formation browser checks. Earlier reports above describe previous auction timing and placement flows.
