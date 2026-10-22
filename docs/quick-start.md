# Automatic deployment through GitHub

The code is uploaded once to your GitHub repository. After the connections below are made, changes to `main` publish automatically. No local Node installation or terminal commands are required for this route.

## One-time setup

1. **Vercel:** Sign in at [Vercel](https://vercel.com/signup) using GitHub. Click **Add New → Project**, import your game repository, and keep its existing build settings. If asked, allow Vercel to access this repository.
2. **Database:** Open [Supabase in the Vercel Marketplace](https://vercel.com/marketplace/supabase/supabase). Click **Install**, create a database, and connect it to your game project. Review the displayed plan before creating the resource. The integration creates the Supabase account/project as needed and automatically supplies the database URL and secret key to Vercel.
3. **Automatic database setup:** From Vercel’s **Storage** tab, open the database and choose **Open in Supabase**. Go to **Project Settings → Integrations → GitHub**, authorize GitHub, and select the same game repository. Set working directory to `.`, production branch to `main`, and turn on **Deploy to production**. The initial database migration is already in the repository; it preserves existing records if you ran the manual setup earlier. Preview database branching is optional and is not required for this setup.
4. **Publish:** Once the migration finishes successfully, open Vercel → your project → **Deployments → Redeploy** the latest `main` deployment. Open its production website link on your PC and iPhone.

You do not need to copy secret keys into chat or source files.

## If the database is connected but lobbies fail

Creating or connecting a Supabase database does not create the game's tables. If the live game reports `DATABASE_SETUP_REQUIRED`, initialize them once:

1. In Vercel, open your game project → **Storage** → your Supabase database → **Open in Supabase**.
2. In Supabase's left sidebar, choose **SQL Editor**, then **New query**.
3. Open [the setup script](https://raw.githubusercontent.com/dimitricritsinelis/pokemon-draft-league/main/supabase/001_multiplayer.sql), copy all its text, and paste it into the query editor.
4. Click **Run**. A successful run may say **Success. No rows returned**. The script preserves existing game records if run again.
5. Open your game's `/api/health` URL. Online play is ready for a browser playtest when it returns `{"ok":true,"persistence":"supabase","rosterSize":23}`. A website loading successfully does not establish that lobbies work.

If the response is `DATABASE_ACCESS_DENIED`, check that the integration supplied a server-only secret key and that the setup script's permissions were applied. `DATABASE_UNREACHABLE` means the server could not reach the configured Supabase project. Keep keys in provider settings, never in browser code or chat.

## What becomes automatic

- Pushing code to `main` triggers Vercel to run the complete test suite, check the build, and publish if those checks pass.
- New checked-in files under `supabase/migrations/` are applied by Supabase’s GitHub integration.
- The Marketplace integration keeps database connection variables synchronized.
- Careers, halls, rosters, bids, and chat remain in the database when the website is updated.

Creating the empty GitHub repository and approving provider account connections require your account access. The current ChatGPT connection can update accessible repositories but cannot create a new repository.

If you already created Supabase separately, connect that existing project using the integration instead of creating another one. If you prefer the manual route, use [the detailed deployment guide](deployment.md).

Sources: [Vercel GitHub automatic deployments](https://vercel.com/docs/git/vercel-for-github), [Supabase Marketplace integration](https://supabase.com/docs/guides/integrations/vercel-marketplace), [Supabase GitHub migrations](https://supabase.com/docs/guides/deployment/branching/github-integration).
