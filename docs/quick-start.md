# Get your game online

Do this on your computer. No GitHub setup is needed.

1. **Download and unzip the game.** Keep the folder containing `package.json`.
2. **Install [Node.js LTS](https://nodejs.org/en/download).** Accept the installer defaults.
3. **Create accounts at [Vercel](https://vercel.com/signup) and [Supabase](https://supabase.com/dashboard/sign-up).** In Supabase, click **New project**, name it `pokemon-draft`, choose a database password, and wait for setup to finish.
4. **Set up the database.** In Supabase, open **SQL Editor → New query**. Open the game's `supabase/001_multiplayer.sql` in Notepad, copy everything into that query, and click **Run**.
5. **Create the Vercel project.** Open the game folder in File Explorer. Click the address bar, type `cmd`, and press Enter. In that black window, paste:

   ```sh
   npx vercel link
   ```

   Allow the Vercel tool to install if asked. Follow the browser sign-in. Choose your account, create a new project named `pokemon-draft`, and use `.` for the folder. Keep the defaults. Leave this window open.
6. **Connect the database.** On Vercel, open your new project → **Settings → Environment Variables**. Add these two values for **Production**:

   | Name | What to paste |
   | --- | --- |
   | `SUPABASE_URL` | Your Supabase **Project URL**, available from its **Connect** button |
   | `SUPABASE_SECRET_KEY` | Your Supabase **Secret key**, starting `sb_secret_`, from **Settings → API Keys** |

   If no secret key exists, create one there. Paste the secret only into Vercel, not into this chat or the game files.
7. **Publish.** Return to the black window and paste:

   ```sh
   npx vercel --prod
   ```

   When it finishes, open the `.vercel.app` website it prints. Use the same link on your PC and iPhone. Host a lobby on one device and join from the other.

On a Mac, use Terminal in the game folder instead of the Windows `cmd` step. If a command fails, share the error message with secret values removed.

The game already includes its build settings. You do not need to pick a framework, write code, or install a database on your computer.

Sources: [Vercel setup commands](https://vercel.com/docs/projects/deploy-from-cli), [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).
