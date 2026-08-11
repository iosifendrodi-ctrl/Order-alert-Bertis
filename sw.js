const CACHE='order-alert-v11-6-shared-state';
const ASSETS=['/','/index.html','/manifest.json','/icon-192.png','/icon-512.png','/apple-touch-icon.png'];
const SYNC_KEY='oa_shared_sync_v1';
const PATCH='OA_SHARED_STATE_PATCH_V5';

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(ASSETS))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(
        keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))
      ))
      .then(()=>self.clients.claim())
  );
});

async function transformIndex(response){

  const html=await response.text();

  if(html.includes(PATCH)){
    return new Response(html,{
      status:response.status,
      headers:{
        'Content-Type':'text/html; charset=utf-8',
        'Cache-Control':'no-store'
      }
    });
  }

  let out=html;

  /*
   * Shared state bootstrap.
   */
  out=out.replace(
    "const state = {\n  salami: 6,\n  sausage: 0,\n  stage: 'difference',",
    `const ${PATCH}=true;
const OA_SHARED_KEY='${SYNC_KEY}';

function OA_sharedLoad(){
  try{
    return JSON.parse(localStorage.getItem(OA_SHARED_KEY)||'{}');
  }catch(_){
    return {};
  }
}

const OA_shared=OA_sharedLoad();

const state = {
  salami:Number.isFinite(Number(OA_shared.salami))
    ? Number(OA_shared.salami)
    : 6,

  sausage:Number.isFinite(Number(OA_shared.sausage))
    ? Number(OA_shared.sausage)
    : 0,

  stage:OA_shared.stage || 'difference',`
  );

  /*
   * Restore shared flags.
   */
  out=out.replace(
    "  verified: false,\n  resolved: false,\n  closed: false,\n  ack: false,\n  warehouseAcknowledged: false,",
    `  verified:OA_shared.verified === true,
  resolved:OA_shared.resolved === true,
  closed:OA_shared.closed === true,
  ack:OA_shared.ack === true,
  warehouseAcknowledged:OA_shared.warehouseAcknowledged === true,`
  );

  const patch=`
<script>
/* ${PATCH}
   Order Alert v1.9
   Agent cannot request verification.
   Warehouse remains responsible for reverification.
*/
(function(){

  const KEY='${SYNC_KEY}';

  function read(){
    try{
      return JSON.parse(localStorage.getItem(KEY)||'{}');
    }catch(_){
      return {};
    }
  }

  function write(value){
    try{
      localStorage.setItem(
        KEY,
        JSON.stringify({
          ...read(),
          ...value,
          updatedAt:Date.now()
        })
      );
    }catch(_){}
  }

  function visible(id){
    const el=document.getElementById(id);
    return !!el && !el.classList.contains('hidden');
  }

  function role(){

    if(visible('warehouse')) return 'warehouse';
    if(visible('manager')) return 'manager';
    if(visible('history')) return 'history';

    return 'agent';
  }

  /*
   * ============================================================
   * AGENT
   * ============================================================
   *
   * Agentul NU mai poate solicita verificarea.
   */

  function removeAgentVerification(){

    if(role()!=='agent') return;

    const verifyBtn=document.getElementById('verifyBtn');

    if(verifyBtn){
      verifyBtn.remove();
    }

    const stage=document.getElementById('stage');

    if(stage){

      [...stage.options].forEach(option=>{

        if(
          option.value==='verification' ||
          option.textContent.trim()==='Verificare solicitată'
        ){
          option.remove();
        }

      });

      if(stage.value==='verification'){
        stage.value='difference';
      }
    }
  }

  /*
   * Agentul este notificat automat imediat ce există o diferență.
   * Nu mai este nevoie de apăsarea unui buton.
   */
  function notifyWarehouseFromAgent(){

    if(role()!=='agent') return;

    const current=read();

    /*
     * Nu suprascriem o confirmare deja făcută de Depozit.
     */
    if(current.warehouseAcknowledged===true){
      return;
    }

    /*
     * O comandă aflată în diferență înseamnă că Depozitul
     * trebuie reverificat.
     */
    const stage=document.getElementById('stage')?.value || current.stage || 'difference';

    if(stage==='difference' || stage==='picking'){

      write({
        stage:stage,
        verified:true,
        warehouseAcknowledged:false
      });
    }
  }

  /*
   * Mesajul vizibil Agentului.
   */
  function updateAgentMessage(){

    if(role()!=='agent') return;

    const current=read();
    const msg=document.getElementById('agentMsg');

    if(!msg) return;

    if(current.warehouseAcknowledged===true){

      msg.textContent='Depozitul a confirmat reverificarea.';
      msg.style.color='#287a43';
      msg.style.fontWeight='800';

      return;
    }

    if(current.verified===true){

      msg.textContent='Depozitul a fost notificat pentru reverificare.';
      msg.style.color='';
      msg.style.fontWeight='800';

      return;
    }

    /*
     * Dacă există diferență, notificarea se creează automat.
     */
    const stage=document.getElementById('stage')?.value || current.stage;

    if(stage==='difference'){

      write({
        verified:true,
        warehouseAcknowledged:false
      });

      msg.textContent='Depozitul a fost notificat pentru reverificare.';
      msg.style.fontWeight='800';
    }
  }

  /*
   * Păstrăm acțiunile permise Agentului.
   * Nu există verifyBtn.
   */
  function persistAgent(){

    if(role()!=='agent') return;

    const current=read();

    const stage=
      document.getElementById('stage')?.value ||
      current.stage ||
      'difference';

    const safeStage=
      stage==='verification'
        ? 'difference'
        : stage;

    write({

      stage:safeStage,

      /*
       * Agentul nu poate crea verificarea.
       * Dacă verified există deja, provine din fluxul shared.
       */
      verified:current.verified===true,

      resolved:safeStage==='resolved',

      closed:
        !!document.getElementById('closedPanel') &&
        !document.getElementById('closedPanel')
          .classList.contains('hidden')
    });

    removeAgentVerification();
    notifyWarehouseFromAgent();
    updateAgentMessage();
  }

  /*
   * ============================================================
   * WAREHOUSE
   * ============================================================
   */

  function saveWarehouse(){

    if(role()!=='warehouse') return;

    try{

      const current=read();

      const salami=Number(
        document.getElementById('salamiInput')?.value ?? current.salami ?? 6
      );

      const sausage=Number(
        document.getElementById('sausageInput')?.value ?? current.sausage ?? 0
      );

      write({

        salami:Number.isFinite(salami) ? salami : current.salami,

        sausage:Number.isFinite(sausage) ? sausage : current.sausage,

        /*
         * Important:
         * reverification rămâne activă până când Depozitul
         * confirmă explicit.
         */
        verified:current.verified===true,

        warehouseAcknowledged:
          current.warehouseAcknowledged===true
      });

    }catch(_){}
  }

  function restoreWarehouse(){

    if(role()!=='warehouse') return;

    try{

      const current=read();

      const salami=document.getElementById('salamiInput');
      const sausage=document.getElementById('sausageInput');

      if(
        salami &&
        Number.isFinite(Number(current.salami))
      ){
        salami.value=current.salami;
      }

      if(
        sausage &&
        Number.isFinite(Number(current.sausage))
      ){
        sausage.value=current.sausage;
      }

    }catch(_){}
  }

  /*
   * Confirmarea finală a reverificării de către Depozit.
   */
  function warehouseConfirmed(){

    if(role()!=='warehouse') return;

    write({

      verified:true,

      warehouseAcknowledged:true
    });

    /*
     * Reîmprospătăm mesajul în Agent.
     */
    setTimeout(()=>{

      if(role()==='warehouse'){
        saveWarehouse();
      }

    },100);
  }

  /*
   * ============================================================
   * INSTALL
   * ============================================================
   */

  function install(){

    /*
     * Butoane Depozit.
     */
    [
      'finishPickingBtn',
      'completeAllBtn'
    ].forEach(id=>{

      const el=document.getElementById(id);

      if(el){

        el.addEventListener(
          'click',
          ()=>setTimeout(saveWarehouse,100)
        );
      }

    });

    /*
     * Confirmarea reverificării.
     */
    const warehouseAck=
      document.getElementById('warehouseAcknowledgeBtn');

    if(warehouseAck){

      warehouseAck.addEventListener(
        'click',
        ()=>setTimeout(warehouseConfirmed,150)
      );
    }

    /*
     * Acțiuni Agent.
     */
    [
      'ackBtn',
      'resolveBtn',
      'closeOrderBtn',
      'stage'
    ].forEach(id=>{

      const el=document.getElementById(id);

      if(el){

        el.addEventListener(
          'click',
          ()=>setTimeout(persistAgent,100)
        );
      }

    });

    /*
     * Inițializare imediată.
     */
    removeAgentVerification();

    if(role()==='warehouse'){
      restoreWarehouse();
      saveWarehouse();
    }

    if(role()==='agent'){
      persistAgent();
      notifyWarehouseFromAgent();
      updateAgentMessage();
    }

    /*
     * SPA watcher.
     */
    setInterval(()=>{

      const currentRole=role();

      if(currentRole==='agent'){

        removeAgentVerification();
        notifyWarehouseFromAgent();
        updateAgentMessage();

      }

      if(currentRole==='warehouse'){

        restoreWarehouse();

      }

    },500);
  }

  /*
   * ============================================================
   * CROSS-TAB SYNC
   * ============================================================
   */

  window.addEventListener('storage',event=>{

    if(event.key!==KEY){
      return;
    }

    if(role()==='agent'){

      removeAgentVerification();
      updateAgentMessage();

    }

    if(role()==='warehouse'){

      restoreWarehouse();

    }

  });

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
    patch+'\\n</body></html>'
  );

  return new Response(out,{
    status:response.status,
    headers:{
      'Content-Type':'text/html; charset=utf-8',
      'Cache-Control':'no-store'
    }
  });
}

self.addEventListener('fetch',event=>{

  if(event.request.method!=='GET'){
    return;
  }

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
          .then(cache=>{
            cache.put(event.request,copy);
          });

        return response;

      }catch(_){

        return caches.match(event.request)
          .then(
            cached=>
              cached ||
              caches.match('/index.html')
          );
      }

    })()
  );
});
