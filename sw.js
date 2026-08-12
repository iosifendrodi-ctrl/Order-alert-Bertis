const CACHE='order-alert-v11-7-shared-state';
const ASSETS=['/','/index.html','/manifest.json','/icon-192.png','/icon-512.png','/apple-touch-icon.png'];
const SYNC_KEY='oa_shared_sync_v1';
const PATCH='OA_SHARED_STATE_PATCH_V9';

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

  
  out=out.replace(
    "const state = {\n  salami: 6,\n  sausage: 0,\n  stage: 'difference',",
    `const ${PATCH}=true;
const OA_SHARED_KEY='${SYNC_KEY}';
function OA_sharedLoad(){try{return JSON.parse(localStorage.getItem(OA_SHARED_KEY)||'{}')}catch(_){return {}}}
const OA_shared=OA_sharedLoad();
const state = {
  salami:Number.isFinite(Number(OA_shared.salami)) ? Number(OA_shared.salami) : 6,
  sausage:Number.isFinite(Number(OA_shared.sausage)) ? Number(OA_shared.sausage) : 0,
  stage:OA_shared.stage || 'difference',`
  );

  out=out.replace(
    "  verified: false,\n  resolved: false,\n  closed: false,\n  ack: false,\n  warehouseAcknowledged: false,",
    `  verified:OA_shared.verified === true,
  resolved:OA_shared.resolved === true,
  closed:OA_shared.closed === true,
  ack:OA_shared.ack === true,
  warehouseAcknowledged:false,`
  );

  const patch=`
<script>

(function(){

  const KEY='${SYNC_KEY}';

  function read(){
    try{return JSON.parse(localStorage.getItem(KEY)||'{}')}
    catch(_){return {}}
  }

  function write(value){
    try{
      localStorage.setItem(
        KEY,
        JSON.stringify({...read(),...value,updatedAt:Date.now()})
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

  function syncIntoState(){
    if(typeof state==='undefined') return;

    const s=read();

    if(Number.isFinite(Number(s.salami))) state.salami=Number(s.salami);
    if(Number.isFinite(Number(s.sausage))) state.sausage=Number(s.sausage);
    if(s.stage) state.stage=s.stage;

    state.verified=s.verified===true;
    state.ack=s.ack===true;
    state.resolved=s.resolved===true;
    state.closed=s.closed===true;
    state.warehouseAcknowledged=false;

    if(s.resolutionReason!==undefined) state.resolutionReason=s.resolutionReason;
    if(s.resolutionNote!==undefined) state.resolutionNote=s.resolutionNote;
    if(s.closedBy!==undefined) state.closedBy=s.closedBy;
    if(s.closeNote!==undefined) state.closeNote=s.closeNote;
  }

  function hideAgentVerificationAndClosure(){
    if(role()!=='agent') return;

    const verifyBtn=document.getElementById('verifyBtn');
    if(verifyBtn) verifyBtn.remove();

    const stage=document.getElementById('stage');
    if(stage){
      [...stage.options].forEach(option=>{
        if(
          option.value==='verification' ||
          option.value==='resolved' ||
          option.textContent.trim()==='Verificare solicitată' ||
          option.textContent.trim()==='Rezolvată'
        ){
          option.remove();
        }
      });
      if(stage.value==='verification' || stage.value==='resolved') stage.value='difference';
    }

    const resolutionPanel=document.getElementById('resolutionPanel');
    if(resolutionPanel) resolutionPanel.classList.add('hidden');

    const closePanel=document.getElementById('closePanel');
    if(closePanel) closePanel.classList.add('hidden');
  }

  function renderAgent(){
    if(role()!=='agent') return;

    syncIntoState();
    hideAgentVerificationAndClosure();

    if(typeof render==='function') render();

    hideAgentVerificationAndClosure();

    const msg=document.getElementById('agentMsg');
    if(!msg) return;

    if(state.closed){
      msg.textContent='Comanda a fost închisă și mutată în Istoric.';
      msg.style.fontWeight='800';
      return;
    }

    if(state.ack){
      msg.textContent='Alerta a fost văzută de agent.';
      msg.style.fontWeight='800';
      return;
    }

    if(state.verified){
      msg.textContent='Depozitul a fost notificat pentru reverificare.';
      msg.style.fontWeight='800';
    }
  }

  function ensureWarehouseControls(){
    if(role()!=='warehouse') return null;

    let panel=document.getElementById('oaWarehouseClosePanel');

    if(!panel){
      panel=document.createElement('div');
      panel.id='oaWarehouseClosePanel';
      panel.className='panel';
      panel.style.marginTop='12px';
      panel.innerHTML=[
        '<h3 style="margin-top:0">Finalizare comandă</h3>',
        '<div id="oaWarehouseCloseStatus" class="muted" style="margin-bottom:8px">Așteaptă ca agentul să vadă alerta.</div>',
        '<select class="select" id="oaWarehouseResolutionReason">',
          '<option>Stoc insuficient</option>',
          '<option>Produs indisponibil</option>',
          '<option>Eroare picking</option>',
          '<option>Produs deteriorat</option>',
          '<option>Înlocuire produs</option>',
          '<option>Eroare scanare</option>',
          '<option>Alt motiv</option>',
        '</select>',
        '<input class="select" id="oaWarehouseResolutionNote" style="margin-top:8px" placeholder="Observații / rezoluție">',
        '<input class="select" id="oaWarehouseClosedBy" style="margin-top:8px" value="Depozit" placeholder="Închisă de">',
        '<button class="btn redbtn" id="oaWarehouseCloseBtn" type="button" disabled>ÎNCHIDE COMANDA</button>'
      ].join('');

      const msg=document.getElementById('warehouseMsg');
      if(msg && msg.parentNode) msg.parentNode.appendChild(panel);
      else {
        const warehouse=document.getElementById('warehouse');
        if(warehouse) warehouse.appendChild(panel);
      }

      const btn=document.getElementById('oaWarehouseCloseBtn');
      if(btn){
        btn.addEventListener('click',warehouseCloseOrder);
      }
    }

    return panel;
  }

  function renderWarehouse(){
    if(role()!=='warehouse') return;

    syncIntoState();

    const oldNotice=document.getElementById('warehouseVerificationNotice');
    if(oldNotice) oldNotice.classList.add('hidden');

    const oldAck=document.getElementById('warehouseAcknowledgeBtn');
    if(oldAck) oldAck.remove();

    const panel=ensureWarehouseControls();
    const status=document.getElementById('oaWarehouseCloseStatus');
    const btn=document.getElementById('oaWarehouseCloseBtn');

    if(panel && status && btn){
      if(state.closed){
        status.textContent='Comanda este închisă.';
        btn.disabled=true;
        btn.textContent='✓ COMANDĂ ÎNCHISĂ';
      }else if(state.ack){
        status.textContent='Agentul a văzut alerta. Depozitul poate închide comanda.';
        btn.disabled=false;
        btn.textContent='ÎNCHIDE COMANDA';
      }else if(state.verified){
        status.textContent='Depozitul a fost notificat. Așteaptă ca agentul să vadă alerta.';
        btn.disabled=true;
        btn.textContent='AȘTEAPTĂ AGENTUL';
      }else{
        status.textContent='Nu există încă o diferență notificată.';
        btn.disabled=true;
        btn.textContent='ÎNCHIDE COMANDA';
      }
    }

    const warehouseMsg=document.getElementById('warehouseMsg');
    if(warehouseMsg){
      if(state.closed){
        warehouseMsg.textContent='Comanda a fost închisă.';
      }else if(state.ack){
        warehouseMsg.textContent='Agentul a văzut alerta. Depozitul poate închide comanda.';
      }else if(state.verified){
        warehouseMsg.textContent='Agentul a fost notificat. Așteaptă ca agentul să vadă alerta.';
      }
    }
  }

  function persistWarehousePicking(){
    if(role()!=='warehouse') return;

    const salami=Number(document.getElementById('salamiInput')?.value ?? state.salami ?? 6);
    const sausage=Number(document.getElementById('sausageInput')?.value ?? state.sausage ?? 0);

    if(!Number.isFinite(salami) || !Number.isFinite(sausage)) return;

    const diff=salami<10 || sausage<6;
    const old=read();

    write({
      salami,
      sausage,
      stage:diff?'difference':'resolved',
      verified:diff,
      ack:diff ? false : old.ack===true,
      resolved:false,
      closed:false
    });

    syncIntoState();
    renderWarehouse();
  }

  function persistAgentAck(){
    if(role()!=='agent') return;

    setTimeout(()=>{
      syncIntoState();
      if(!state.verified || state.closed) return;

      state.ack=true;
      write({
        ack:true,
        verified:true
      });

      renderAgent();
    },80);
  }

  function warehouseCloseOrder(){
    if(role()!=='warehouse') return;

    syncIntoState();

    if(!state.verified || !state.ack || state.closed) return;

    const reason=document.getElementById('oaWarehouseResolutionReason')?.value || 'Stoc insuficient';
    const note=document.getElementById('oaWarehouseResolutionNote')?.value.trim() || '';
    const closedBy=document.getElementById('oaWarehouseClosedBy')?.value.trim() || 'Depozit';

    
    const originalReason=document.getElementById('resolutionReason');
    const originalNote=document.getElementById('resolutionNote');
    const originalClosedBy=document.getElementById('closedBy');
    const originalCloseNote=document.getElementById('closeNote');

    if(originalReason) originalReason.value=reason;
    if(originalNote) originalNote.value=note;
    if(originalClosedBy) originalClosedBy.value=closedBy;
    if(originalCloseNote) originalCloseNote.value=note;

    state.verified=true;
    state.resolved=false;

    if(typeof resolveVerification==='function'){
      resolveVerification();
    }else{
      state.resolved=true;
      state.resolutionReason=reason;
      state.resolutionNote=note;
      state.stage='resolved';
    }

    if(!state.resolved) return;

    if(typeof closeOrder==='function'){
      closeOrder();
    }else{
      state.closed=true;
      state.closedBy=closedBy;
      state.closeNote=note;
      state.stage='closed';
    }

    write({
      salami:state.salami,
      sausage:state.sausage,
      stage:state.closed?'closed':'resolved',
      verified:true,
      ack:true,
      resolved:state.resolved===true,
      closed:state.closed===true,
      resolutionReason:state.resolutionReason,
      resolutionNote:state.resolutionNote,
      closedBy:state.closedBy,
      closeNote:state.closeNote
    });

    renderWarehouse();
  }

  function install(){

    const ackBtn=document.getElementById('ackBtn');
    if(ackBtn) ackBtn.addEventListener('click',persistAgentAck);

    ['finishPickingBtn','completeAllBtn'].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.addEventListener('click',()=>setTimeout(persistWarehousePicking,120));
    });

    
    const oldAck=document.getElementById('warehouseAcknowledgeBtn');
    if(oldAck) oldAck.remove();

    if(role()==='agent') renderAgent();
    if(role()==='warehouse') renderWarehouse();

    setInterval(()=>{
      if(role()==='agent') renderAgent();
      if(role()==='warehouse') renderWarehouse();
    },500);
  }

  window.addEventListener('storage',event=>{
    if(event.key!==KEY) return;
    if(role()==='agent') renderAgent();
    if(role()==='warehouse') renderWarehouse();
  });

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',install);
  }else{
    install();
  }

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

      if(isIndex && response.ok){
        return transformIndex(response);
      }

      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      return response;

    }catch(_){
      return caches.match(event.request).then(
        cached=>cached || caches.match('/index.html')
      );
    }
  })());
});
