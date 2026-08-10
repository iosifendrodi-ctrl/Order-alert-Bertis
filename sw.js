const CACHE='order-alert-v11-4-shared-state';
const ASSETS=['/','/index.html','/manifest.json','/icon-192.png','/icon-512.png','/apple-touch-icon.png'];
const SYNC_KEY='oa_shared_sync_v1';

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

async function transformIndex(response){
  const html=await response.text();
  if(html.includes('OA_SHARED_STATE_PATCH_V1')) return new Response(html,{status:response.status,headers:{'Content-Type':'text/html; charset=utf-8'}});

  let out=html;

  out=out.replace(
    "const state = {\n  salami: 6,\n  sausage: 0,\n  stage: 'difference',",
    "const OA_SHARED_STATE_PATCH_V1=true;\nconst OA_SHARED_KEY='oa_shared_sync_v1';\nfunction OA_sharedLoad(){try{return JSON.parse(localStorage.getItem(OA_SHARED_KEY)||'{}')}catch(_){return {}}}\nconst OA_shared=OA_sharedLoad();\nconst state = {\n  salami: Number.isFinite(Number(OA_shared.salami)) ? Number(OA_shared.salami) : 6,\n  sausage: Number.isFinite(Number(OA_shared.sausage)) ? Number(OA_shared.sausage) : 0,\n  stage: OA_shared.stage || 'difference',"
  );

  out=out.replace(
    "  verified: false,\n  resolved: false,\n  closed: false,\n  ack: false,\n  warehouseAcknowledged: false,",
    "  verified: OA_shared.verified === true,\n  resolved: OA_shared.resolved === true,\n  closed: OA_shared.closed === true,\n  ack: OA_shared.ack === true,\n  warehouseAcknowledged: OA_shared.warehouseAcknowledged === true,"
  );

  const patch=`
<script>
/* OA_SHARED_STATE_PATCH_V1 — vendor-neutral shared demo state */
(function(){
  const KEY='oa_shared_sync_v1';

  function read(){
    try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch(_){return {}}
  }

  function writeWarehouseState(){
    try{
      const role=new URLSearchParams(location.search).get('role') || 'agent';
      if(role!=='warehouse') return;

      const s={
        salami:Number(document.getElementById('salamiInput')?.value ?? 6),
        sausage:Number(document.getElementById('sausageInput')?.value ?? 0),
        stage:document.getElementById('stage')?.value || 'difference',
        verified:!!document.getElementById('warehouseVerificationNotice') &&
          !document.getElementById('warehouseVerificationNotice').classList.contains('hidden'),
        resolved:(document.getElementById('stage')?.value==='resolved'),
        closed:!!document.getElementById('closedPanel') &&
          !document.getElementById('closedPanel').classList.contains('hidden'),
        ack:document.getElementById('ackBtn')?.textContent?.includes('ALERTĂ VĂZUTĂ') || false,
        warehouseAcknowledged:
          document.getElementById('warehouseVerificationStatus')?.textContent?.includes('REVERIFICARE CONFIRMATĂ') || false,
        updatedAt:Date.now()
      };

      localStorage.setItem(KEY,JSON.stringify(s));
    }catch(_){}
  }

  function restoreWarehouseInputs(){
    try{
      const s=read();
      const si=document.getElementById('salamiInput');
      const su=document.getElementById('sausageInput');
      if(si && Number.isFinite(Number(s.salami))) si.value=s.salami;
      if(su && Number.isFinite(Number(s.sausage))) su.value=s.sausage;
    }catch(_){}
  }

  function persistAgentState(){
    try{
      const old=read();
      const stage=document.getElementById('stage')?.value || old.stage || 'difference';
      const verified=
        document.getElementById('verifyBtn')?.textContent?.includes('VERIFICARE SOLICITATĂ') ||
        stage==='verification';
      const resolved=stage==='resolved';
      const closed=!!document.getElementById('closedPanel') &&
        !document.getElementById('closedPanel').classList.contains('hidden');

      localStorage.setItem(KEY,JSON.stringify({
        ...old,
        stage,
        verified,
        resolved,
        closed,
        updatedAt:Date.now()
      }));
    }catch(_){}
  }

  function install(){
    const role=new URLSearchParams(location.search).get('role') || 'agent';

    if(role==='warehouse'){
      restoreWarehouseInputs();

      ['finishPickingBtn','completeAllBtn','warehouseAcknowledgeBtn'].forEach(id=>{
        const e=document.getElementById(id);
        if(e) e.addEventListener('click',()=>setTimeout(writeWarehouseState,50));
      });

      setInterval(writeWarehouseState,500);

    }else if(role==='agent'){
      ['ackBtn','verifyBtn','resolveBtn','closeOrderBtn','stage'].forEach(id=>{
        const e=document.getElementById(id);
        if(e) e.addEventListener('click',()=>setTimeout(persistAgentState,50));
      });
    }
  }

  window.addEventListener('storage',e=>{
    if(e.key!==KEY || !e.newValue) return;

    const role=new URLSearchParams(location.search).get('role') || 'agent';

    if(role==='agent'){
      location.reload();
    }else if(role==='warehouse'){
      restoreWarehouseInputs();
    }
  });

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install);
  else install();
})();
</script>`;

  out=out.replace('</body></html>',patch+'\n</body></html>');

  return new Response(out,{
    status:response.status,
    headers:{
      'Content-Type':'text/html; charset=utf-8',
      'Cache-Control':'no-store'
    }
  });
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;

  const url=new URL(event.request.url);
  const isIndex=url.pathname==='/' || url.pathname==='/index.html';

  event.respondWith((async()=>{
    try{
      const response=await fetch(event.request,{cache:'no-store'});

      if(isIndex && response.ok) return transformIndex(response);

      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      return response;
    }catch(_){
      return caches.match(event.request).then(r=>r||caches.match('/index.html'));
    }
  })());
});
