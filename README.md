# Pokémon Draft League

A simple HTML, CSS, and JavaScript NFL draft game with two teams, Gen 1, Gen 2, and combined Pokémon pools. No app framework, account, or backend required.

Open `dist/index.html` on a computer, or serve the `dist` folder with any static web server. For example:

```sh
python -m http.server 8080 --directory dist
```

Open the published site in Safari on iPhone. Tap a position, then a Pokémon. Switch between Team 1 and Team 2 using the compact header tabs. Both teams use the same generation pool, and a Pokémon can occupy only one position across both teams. Picking one already on the current team swaps the two players; choosing it for an empty position moves it there. Pokémon on the other team are marked and unavailable. Changing personnel preserves inactive picks for when you switch back; those picks still reserve their Pokémon.

Use the hamburger menu for generation, offense/defense personnel, export, link sharing, sample/clear, stats guide, and Safari screen-space guidance. The menu starts closed on each load; the header shows each team's active pick count and the Simulate Match button. Personnel, Sample lineup, and Clear board affect the selected team. Retro art has been removed; existing saves and links use modern artwork while preserving their lineups.

The board uses a textured grass field with gently converging sidelines. Pokémon and labels stay upright, selection rings stay inside each tile, and narrow screens stagger tight ends to keep dense personnel groups readable. The live board and PNG export use the same perspective geometry.

Each generation mode remembers both teams' personnel and lineups in browser storage. Team 2 starts empty; Sample lineup fills the selected team with an example using Pokémon that remain available. Gen 2 uses Johto examples; combined mode starts Team 1 with Kanto and Team 2 with Johto. Legendary and mythical Pokémon are included. Existing single-team saves migrate to Team 1 with an empty Team 2.

Export image prepares a 1600×1550 PNG of the selected team's 22 active positions, names, scouting stats, personnel, and generation. Share image opens native file sharing where supported; Save image is the fallback. Share link includes both exact lineups, including inactive picks, and the selected team. Shared matchups are saved separately until you choose Keep matchup, so opening a friend's link preserves your own teams. My teams returns to your original pair. Old single-team links still work. Storage failures do not prevent gameplay; keep a share link if the browser cannot save.

Fill all 22 active positions on each team to enable Simulate Match. The game plays four quarters with twelve possessions per team, position-weighted offense and defense, personnel-dependent passing/running balance, and random variation. Quarter scores, the final score, and key Pokémon passing, rushing, receiving, and defensive stats come from the same simulated possessions. Touchdowns include successful extra points, field goals count three, and games tied after four quarters finish as draws. Play again runs a fresh game with the same rosters.

All 251 species have an individually reviewed internal profile, producing 6,024 grades across 24 football roles. The model combines the sourced height/weight and estimated 40-yard time with possession control, awareness, strength, durability, mobility, passing accuracy, and anatomy-specific limits. Immobile cocoons cannot become quarterbacks simply through durability; mouth/talon carrying is treated separately from an accurate pass or center snap. QB contributes 55% of passing strength, while receiving and protection contribute 27% and 18%; individual defenders have smaller shares of their units. Design rationales and the grading policy are recorded in `position-grade-design.json`. Grades never appear in the interface, exported boards, share links, or match results. This is a front-end game, so its JavaScript remains inspectable.

Every Pokémon card shows height in feet/inches, weight in pounds, and an estimated 40-yard dash time in seconds. Height and weight were extracted from Bulbapedia's height/weight lists for IDs1–251, standard forms only, and verified against both lists and existing PokéAPI metadata. Original meters/kilograms remain in the catalog; display height rounds to the nearest inch and pounds to one decimal place. Very long Pokémon may use Pokédex body length as height. The stats guide links both sources.

40-yard times are manually authored fantasy scouting estimates based on movement anatomy, agility, and familiar lore, not measured results or conversions of battle Speed. The policy uses a standing start on soft turf, permits ordinary flight/hovering/burrowing, and excludes teleportation, transformations, special launch boosts, and outside assistance. Aquatic Pokémon use their on-turf locomotion. All estimates have brief rationales in `pokemon-speed-estimates.json`; factual measurement provenance is in `pokemon-stats-sources.json`. Estimates are labeled in both the picker and exported boards.

More room explains Safari's Hide Toolbar option and adding the game to the Home Screen. The manifest and Apple web-app metadata support a standalone app view. A fullscreen button appears only in browsers that support it. Safari's toolbar and iOS share sheet still require user action. HTTPS is needed for native sharing and clipboard access; local file play supports drafting but may limit these browser features.

The 251 Pokémon records and transparent 475×475 artwork are bundled locally; the game does not call an external API. Barlow fonts are also bundled locally with system fallbacks and their open font license.

Artwork and data sources are recorded in `artwork-sources.json` and `gen2-artwork-sources.json`; the new asset checks are in `gen2-asset-verification.json`. Pokémon artwork belongs to The Pokémon Company; this is a fan project.

Field texture: [ambientCG Grass005](https://ambientcg.com/view?id=Grass005), used under [CC0 1.0](https://docs.ambientcg.com/license/). The local `dist/assets/turf.jpg` is the original 1024×1024 color texture.
