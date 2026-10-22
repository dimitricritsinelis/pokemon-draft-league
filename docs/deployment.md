# Deploy Pokémon Draft League

The multiplayer release uses the existing HTML/CSS/JavaScript game on Vercel and a server-only Supabase Postgres connection. No React rewrite, AI API key, custom WebSocket server, or Supabase Realtime configuration is required. Clients refresh the shared lobby and chat while open; the database is the authoritative state.

The current ChatGPT Sites deployment is a separate static release. It does not gain online play until this server-backed release has been deployed with its database configured.

For the recommended automatic GitHub deployment path, follow [Quick setup](quick-start.md). The detailed manual route below remains available.

## 1. Create the accounts and database

Create a Vercel account and a Supabase account under the person who will own the game. Create a Supabase project and retain its database password in your password manager. Choose a database region near your players, then choose a matching Vercel Function region when configuring your Vercel project.

For automatic setup, connect the repository in Supabase Project Settings → Integrations → GitHub, set working directory to `.`, production branch to `main`, and enable Deploy to production. Supabase applies `supabase/migrations/20261022000000_multiplayer.sql`. Alternatively, run `supabase/001_multiplayer.sql` once in the SQL Editor. These initial scripts are identical and preserve existing records. Add future database changes as new timestamped files under `supabase/migrations/`. The SQL creates the persistent state and atomic update functions, and restricts access to server-side credentials. Do not expose the state table directly to browser clients or weaken its access controls.

From the Supabase project settings, obtain the project URL and the server-side secret key. These belong only in the Vercel project's environment variables:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | Your project's HTTPS URL, such as `https://your-project.supabase.co` |
| `SUPABASE_SECRET_KEY` | Your server-only secret key |

Set both variables for the deployment environments you intend to use. Preview deployments should ideally use a separate Supabase project so that testing never modifies production career records.

Never put the secret key in `dist/`, browser JavaScript, a share link, a commit, or a public-prefixed environment variable. No Supabase key is required in the frontend. Prefer the current `sb_secret_...` key from Settings > API Keys. The server also accepts the older `SUPABASE_SERVICE_ROLE_KEY` variable for existing installations.

## 2. Create the Vercel project

Put this source in a GitHub repository owned by you, then import that repository in Vercel. The owner has approved public source code; secret keys and live game records must remain outside the repository. Keep the existing Sites Git remote if you want to retain the old deployment; add a separate GitHub remote instead of replacing it.

Select the repository root as the project root. `vercel.json` supplies these settings:

- Framework preset: **Other**.
- Build command: `npm test && npm run build` (tests must pass before publication).
- Output directory: `dist`.
- Node.js: **22.x**, as pinned in `package.json`.
- API routes: `api/index.mjs` and `api/[...path].mjs`.

The Function bundle explicitly includes the Pokémon catalog and game engines loaded by the server. Artwork stays in the static deployment rather than being added to the Function bundle.

The Supabase Vercel Marketplace integration can provision the database and synchronize these variables automatically. If using an independently created project, add the two server-only variables manually before deployment. Deploy the project, then run:

```sh
npm run verify:deployment -- https://your-game.vercel.app
```

This checks the public game page and API health without changing league data. Missing production credentials must return a clear unavailable response; production never falls back to a temporary file or in-memory database.

## 3. Test a real lobby on two devices

1. On the host device, create a lobby with 2–4 named teams and a Pokémon pool. Confirm that its join code contains four digits.
2. On another device, join using the link or code. Confirm that the guest can browse every team and its owned Pokémon.
3. Send chat messages in both directions. Confirm that both screens update, and that a message containing HTML appears as text.
4. Start the auction from the host. Award a Pokémon, place it, skip a different Pokémon, and change a formation. Confirm that guests see each update and cannot perform those actions themselves.
5. Refresh both devices. The host must retain control, the guest must stay read-only, and both must recover the same bids, budgets, rosters, and chat.
6. Finish the 23-player rosters, including each kicker, then simulate a game. Verify that both devices show the same result and that refreshing does not record the game twice.
7. Induct a Pokémon into the Hall of Fame or Hall of Shame. Confirm that both devices show the induction and cannot draft it. Remove it and confirm that eligibility returns.
8. Start a later lobby in the same saved league and confirm that careers, draft counts, auction averages, and both halls remain available.

## Local development

Use Node 22.13 or newer; Node 24 is also suitable for development. No runtime npm dependencies are required.

```sh
npm install
npm test
npm run build
npm run dev
```

Open the local URL printed by the server. Without Supabase credentials, the local server uses its explicitly local SQLite store in `.local/`. This permits browser testing and local restart recovery; it is not an online deployment or a substitute for Supabase. Local storage files are ignored by Git and Vercel.

For local testing against Supabase, create an untracked `.env.local` using the names in `.env.example` and real project values. Do not copy placeholder values into a working environment file. Set `PORT` if the default local port is occupied.

## Persistence and ownership

Each saved league keeps careers, draft counts, auction purchase totals and averages, and frozen Fame/Shame induction records. Both halls retire the Pokémon from that league's future draft pool until removed. The same species remains eligible in unrelated leagues.

Lobbies expire after one hour without meaningful activity. Routine reads do not reset that timer. Expiration closes the session, while the league's permanent records remain in the database. Use Supabase's backup and restore facilities appropriate to your plan for records you want to retain long term.

The four-digit room code is an invitation lookup, not a host password. Host and guest permissions are enforced by the API using separate strong session credentials. Keep the host browser's saved session secure. Clearing browser data removes that browser's saved access credentials; it does not delete the database.

The initial database adapter serializes small-group updates using an atomic compare-and-swap. That makes simultaneous requests and retried awards safe without requiring a separate queue. For a large public launch with many concurrent leagues, split state by league and add operational monitoring before scaling beyond friend-group use.

## Official references

- [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js)
- [Supabase database](https://supabase.com/docs/guides/database/overview)
