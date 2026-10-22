const input = process.argv[2];
if (!input) throw new Error('Usage: npm run verify:deployment -- https://your-game.vercel.app');
const base = new URL(input);
if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Supply the public HTTP(S) site URL without credentials.');
for (const route of ['/', '/api/health']) {
  const response = await fetch(new URL(route, base), { redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${route} returned HTTP ${response.status}.`);
  if (route === '/') {
    if (!(await response.text()).includes('Pokémon Draft League')) throw new Error('The URL does not serve the expected game.');
  } else {
    const payload = await response.json();
    if (payload.ok === false || payload.configured === false) throw new Error('The multiplayer API reports that its database is not ready.');
  }
  console.log(`${route} is reachable.`);
}
console.log('Public-page and API checks passed. Run the two-device lobby checklist in docs/deployment.md before sharing widely.');
