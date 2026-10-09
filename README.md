# Pokémon Draft League

A simple HTML, CSS, and JavaScript NFL draft board with Gen 1, Gen 2, and combined Pokémon pools. No app framework, account, or backend required.

Open `dist/index.html` on a computer, or serve the `dist` folder with any static web server. For example:

```sh
python -m http.server 8080 --directory dist
```

Open the published site in Safari on iPhone. Tap a position, then a Pokémon. Picking a Pokémon already drafted swaps the two players; choosing it for an empty position moves it there. Changing personnel preserves hidden picks for when you switch back.

Each generation mode remembers its own personnel and lineup in browser storage. The optional Retro art button switches the Pokémon to transparent Crystal sprites while keeping modern controls. Gen 2 starts with an empty board; Sample lineup fills it with a Johto example. Legendary and mythical Pokémon are included.

Export image prepares a 1600×1370 PNG of all 22 active positions, names, personnel, and generation. Share image opens native file sharing where supported; Save image is the fallback. Share link includes the exact lineup and artwork style. Shared boards are saved separately until you explicitly choose Keep lineup, so opening a friend's link preserves your own draft. My lineup returns to your original board. Storage failures do not prevent gameplay; keep a share link if the browser cannot save.

More room explains Safari's Hide Toolbar option and adding the game to the Home Screen. The manifest and Apple web-app metadata support a standalone app view. A fullscreen button appears only in browsers that support it. Safari's toolbar and iOS share sheet still require user action. HTTPS is needed for native sharing and clipboard access; local file play supports drafting but may limit these browser features.

The 251 Pokémon records, transparent 475×475 artwork, and transparent 56×56 retro sprites are bundled locally; the game does not call an external API. Barlow fonts are also bundled locally with system fallbacks and their open font license.

Artwork and data sources are recorded in `artwork-sources.json` and `gen2-artwork-sources.json`; the new asset checks are in `gen2-asset-verification.json`. Pokémon artwork belongs to The Pokémon Company; this is a fan project.
