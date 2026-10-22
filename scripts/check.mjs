import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const required = ['dist/index.html', 'dist/assets/pokemon.js', 'dist/auction.js', 'dist/ratings.js', 'dist/simulation.js', 'api/index.mjs', 'api/[...path].mjs', 'server/service.mjs', 'server/engines.mjs', 'server/formations.mjs', 'vercel.json'];
for (const name of required) {
  const info = await stat(path.join(root, name)).catch(() => null);
  if (!info?.isFile()) throw new Error(`Required deployment file is missing: ${name}`);
}

let checked = 0;
async function checkDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await checkDirectory(full);
    else if (/\.(?:mjs|js)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', full], { encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr || `Syntax check failed: ${full}`);
      checked++;
    }
  }
}
for (const folder of ['dist', 'server', 'api', 'scripts']) await checkDirectory(path.join(root, folder));

const html = await readFile(path.join(root, 'dist/index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
  const href = match[1].split(/[?#]/)[0];
  if (!href || /^(?:https?:|data:|#|\/\/)/.test(href)) continue;
  const full = path.resolve(root, 'dist', href.replace(/^\//, ''));
  if (!full.startsWith(path.join(root, 'dist') + path.sep)) throw new Error(`Unsafe asset path: ${href}`);
  if (!(await stat(full).catch(() => null))?.isFile()) throw new Error(`The page references a missing file: ${href}`);
}
const bootstrap = await readFile(path.join(root, 'supabase/001_multiplayer.sql'), 'utf8');
const migration = await readFile(path.join(root, 'supabase/migrations/20261022000000_multiplayer.sql'), 'utf8');
if (bootstrap !== migration) throw new Error('The initial automatic database migration must match the manual bootstrap SQL.');

const config = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'));
if (config.outputDirectory !== 'dist' || config.framework !== null) throw new Error('Vercel must serve the existing static game from dist/.');
console.log(`Deployment files verified; ${checked} JavaScript files passed syntax checks.`);
