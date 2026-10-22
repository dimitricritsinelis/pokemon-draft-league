import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve,extname,sep } from 'node:path';
import { createService } from './service.mjs';
import { createSQLiteStore } from './sqlite-store.mjs';
import { createSupabaseStore } from './supabase-store.mjs';
import { loadEngines } from './engines.mjs';
const root=fileURLToPath(new URL('../dist',import.meta.url));
const argIndex=process.argv.indexOf('--port');
const port=Number(argIndex>=0?process.argv[argIndex+1]:process.env.PORT||3000);
const configured=Boolean(process.env.SUPABASE_URL&&(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY));
const store=configured?createSupabaseStore({url:process.env.SUPABASE_URL,secretKey:process.env.SUPABASE_SECRET_KEY,serviceRoleKey:process.env.SUPABASE_SERVICE_ROLE_KEY}):createSQLiteStore(process.env.DRAFT_LOCAL_DB||fileURLToPath(new URL('../.local/draft.sqlite',import.meta.url)));
const service=createService({store,engines:loadEngines()});
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2','.jpg':'image/jpeg','.jpeg':'image/jpeg'};
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,`http://${req.headers.host}`);
    if(url.pathname.startsWith('/api/')){
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>20000){res.writeHead(413,{'content-type':'application/json'});res.end(JSON.stringify({error:'This request is too large.',code:'TOO_LARGE'}));return;}chunks.push(chunk);}
      const response=await service.fetch(new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}));
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
    }
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
    const pathname=decodeURIComponent(url.pathname);const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
    const info=await stat(file);if(!info.isFile())throw new Error('not found');
    res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream','cache-control':'no-cache'});res.end(req.method==='HEAD'?undefined:await readFile(file));
  }catch{res.writeHead(404,{'content-type':'text/plain'});res.end('Not found');}
});
server.listen(port,'0.0.0.0',()=>console.log(`Local: http://localhost:${port}\nPersistence: ${store.kind}${configured?'':' (development only; production requires Supabase)'}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{store.close?.();process.exit(0);}));
