// R5F: cache apenas de recursos estáticos; NUNCA interceptar chamadas de /api/.
const CACHE = 'varal-r5f-ui-1';
const STATIC = ['./','./index.html','./style.css','./script.js','./icons.js','./manifest.json','./icons/varal-192.png','./icons/varal-512.png'];
self.addEventListener('install',e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC))); self.skipWaiting(); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const req=e.request, url=new URL(req.url);
  if(req.method!=='GET' || url.origin!==self.location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(req,{cache:'no-store'}).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(req,copy));}return r;}).catch(()=>caches.match(req)));
});
