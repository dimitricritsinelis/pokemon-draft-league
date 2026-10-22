# Multiplayer release verification

This release has been verified locally against the real HTTP API and its persistent SQLite development adapter. Vercel publication, Supabase migration execution, and production two-device verification remain pending the owner's account connections.

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

## Production acceptance still required

1. Apply `supabase/001_multiplayer.sql` to the selected Supabase project.
2. Configure the two server-only environment variables and deploy on Vercel.
3. Run `npm run verify:deployment -- <public-url>`.
4. Complete the real-device lobby, chat, refresh, match, and halls checklist in `docs/deployment.md`.

The local SQLite database, browser test records, screenshots, credentials, and temporary logs are excluded from the deployment and distributable source package.
