import { fallback } from './fallback.mjs';
const upstream = 'https://raw.githubusercontent.com/hectorcflores/aura-app/main/app/';
const types = {'index.html':'text/html; charset=utf-8','trailer-player.js':'text/javascript; charset=utf-8','favicon.svg':'image/svg+xml','imdb-logo.svg':'image/svg+xml','data/cartelera.json':'application/json; charset=utf-8'};
export default {
 async fetch(request, env, ctx) {
  if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405});
  const url=new URL(request.url);
  let path=url.pathname.replace(/^\/(?:app\/)?/,'');
  if(path===''||path==='app')path='index.html';
  if(!Object.hasOwn(types,path))return new Response('Not found',{status:404});
  const key=new Request(url.origin+'/'+path);
  const cache=globalThis.caches?.default;
  const saved=await cache?.match(key);
  let body,source='github';
  if(saved&&Date.now()-Number(saved.headers.get('x-aura-fetched-at'))<60000){body=await saved.text();source='cache';}
  else {
   try {
    const response=await fetch(upstream+path,{signal:AbortSignal.timeout(5000),headers:{'Accept':'*/*'}});
    if(!response.ok)throw Error('upstream '+response.status);
    body=await response.text();
    if(path.endsWith('.json')){const d=JSON.parse(body);if(!d.generadoEn||!d.peliculas||!d.funciones?.length)throw Error('Invalid cartelera');}
    if(!body.trim())throw Error('Empty upstream');
    if(cache)ctx.waitUntil(cache.put(key,new Response(body,{headers:{'Content-Type':types[path],'Cache-Control':'public, max-age=86400','x-aura-fetched-at':String(Date.now())}})));
   } catch {
    body=saved?await saved.text():fallback[path];source=saved?'stale-cache':'bundled-fallback';
   }
  }
  return new Response(request.method==='HEAD'?null:body,{headers:{'Content-Type':types[path],'Cache-Control':'no-cache','X-Aura-Source':source,'Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff'}});
 }
};
