const CACHE='a1a24-course-20261014-v1';
const ASSETS=['./','./index.html','./styles.css','./app.js','./engine.mjs','./course-data.js','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('a1a24-course-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin||new URL(request.url).pathname.endsWith('.pdf'))return;
  event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{});}return response;}).catch(async()=>{const saved=await caches.match(request);if(saved)return saved;if(request.mode==='navigate')return caches.match('./index.html');return new Response('离线时未缓存此资源',{status:503});}));
});
