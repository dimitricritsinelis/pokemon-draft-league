import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseStore } from './supabase-store.mjs';
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
