const CACHE='order-alert-v11-8-coherent-flow';
const ASSETS=['/','/index.html','/manifest.json','/icon-192.png','/icon-512.png','/apple-touch-icon.png'];
const KEY='oa_shared_sync_v1';
const PATCH='OA_SHARED_COHERENT_FLOW_V1';

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

async function transformIndex(response){
  const html=await response.text();
  if(html.includes(PATCH)){
    return new Response(html,{status:response.status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
  }
  const patch=`
<script>
(function(){
  const KEY='${KEY}';
  const PATCH='${PATCH}';
  function read(){
    try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch(_){return {}}
  }
  function write(v){
    try{localStorage.setItem(KEY,JSON.stringify({...read(),...v,updatedAt:Date.now()}))}catch(_){}
  }
  function shown(id){
    const e=document.getElementById(id);
    return !!e&&!e.classList.contains('hidden');
  }
  function role(){
    if(shown('warehouse')) return 'warehouse';
    if(shown('manager')) return 'manager';
    if(shown('history')) return 'history';
    return 'agent';
  }
  function sync(){
    if(typeof state==='undefined') return;
    const s=read();
    if(Number.isFinite(Number(s.salami))) state.salami=Number(s.salami);
    if(Number.isFinite(Number(s.sausage))) state.sausage=Number(s.sausage);
    if(typeof s.stage==='string') state.stage=s.stage;
    state.verified=s.verified===true;
    state.ack=s.ack===true;
    state.resolved=s.resolved===true;
    state.closed=s.closed===true;
  }
  function hideAgentControls(){
    if(role()!=='agent') return;
    ['verifyBtn','resolveBtn','closeOrderBtn'].forEach(id=>{
      const e=document.getElementById(id);
      if(e) e.classList.add('hidden');
    });
    const stage=document.getElementById('stage');
    if(stage){
      [...stage.options].forEach(o=>{
        if(o.value==='verification'||o.value==='resolved'||o.textContent.trim()==='Verificare solicitată'||o.textContent.trim()==='Rezolvată') o.remove();
      });
      stage.value='difference';
      stage.disabled=state.closed;
    }
  }
  function renderAgent(){
    if(role()!=='agent') return;
    sync();
    if(state.stage==='difference'&&!state.closed&&!state.verified){
      state.verified=true;
      state.ack=false;
      write({stage:'difference',verified:true,ack:false,resolved:false,closed:false});
    }
    hideAgentControls();
    if(typeof render==='function') render();
    hideAgentControls();
    const msg=document.getElementById('agentMsg');
    if(!msg) return;
    if(state.closed){
      msg.textContent='Comanda a fost închisă și mutată în Istoric.';
    }else if(state.ack){
      msg.textContent='Alerta a fost confirmată de agent.';
    }else if(state.verified){
      msg.textContent='Depozitul a fost notificat pentru reverificare.';
    }
    msg.style.fontWeight='800';
  }
  function hideWarehouseVerification(){
    if(role()!=='warehouse') return;
    const notice=document.getElementById('warehouseVerificationNotice');
    if(notice) notice.classList.add('hidden');
    const ack=document.getElementById('warehouseAcknowledgeBtn');
    if(ack) ack.remove();
  }
  function warehousePanel(){
    if(role()!=='warehouse') return null;
    let p=document.getElementById('oaWarehouseFlow');
    if(!p){
      p=document.createElement('div');
      p.id='oaWarehouseFlow';
      p.className='panel';
      p.innerHTML='<h2>Stare comandă</h2><div id="oaWarehouseFlowMsg" class="muted"></div><input id="oaWarehouseReason" class="select" style="margin-top:8px" value="Stoc insuficient" placeholder="Motiv rezolvare"><input id="oaWarehouseNote" class="select" style="margin-top:8px" placeholder="Observații"><input id="oaWarehouseClosedBy" class="select" style="margin-top:8px" value="Depozit" placeholder="Închisă de"><button id="oaWarehouseClose" class="btn redbtn" type="button">ÎNCHIDE COMANDA</button>';
      const w=document.getElementById('warehouse');
      if(w) w.appendChild(p);
      const b=document.getElementById('oaWarehouseClose');
      if(b) b.addEventListener('click',closeFromWarehouse);
    }
    return p;
  }
  function renderWarehouse(){
    if(role()!=='warehouse') return;
    sync();
    hideWarehouseVerification();
    const finish=document.getElementById('finishPickingBtn');
    const complete=document.getElementById('completeAllBtn');
    if(finish) finish.disabled=state.closed;
    if(complete) complete.disabled=state.closed;
    const p=warehousePanel();
    const msg=document.getElementById('oaWarehouseFlowMsg');
    const b=document.getElementById('oaWarehouseClose');
    if(!p||!msg||!b) return;
    if(state.closed){
      msg.textContent='Comanda este închisă.';
      b.disabled=true;
    }else if(state.verified&&!state.ack){
      msg.textContent='Depozitul a fost notificat. Așteaptă ca agentul să vadă alerta.';
      b.disabled=true;
    }else if(state.verified&&state.ack){
      msg.textContent='Agentul a văzut alerta. Depozitul poate închide comanda.';
      b.disabled=false;
    }else{
      msg.textContent='Așteaptă finalizarea picking-ului.';
      b.disabled=true;
    }
  }
  function warehouseFinish(){
    if(role()!=='warehouse'||typeof state==='undefined'||state.closed) return;
    const salami=Math.max(0,Math.min(10,Number(document.getElementById('salamiInput')?.value)||0));
    const sausage=Math.max(0,Math.min(6,Number(document.getElementById('sausageInput')?.value)||0));
    const difference=salami!==10||sausage!==6;
    state.salami=salami;
    state.sausage=sausage;
    state.stage=difference?'difference':'resolved';
    state.verified=difference;
    state.ack=false;
    state.resolved=false;
    state.closed=false;
    write({salami,sausage,stage:state.stage,verified:difference,ack:false,resolved:false,closed:false});
    if(typeof render==='function') render();
    renderWarehouse();
  }
  function agentAck(){
    if(role()!=='agent'||typeof state==='undefined'||state.closed||!state.verified) return;
    state.ack=true;
    write({ack:true,verified:true});
    const msg=document.getElementById('agentMsg');
    if(msg) msg.textContent='Alerta a fost confirmată de agent.';
    if(typeof addEvent==='function') addEvent('Agent a văzut alerta');
    if(typeof render==='function') render();
    hideAgentControls();
  }
  function closeFromWarehouse(){
    if(role()!=='warehouse'||typeof state==='undefined') return;
    sync();
    if(state.closed||!state.verified||!state.ack) return;
    const reason=document.getElementById('oaWarehouseReason')?.value.trim()||'Stoc insuficient';
    const note=document.getElementById('oaWarehouseNote')?.value.trim()||'';
    const closedBy=document.getElementById('oaWarehouseClosedBy')?.value.trim()||'Depozit';
    const rr=document.getElementById('resolutionReason');
    const rn=document.getElementById('resolutionNote');
    const cb=document.getElementById('closedBy');
    const cn=document.getElementById('closeNote');
    if(rr) rr.value=reason;
    if(rn) rn.value=note;
    if(cb) cb.value=closedBy;
    if(cn) cn.value=note;
    if(typeof resolveVerification==='function') resolveVerification();
    if(typeof state!=='undefined'&&!state.resolved) return;
    if(typeof closeOrder==='function') closeOrder();
    sync();
    write({
      salami:state.salami,
      sausage:state.sausage,
      stage:state.stage,
      verified:state.verified===true,
      ack:state.ack===true,
      resolved:state.resolved===true,
      closed:state.closed===true,
      resolutionReason:state.resolutionReason,
      resolutionNote:state.resolutionNote,
      closedBy:state.closedBy,
      closeNote:state.closeNote
    });
    renderWarehouse();
  }
  function intercept(id,fn){
    const e=document.getElementById(id);
    if(!e||e.dataset[PATCH]) return;
    e.dataset[PATCH]='1';
    e.addEventListener('click',ev=>{
      ev.preventDefault();
      ev.stopImmediatePropagation();
      fn();
    },true);
  }
  function install(){
    intercept('finishPickingBtn',warehouseFinish);
    intercept('completeAllBtn',function(){
      if(role()!=='warehouse'||typeof state==='undefined'||state.closed) return;
      const a=document.getElementById('salamiInput');
      const b=document.getElementById('sausageInput');
      if(a) a.value='10';
      if(b) b.value='6';
      warehouseFinish();
    });
    intercept('ackBtn',agentAck);
    const old=document.getElementById('warehouseAcknowledgeBtn');
    if(old) old.remove();
    renderAgent();
    renderWarehouse();
    setInterval(()=>{
      if(role()==='agent') renderAgent();
      if(role()==='warehouse') renderWarehouse();
    },300);
  }
  window.addEventListener('storage',e=>{
    if(e.key!==KEY) return;
    if(role()==='agent') renderAgent();
    if(role()==='warehouse') renderWarehouse();
  });
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install); else install();
})();
</script>`;
  const out=html.replace('</body></html>',patch+'\\n</body></html>');
  return new Response(out,{status:response.status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  const isIndex=url.pathname==='/'||url.pathname==='/index.html';
  event.respondWith((async()=>{
    try{
      const response=await fetch(event.request,{cache:'no-store'});
      if(isIndex&&response.ok) return transformIndex(response);
      const copy=response.clone();
      caches.open(CACHE).then(c=>c.put(event.request,copy));
      return response;
    }catch(_){
      return caches.match(event.request).then(r=>r||caches.match('/index.html'));
    }
  })());
});
