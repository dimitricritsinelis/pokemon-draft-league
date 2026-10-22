/** Service-role-only HTTP transport; database CAS is the authoritative transaction. */
export class DatabaseError extends Error {
  constructor(code, message) { super(message); this.name = 'DatabaseError'; this.code = code; }
}
export function createSupabaseStore({ url, serviceRoleKey, secretKey, fetch: transport = globalThis.fetch }) {
  const key = secretKey || serviceRoleKey;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be configured on the server.');
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(endpoint.hostname)) throw new Error('Supabase must use HTTPS.');
  async function rpc(name, body = {}) {
    let response;
    try { response = await transport(new URL('/rest/v1/rpc/' + name, endpoint), {
      method:'POST',headers:{'content-type':'application/json',apikey:key,...(key.startsWith('sb_secret_')?{}:{authorization:'Bearer '+key})},
      body:JSON.stringify(body),signal:AbortSignal.timeout(15000)
    }); } catch {
      throw new DatabaseError('DATABASE_UNREACHABLE', 'Online play cannot reach the shared database. The site owner needs to check that the Supabase project is running and its connection URL is correct.');
    }
    if (!response.ok) {
      // Never relay provider messages: they may contain connection or account details.
      const details = await response.json().catch(() => null);
      if (['PGRST202','PGRST205','42P01','42883'].includes(details?.code)) {
        throw new DatabaseError('DATABASE_SETUP_REQUIRED', 'Online play needs its database tables and functions installed. The site owner must run supabase/001_multiplayer.sql in the Supabase SQL Editor.');
      }
      if ([401,403].includes(response.status) || ['42501','PGRST301','PGRST302','PGRST303'].includes(details?.code)) {
        throw new DatabaseError('DATABASE_ACCESS_DENIED', 'Online play cannot access the shared database. The site owner needs to check the server-only Supabase key and database permissions.');
      }
      throw new DatabaseError('DATABASE_UNAVAILABLE', 'The shared database is unavailable. The site owner needs to check the Supabase project and server logs.');
    }
    return response.json();
  }
  return Object.freeze({
    kind:'supabase',
    async read() {
      const value=await rpc('draft_read_state');
      if(!value||!Number.isSafeInteger(value.revision)||!value.state||typeof value.state!=='object')throw new DatabaseError('DATABASE_SETUP_REQUIRED', 'Online play needs its database initialized. The site owner must run supabase/001_multiplayer.sql in the Supabase SQL Editor.');
      return value;
    },
    async commit(expectedRevision,nextState) {
      const committed=await rpc('draft_commit_state',{expected_revision:expectedRevision,next_state:nextState});
      if(typeof committed!=='boolean')throw new Error('The database did not confirm whether the transaction committed.');
      return committed;
    }
  });
}
