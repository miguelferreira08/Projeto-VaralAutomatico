// R5G online: so recursos estaticos locais; NUNCA respostas do Firebase/API.
const CACHE='varal-r5g-cloud-1';
const STATIC=['./','./index.html','./style.css','./icons.js','./online.js','./firebase.js','./manifest.json','./icons/varal-192.png','./icons/varal-512.png','./img/logo-site.png','./img/logo-app.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(e.request.method!=='GET'||u.origin!==self.location.origin)return;
 e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{
  if(r.ok){const c=r.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c));}return r;
 }).catch(()=>caches.match(e.request)));
});
