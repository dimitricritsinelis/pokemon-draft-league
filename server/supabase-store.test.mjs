import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseStore } from './supabase-store.mjs';
import { createService } from './service.mjs';
import { loadEngines } from './engines.mjs';
for (const [label, credential, authorization] of [
  ['current secret key', {secretKey:'sb_secret_fixture_only'}, undefined],
  ['legacy role key', {serviceRoleKey:'legacy_fixture_only'}, 'Bearer legacy_fixture_only']
]) test(`database transport uses correct headers for ${label}`,async()=>{
  const requests=[];
  const store=createSupabaseStore({url:'https://fixture.supabase.co',...credential,fetch:async(url,options)=>{
    requests.push({url:String(url),...options});
    return new Response(JSON.stringify(String(url).endsWith('draft_read_state')?{revision:0,state:{leagues:{},lobbies:{}}}:true));
  }});
  assert.equal((await store.read()).revision,0);
  assert.equal(await store.commit(0,{leagues:{},lobbies:{}}),true);
  for(const request of requests){
    assert.equal(request.headers.apikey,credential.secretKey||credential.serviceRoleKey);
    assert.equal(request.headers.authorization,authorization);
  }
});

test('database deployment failures identify the repair without exposing provider details or keys', async () => {
  const engines = loadEngines();
  for (const [status, providerCode, expected] of [
    [404, 'PGRST202', 'DATABASE_SETUP_REQUIRED'],
    [404, 'PGRST205', 'DATABASE_SETUP_REQUIRED'],
    [401, 'PGRST301', 'DATABASE_ACCESS_DENIED'],
    [403, '42501', 'DATABASE_ACCESS_DENIED'],
    [500, 'XX000', 'DATABASE_UNAVAILABLE'],
    [0, '', 'DATABASE_UNREACHABLE']
  ]) {
    const store = createSupabaseStore({url:'https://fixture.supabase.co',secretKey:'sb_secret_fixture_only',fetch:async()=>{
      if (!status) throw new Error('private connection details');
      return new Response(JSON.stringify({code:providerCode,message:'private connection details sb_secret_fixture_only'}),{status});
    }});
    const service = createService({store,engines});
    for (const [path, method, body] of [['/api/health','GET'],['/api/lobbies','POST',JSON.stringify({nickname:'Coach',teamCount:2,mode:'both'})]]) {
      const response = await service.fetch(new Request('https://draft.example'+path,{method,...(body?{body}:{})}));
      assert.equal(response.status,503);
      const payload=await response.json();
      assert.equal(payload.code,expected);
      assert.doesNotMatch(JSON.stringify(payload),/fixture|private connection|sb_secret/);
    }
  }
});

test('uninitialized persistent state reports setup required instead of accepting a broken health check',async()=>{
  const store=createSupabaseStore({url:'https://fixture.supabase.co',secretKey:'sb_secret_fixture_only',fetch:async()=>new Response('null')});
  await assert.rejects(store.read(),error=>error.code==='DATABASE_SETUP_REQUIRED');
});
