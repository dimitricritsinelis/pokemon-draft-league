const input = process.argv[2];
if (!input) throw new Error('Usage: npm run verify:deployment -- https://your-game.vercel.app');
const base = new URL(input);
if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Supply the public HTTP(S) site URL without credentials.');
for (const route of ['/', '/api/health']) {
  const response = await fetch(new URL(route, base), { redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    const details = await response.json().catch(() => null);
    throw new Error(`${route} returned HTTP ${response.status}.${details?.code ? ' ' + details.code + ':' : ''}${details?.error ? ' ' + details.error : ''}`);
  }
  if (route === '/') {
    if (!(await response.text()).includes('Pokémon Draft League')) throw new Error('The URL does not serve the expected game.');
  } else {
    const payload = await response.json();
    if (payload.ok !== true || payload.persistence !== 'supabase' || payload.rosterSize !== 23) throw new Error('The multiplayer API did not confirm a working Supabase database and 23-player rosters.');
  }
  console.log(`${route} is reachable.`);
}
// These must reach the game service, rather than a static Vercel 404 page.
for (const route of ['/api/lobbies/0000','/api/leagues/00000000-0000-0000-0000-000000000000']) {
  const response = await fetch(new URL(route, base), { signal: AbortSignal.timeout(15000) });
  const payload = await response.json().catch(() => null);
  if (!payload?.code || ![403,404,410].includes(response.status)) throw new Error(`${route} did not reach the multiplayer API. Check the Vercel rewrites.`);
  console.log(`${route} reaches the multiplayer API.`);
}
console.log('Public-page and API checks passed. Run the two-device lobby checklist in docs/deployment.md before sharing widely.');
