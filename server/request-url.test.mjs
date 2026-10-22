import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { apiRequestUrl } from './request-url.mjs';

test('Vercel routes every nested multiplayer endpoint to the Node handler',async()=>{
  const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.ok(config.rewrites.some(rule=>rule.source==='/api/:path*'&&rule.destination==='/api?__draft_path=:path*'));
  for(const path of ['health','lobbies','lobbies/join','lobbies/0123','lobbies/0123/action','lobbies/0123/chat','leagues/12345678-1234-1234-1234-123456789abc','leagues/12345678-1234-1234-1234-123456789abc/hall']){
    const url=apiRequestUrl('/api?__draft_path='+encodeURIComponent(path),'https://draft.example');
    assert.equal(url.pathname,'/api/'+path);
    assert.equal(url.origin,'https://draft.example');
    assert.equal(url.searchParams.has('__draft_path'),false);
  }
});

test('direct development routes and unrelated request query parameters are preserved',()=>{
  const direct=apiRequestUrl('/api/lobbies/0123?view=team','https://draft.example');
  assert.equal(direct.href,'https://draft.example/api/lobbies/0123?view=team');
  const rewritten=apiRequestUrl('/api?__draft_path=lobbies%2F0123&view=team','https://draft.example');
  assert.equal(rewritten.href,direct.href);
});
