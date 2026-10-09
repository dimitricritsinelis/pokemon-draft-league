# Pokémon Draft League

A simple HTML, CSS, and JavaScript NFL draft board with Gen 1, Gen 2, and combined Pokémon pools. No app framework, account, or backend required.

Open `dist/index.html` on a computer, or serve the `dist` folder with any static web server. For example:

```sh
python -m http.server 8080 --directory dist
```

Open the published site in Safari on iPhone. Tap a position, then a Pokémon. Picking a Pokémon already drafted swaps the two players; choosing it for an empty position moves it there. Changing personnel preserves hidden picks for when you switch back.

Use the hamburger menu for generation, offense/defense personnel, export, link sharing, sample/clear, stats guide, and Safari screen-space guidance. The menu starts closed on each load; the compact header summarizes the active formation and pick count. Retro art has been removed; existing saves and links use modern artwork while preserving their lineups.

The board uses a textured grass field with gently converging sidelines. Pokémon and labels stay upright, selection rings stay inside each tile, and narrow screens stagger tight ends to keep dense personnel groups readable. The live board and PNG export use the same perspective geometry.

Each generation mode remembers its own personnel and lineup in browser storage. Gen 2 starts with an empty board; Sample lineup fills it with a Johto example. Legendary and mythical Pokémon are included.

Export image prepares a 1600×1550 PNG of all 22 active positions, names, scouting stats, personnel, and generation. Share image opens native file sharing where supported; Save image is the fallback. Share link includes the exact lineup. Shared boards are saved separately until you explicitly choose Keep lineup, so opening a friend's link preserves your own draft. My lineup returns to your original board. Storage failures do not prevent gameplay; keep a share link if the browser cannot save.

Every Pokémon card shows height in feet/inches, weight in pounds, and an estimated 40-yard dash time in seconds. Height and weight were extracted from Bulbapedia's height/weight lists for IDs1–251, standard forms only, and verified against both lists and existing PokéAPI metadata. Original meters/kilograms remain in the catalog; display height rounds to the nearest inch and pounds to one decimal place. Very long Pokémon may use Pokédex body length as height. The stats guide links both sources.

40-yard times are manually authored fantasy scouting estimates based on movement anatomy, agility, and familiar lore, not measured results or conversions of battle Speed. The policy uses a standing start on soft turf, permits ordinary flight/hovering/burrowing, and excludes teleportation, transformations, special launch boosts, and outside assistance. Aquatic Pokémon use their on-turf locomotion. All estimates have brief rationales in `pokemon-speed-estimates.json`; factual measurement provenance is in `pokemon-stats-sources.json`. Estimates are labeled in both the picker and exported boards.

More room explains Safari's Hide Toolbar option and adding the game to the Home Screen. The manifest and Apple web-app metadata support a standalone app view. A fullscreen button appears only in browsers that support it. Safari's toolbar and iOS share sheet still require user action. HTTPS is needed for native sharing and clipboard access; local file play supports drafting but may limit these browser features.

The 251 Pokémon records and transparent 475×475 artwork are bundled locally; the game does not call an external API. Barlow fonts are also bundled locally with system fallbacks and their open font license.

Artwork and data sources are recorded in `artwork-sources.json` and `gen2-artwork-sources.json`; the new asset checks are in `gen2-asset-verification.json`. Pokémon artwork belongs to The Pokémon Company; this is a fan project.

Field texture: [ambientCG Grass005](https://ambientcg.com/view?id=Grass005), used under [CC0 1.0](https://docs.ambientcg.com/license/). The local `dist/assets/turf.jpg` is the original 1024×1024 color texture.
