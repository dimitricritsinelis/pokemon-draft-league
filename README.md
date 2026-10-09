# Pokémon Draft League

A simple HTML, CSS, and JavaScript draft board for the original 151 Pokémon. No app framework, account, or backend required for the game itself.

Open `dist/index.html` on a computer, or serve the `dist` folder with any static web server. For example:

```sh
python -m http.server 8080 --directory dist
```

Open the published site in Safari on iPhone. Tap a position, then a Pokémon. Picking a Pokémon already in the lineup moves it to the new position. Changes to personnel keep shared positions and restore hidden picks when switching back. The sample matches the supplied reference lineup.

The entire Pokémon catalog and its transparent 475×475 artwork are bundled locally; the game does not call an external API. Fonts use Google Fonts with system fallbacks. Draft state lasts for the current page session.

Artwork and data sources are recorded in `artwork-sources.json`. Pokémon artwork belongs to The Pokémon Company; this is a fan project.
