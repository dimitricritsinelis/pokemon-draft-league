import { createService } from '../server/service.mjs';
import { createSupabaseStore } from '../server/supabase-store.mjs';
import { loadEngines } from '../server/engines.mjs';
let service;
export default async function handler(req,res) {
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY){
    res.statusCode=503;res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');
    res.end(JSON.stringify({error:'Online play is not configured yet. Connect Supabase and apply the database migration to enable lobbies, chat, and shared records.',code:'BACKEND_NOT_CONFIGURED'}));return;
  }
  try {
    service ||= createService({store:createSupabaseStore({url:process.env.SUPABASE_URL,serviceRoleKey:process.env.SUPABASE_SERVICE_ROLE_KEY}),engines:loadEngines()});
    const host=req.headers['x-forwarded-host']||req.headers.host||'localhost';
    const protocol=req.headers['x-forwarded-proto']||'https';
    let body;
    if(!['GET','HEAD'].includes(req.method)){
      if(req.body!==undefined)body=typeof req.body==='string'?req.body:JSON.stringify(req.body);
      else{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>20000){res.statusCode=413;res.end(JSON.stringify({error:'This request is too large.',code:'TOO_LARGE'}));return;}chunks.push(chunk);}body=Buffer.concat(chunks).toString();}
    }
    const headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):value);
    const request=new Request(`${protocol}://${host}${req.url}`,{method:req.method,headers,...(body?{body}:{})});
    const response=await service.fetch(request);res.statusCode=response.status;response.headers.forEach((value,key)=>res.setHeader(key,value));res.end(await response.text());
  }catch(error){console.error('API initialization failed:',error?.message);res.statusCode=503;res.setHeader('content-type','application/json');res.end(JSON.stringify({error:'The game server could not connect to its database. Please try again shortly.',code:'SERVER_ERROR'}));}
}
