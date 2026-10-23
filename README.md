# Pokémon Draft League

Production source: [dimitricritsinelis/pokemon-draft-league](https://github.com/dimitricritsinelis/pokemon-draft-league). Vercel deployment and Supabase integration require the owner’s one-time account connections.

A responsive HTML/CSS/JavaScript football draft game featuring all 386 Pokémon from generations 1–3. Build two practice teams or host an online auction for 2–4 players, each with a $1,000 budget and a 23-player roster: 11 offense, 11 defense, and one kicker.

## Design approach

The field and the current decision come first. Give each screen one clear next action, reveal less-used options when needed, and remove controls that repeat information or interrupt play. PC and phone share the same game rules with layouts suited to each screen. Review the complete join → bid → win → place → play journey using independent players, populated rosters, reconnects, and keyboard space; passing geometry checks alone does not establish a good experience.

## Run locally

Use Node 22.13 or newer (Node 24 also works):

```sh
npm install
npm test
npm run build
npm run dev
```

The development server serves the game and API and uses a persistent **local SQLite database** when Supabase is not configured. This is for development; production requires Supabase. Start with [automatic GitHub deployment setup](docs/quick-start.md), or see [deployment instructions](docs/deployment.md) for the database migration, server credentials, and Vercel configuration. No frontend framework or runtime npm dependencies are required. Once connected, Vercel tests and publishes each update to `main`, and Supabase’s GitHub integration applies checked-in migrations.

The existing ChatGPT Sites publication remains a separate, earlier static release. Preparing this repository does not deploy the multiplayer release or provision a Vercel/Supabase account.

## Online play

Open **New game → Online**. The host chooses 2–4 coaches and a Pokémon generation pool. Friends join by four-digit code or invitation link, name their own teams, and bid from their own devices. Every coach must join before the host can start. Strong session credentials preserve each coach’s team ownership across reloads; the short code does not grant host control.

Online auctions use public, ascending live bids. Each coach sees the leader and current price, with one **Bid $… (+$5)** button and an optional custom amount. A tap offers $5 above the current leading bid; the total is shown before submitting. If less than a $5 raise remains in the coach’s budget, the button offers that remaining balance as an explicit **All in** bid. Each prospect starts with 20 seconds; late bids leave at least 5 seconds for a response. Early bids do not add time. The server allows a 2-second transit buffer after the displayed countdown, and client clocks account for measured round-trip delay. The highest bidder wins automatically and only that team pays. An unbeatable bid settles immediately. If nobody bids, a random eligible team receives the Pokémon free; when every eligible budget is empty, free picks are revealed and awarded every three seconds. A full roster stops bidding.

Wins go straight to the coach’s **PC Box**, and the next pick starts without waiting for field placement. A two-second introduction separates funded picks. Open PC Box, choose a Pokémon, then tap a field position; an overwritten unassigned player returns to the box, and field players can swap. Every team must arrange all 23 positions before playing. Each coach can rearrange their own purchased Pokémon, rename their team, and change formations. All coaches can inspect the other teams and chat. The host controls starting, skipping prospects before any bid, match simulations, and the league halls. Skipped Pokémon remain excluded for the draft. Auctions contain 46, 69, or 92 unique purchases. After every roster is complete, the host chooses any two teams to play.

On PC the live auction sits beside the field. On phones bidding opens as a compact dialog. **Minimize auction** leaves the field and PC Box available while the auction keeps running; it stays minimized across later picks. The live-auction action above the field reopens bidding. A single row shows team budgets and roster progress. The Room button holds invitations and session controls. Leaving preserves a **Resume room** option for the same saved seat. Same-device local auctions retain their shared multi-team bid form.

The database is authoritative for bids, budgets, ownership, schemes, chat, match results, and career updates. Atomic revision checks and action IDs prevent duplicate charges and double-counted games. Clients poll for updates while open; unchanged responses use ETags instead of repeatedly downloading the full state. Routine polling does not extend a lobby’s one-hour inactivity limit. Chat and actual game actions do. League records remain after the session expires, with persistent owner/read access for returning devices.

## League records and both halls

Each friend group has a persistent league. New lobbies created using that league’s saved host access reuse its records. Joining friends see the same Hall of Fame, Hall of Shame, career totals, draft counts, auction purchase totals, and average paid prices. Free awards count as purchases at $0. Career stats cover every Pokémon; there are no invented historical totals from older browser-only versions.

Only the host may induct or remove Pokémon. Either hall freezes a career snapshot, reveals all 25 positional values and explanations, and retires that species from the league’s draft pool until removed. Removal preserves previous career totals and allows future accumulation. Other leagues have independent halls and eligibility. A player already purchased in an ongoing auction cannot retire until that draft finishes. Retiring a player on a completed roster prevents further games with that retired player until removal or a new draft.

Saved league access remains available after leaving a room or after expiry. Browser credentials identify returning users; clearing browser storage removes that device’s access credentials, not the stored database records. There is no account recovery or password sign-in in this version.

## Matches and kickers

The four-quarter simulation considers each drafted player’s positional fit, opposing personnel, individual matchups, bounded lore advantages, and variance. Quarterbacks matter more than individual coverage players, and a viable kicker affects actual field-goal and extra-point outcomes. Touchdowns score six, made extra points one, and made field goals three. Games tied after regulation remain draws.

Every one of the 46 participants receives a box-score row. Passing and receiving totals, turnovers, opposing defensive stats, sacks, kicking points, quarters, and final scores reconcile. Results identify each team’s biggest play and offensive/defensive MVPs. Kicker rows include field-goal attempts/makes, longest field goal, extra-point attempts/makes, kicking points, and special-teams snaps. Career longest field goal takes the maximum rather than adding distances.

All 386 species have physical and lore-based football scouting across 25 roles. Existing creative mechanics include Alakazam’s teleport coverage, Blastoise’s cannon passing, Machamp’s four-arm receiving/blocking, and penalties for receivers without feasible catches. Kicker grading considers limbs, kicking moves, control, power, size, and appropriate lore adaptations. Numerical grades stay out of drafting, shared boards, and ordinary match results; halls reveal retired players’ values. Online decisions and simulations run on the server. The bundled practice-mode JavaScript is still inspectable.

## Local practice and sharing

Without an online lobby, both practice teams use one Pokémon pool with no duplicates. Tap a position and choose a Pokémon; selecting an existing teammate swaps or moves it. Generation modes remember their teams. Formations sit on the board toolbar; team settings hold names, sample lineups, and halls. Clear board requires confirmation, and sharing/export sit behind the board’s share icon.

Practice drafts and same-device auctions retain browser saves separately from online lobbies. Existing 22-player auctions are upgraded with one additional eligible prospect per team when the remaining pool permits it. Otherwise their old roster remains readable and a new auction is needed for kicker-enabled matches. Local practice matches do not alter authoritative league career statistics. When a saved online league is available, the halls display its database records; otherwise solo career records are explicitly device-local.

**Export image** creates a 1600×1550 PNG of the selected team’s board, personnel, names, and public scouting measurements. **Share link** copies two lineup snapshots rather than creating a live multiplayer session; use an online invitation for live play. Older share links and browser saves remain readable. Native sharing and clipboard features require browser support and HTTPS.

On iPhone, Safari’s Hide Toolbar option or adding the game to the Home Screen gives more room. The field uses a local turf texture with a shallow perspective and upright players. Tight ends are staggered on narrow screens, and the kicker has a separate position.

## Pokémon data and attribution

Every prospect shows sourced height and weight, an estimated 40-yard dash, all six canonical base stats and their total, possible abilities, and an individual football synopsis. Standard forms are used: Deoxys Normal Forme and ordinary Castform. Base Speed is distinct from the estimated dash time. Very long species can use Pokédex body length as height.

Dash times are fictional scouting estimates, not measured results or conversions of battle Speed. Their standing-start turf policy permits ordinary flight, hovering, and burrowing but excludes teleportation, transformations, special launch boosts, and outside assistance. Positional grading separately allows creative powers. Rationales are in `pokemon-speed-estimates.json`; factual measurement provenance is in `pokemon-stats-sources.json`. Gen 3 measurements were imported from PokéAPI and cross-checked against Bulbapedia.

The complete catalog, transparent 475×475 artwork, fonts, and field texture are bundled locally. Source manifests include `artwork-sources.json`, `gen2-artwork-sources.json`, `gen3-data-sources.json`, `font-sources.json`, and `field-artwork-source.json`. `position-grade-design.json` records the fictional scouting model. Pokémon artwork belongs to The Pokémon Company; this is a fan project. Barlow fonts include their open font license.

Field texture: [ambientCG Grass005](https://ambientcg.com/view?id=Grass005), under [CC0 1.0](https://docs.ambientcg.com/license/).
