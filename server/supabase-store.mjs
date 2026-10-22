/** Service-role-only HTTP transport; database CAS is the authoritative transaction. */
export function createSupabaseStore({ url, serviceRoleKey, fetch: transport = globalThis.fetch }) {
  if (!url || !serviceRoleKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured on the server.');
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(endpoint.hostname)) throw new Error('Supabase must use HTTPS.');
  async function rpc(name, body = {}) {
    const response = await transport(new URL('/rest/v1/rpc/' + name, endpoint), {
      method:'POST',headers:{'content-type':'application/json',apikey:serviceRoleKey,authorization:'Bearer '+serviceRoleKey},
      body:JSON.stringify(body),signal:AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`Persistent database request failed (${response.status}). Check the database migration and server credentials.`);
    return response.json();
  }
  return Object.freeze({
    kind:'supabase',
    async read() {
      const value=await rpc('draft_read_state');
      if(!value||!Number.isSafeInteger(value.revision)||!value.state||typeof value.state!=='object')throw new Error('The database returned an invalid game-state document.');
      return value;
    },
    async commit(expectedRevision,nextState) {
      const committed=await rpc('draft_commit_state',{expected_revision:expectedRevision,next_state:nextState});
      if(typeof committed!=='boolean')throw new Error('The database did not confirm whether the transaction committed.');
      return committed;
    }
  });
}
