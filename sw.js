const CACHE='order-alert-v11-6-shared-state';
const ASSETS=['/','/index.html','/manifest.json','/icon-192.png','/icon-512.png','/apple-touch-icon.png'];
const SYNC_KEY='oa_shared_sync_v1';

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

async function transformIndex(response){
  const html=await response.text();

  if(html.includes('OA_SHARED_STATE_PATCH_V4')){
    return new Response(html,{
      status:response.status,
      headers:{
        'Content-Type':'text/html; charset=utf-8',
        'Cache-Control':'no-store'
      }
    });
  }

  let out=html;

  out=out.replace(
    "const state = {\n  salami: 6,\n  sausage: 0,\n  stage: 'difference',",
    "const OA_SHARED_STATE_PATCH_V4=true;\nconst OA_SHARED_KEY='oa_shared_sync_v1';\nfunction OA_sharedLoad(){try{return JSON.parse(localStorage.getItem(OA_SHARED_KEY)||'{}')}catch(_){return {}}}\nconst OA_shared=OA_sharedLoad();\nconst state = {\n  salami: Number.isFinite(Number(OA_shared.salami)) ? Number(OA_shared.salami) : 6,\n  sausage: Number.isFinite(Number(OA_shared.sausage)) ? Number(OA_shared.sausage) : 0,\n  stage: OA_shared.stage || 'difference',"
  );

  out=out.replace(
    "  verified: false,\n  resolved: false,\n  closed: false,\n  ack: false,\n  warehouseAcknowledged: false,",
    "  verified: OA_shared.verified === true,\n  resolved: OA_shared.resolved === true,\n  closed: OA_shared.closed === true,\n  ack: OA_shared.ack === true,\n  warehouseAcknowledged: OA_shared.warehouseAcknowledged === true,"
  );

  const patch=`
<script>
/* OA_SHARED_STATE_PATCH_V4 — Agent cannot request verification; Warehouse retains reverification confirmation */
(function(){
  const KEY='oa_shared_sync_v1';

  function read(){
    try{
      return JSON.parse(localStorage.getItem(KEY)||'{}')
    }catch(_){
      return {}
    }
  }

  function sectionVisible(id){
    const e=document.getElementById(id);
    return !!e && !e.classList.contains('hidden');
  }

  function currentRole(){
    if(sectionVisible('warehouse')) return 'warehouse';
    if(sectionVisible('manager')) return 'manager';
    if(sectionVisible('history')) return 'history';
    return 'agent';
  }

  function writeWarehouseState(){
    if(currentRole()!=='warehouse') return;

    try{
      const s={
        salami:Number(document.getElementById('salamiInput')?.value ?? 6),
        sausage:Number(document.getElementById('sausageInput')?.value ?? 0),
        stage:document.getElementById('stage')?.value || 'difference',

        verified:
          !!document.getElementById('warehouseVerificationNotice') &&
          !document.getElementById('warehouseVerificationNotice')
            .classList.contains('hidden'),

        resolved:
          document.getElementById('stage')?.value==='resolved',

        closed:
          !!document.getElementById('closedPanel') &&
          !document.getElementById('closedPanel')
            .classList.contains('hidden'),

        ack:
          document.getElementById('ackBtn')
            ?.textContent
            ?.includes('ALERTĂ VĂZUTĂ') || false,

        warehouseAcknowledged:
          read().warehouseAcknowledged === true,

        updatedAt:Date.now()
      };

      localStorage.setItem(
        KEY,
        JSON.stringify({...read(),...s})
      );
    }catch(_){}
  }

  function restoreWarehouseInputs(){
    try{
      const s=read();

      const si=document.getElementById('salamiInput');
      const su=document.getElementById('sausageInput');

      if(si && Number.isFinite(Number(s.salami))){
        si.value=s.salami;
      }

      if(su && Number.isFinite(Number(s.sausage))){
        su.value=s.sausage;
      }
    }catch(_){}
  }

  function syncAgentVerificationStatus(){
    if(currentRole()!=='agent') return;

    try{
      const s=read();
      const msg=document.getElementById('agentMsg');

      if(!msg) return;

      if(s.warehouseAcknowledged===true){

        msg.textContent='Depozitul a confirmat reverificarea.';
        msg.style.color='#287a43';
        msg.style.fontWeight='800';

      }else if(s.verified===true){

        msg.textContent='Depozitul a fost notificat pentru reverificare.';
        msg.style.color='';
        msg.style.fontWeight='';
      }

    }catch(_){}
  }

  function enforceAgentNoVerification(){
    if(currentRole()!=='agent') return;

    /*
      Agentul NU mai poate solicita verificarea depozitului.
      Dacă butonul există în HTML, îl eliminăm.
    */
    const verifyBtn=document.getElementById('verifyBtn');

    if(verifyBtn){
      verifyBtn.remove();
    }

    /*
      Dacă există opțiunea "verification" în selectorul de etapă,
      ea este eliminată numai pentru Agent.
    */
    const stage=document.getElementById('stage');

    if(stage){

      [...stage.options].forEach(option=>{
        if(option.value==='verification'){
          option.remove();
        }
      });

      if(stage.value==='verification'){
        stage.value='difference';
      }
    }
  }

  function persistAgentState(){
    if(currentRole()!=='agent') return;

    try{
      const old=read();

      const stage=
        document.getElementById('stage')?.value ||
        old.stage ||
        'difference';

      /*
        Agentul nu poate introduce starea verification.
      */
      const safeStage=
        stage==='verification'
          ? 'difference'
          : stage;

      localStorage.setItem(
        KEY,
        JSON.stringify({
          ...old,

          stage:safeStage,

          /*
            Agentul nu poate crea o nouă solicitare de verificare.
            Valoarea existentă este păstrată pentru starea
            provenită de la Depozit.
          */
          verified:old.verified===true,

          resolved:
            safeStage==='resolved',

          closed:
            !!document.getElementById('closedPanel') &&
            !document.getElementById('closedPanel')
              .classList.contains('hidden'),

          updatedAt:Date.now()
        })
      );

    }catch(_){}
  }

  function install(){

    /*
      Acțiuni care aparțin Depozitului.
      Nu le modificăm.
    */
    [
      'finishPickingBtn',
      'completeAllBtn',
      'warehouseAcknowledgeBtn'
    ].forEach(id=>{

      const e=document.getElementById(id);

      if(e){
        e.addEventListener(
          'click',
          ()=>setTimeout(writeWarehouseState,80)
        );
      }

    });

    /*
      Confirmarea reverificării de către Depozit.
    */
    const warehouseAck=
      document.getElementById('warehouseAcknowledgeBtn');

    if(warehouseAck){

      warehouseAck.addEventListener(
        'click',
        ()=>{

          setTimeout(()=>{

            try{

              const old=read();

              localStorage.setItem(
                KEY,
                JSON.stringify({
                  ...old,

                  warehouseAcknowledged:true,

                  verified:true,

                  updatedAt:Date.now()
                })
              );

            }catch(_){}

          },120);

        }
      );
    }

    /*
      Acțiuni permise Agentului.
      verifyBtn este intenționat absent.
    */
    [
      'ackBtn',
      'resolveBtn',
      'closeOrderBtn',
      'stage'
    ].forEach(id=>{

      const e=document.getElementById(id);

      if(e){
        e.addEventListener(
          'click',
          ()=>setTimeout(persistAgentState,80)
        );
      }

    });

    enforceAgentNoVerification();

    restoreWarehouseInputs();

    syncAgentVerificationStatus();

    /*
      SPA synchronization.
    */
    setInterval(()=>{

      if(currentRole()==='warehouse'){

        restoreWarehouseInputs();
        writeWarehouseState();

      }else if(currentRole()==='agent'){

        enforceAgentNoVerification();

        persistAgentState();

        syncAgentVerificationStatus();

      }

    },300);
  }

  /*
    Sincronizare între taburi / roluri.
  */
  window.addEventListener(
    'storage',
    e=>{

      if(e.key!==KEY || !e.newValue) return;

      if(currentRole()==='agent'){

        enforceAgentNoVerification();

        syncAgentVerificationStatus();

        location.reload();

      }else if(currentRole()==='warehouse'){

        restoreWarehouseInputs();

      }

    }
  );

  if(document.readyState==='loading'){

    document.addEventListener(
      'DOMContentLoaded',
      install
    );

  }else{

    install();

  }

})();
</script>`;

  out=out.replace(
    '</body></html>',
    patch+'\n</body></html>'
  );

  return new Response(
    out,
    {
      status:response.status,
      headers:{
        'Content-Type':'text/html; charset=utf-8',
        'Cache-Control':'no-store'
      }
    }
  );
}

self.addEventListener('fetch',event=>{

  if(event.request.method!=='GET') return;

  const url=new URL(event.request.url);

  const isIndex=
    url.pathname==='/' ||
    url.pathname==='/index.html';

  event.respondWith(
    (async()=>{

      try{

        const response=
          await fetch(
            event.request,
            {cache:'no-store'}
          );

        if(isIndex && response.ok){

          return transformIndex(response);

        }

        const copy=response.clone();

        caches.open(CACHE)
          .then(
            cache=>cache.put(
              event.request,
              copy
            )
          );

        return response;

      }catch(_){

        return caches.match(event.request)
          .then(
            r=>r || caches.match('/index.html')
          );

      }

    })()
  );
});
