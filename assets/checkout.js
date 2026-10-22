(()=>{'use strict';
const API='https://gabilangames-pix.atilar55.workers.dev';
const RECOVERY_API='https://streamdock-license-recovery.atilar55.workers.dev';
async function recoverLicenseEmail(email){const r=await fetch(RECOVERY_API+'/licenca/recuperar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}
const $=id=>document.getElementById(id);
const storeKey='gabilangames_pix_pedido_v2';
const LEGACY_KEY='gabilangames_pix_pedido_v1';
const KEEP_MS=30*60*1000;
const SUCCESS_MS=10*60*1000;
// Guarda apenas a referencia ao pedido para conciliar pagamentos tardios.
// QR Code so pode ser retomado durante os primeiros 30 minutos.
const RECORD_MS=70*60*1000;
let successDeadline=0,successTimer=null;
let clockTimer=null;
let order=null,busy=false,pollTimer=null;
let savedOrder=null;
const start=$('pix-start-btn');
const modal=$('pix-modal');
const opener=$('pix-open-checkout');
let focusBeforeModal=null;
function openModal(){focusBeforeModal=document.activeElement;modal.hidden=false;modal.setAttribute('aria-hidden','false');document.body.classList.add('pix-modal-open');$('pix-modal-close').focus();if(savedOrder){resumeSaved();}else if(order&&!$('pix-success-screen').hidden&&Date.now()<successDeadline){return;}else if(order){newPurchase();}}
function closeModal(){modal.hidden=true;modal.setAttribute('aria-hidden','true');document.body.classList.remove('pix-modal-open');if(focusBeforeModal&&typeof focusBeforeModal.focus==='function')focusBeforeModal.focus();}
opener.addEventListener('click',e=>{e.preventDefault();openModal()});
$('pix-price-open').addEventListener('click',()=>opener.click());
$('pix-modal-close').addEventListener('click',closeModal);
modal.querySelector('.pix-modal-backdrop').addEventListener('click',closeModal);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)closeModal();if(e.key==='Tab'&&!modal.hidden){const els=[...modal.querySelectorAll('button:not([disabled]):not([hidden]),input:not([disabled]):not([hidden]),textarea:not([disabled]):not([hidden])')].filter(x=>x.getClientRects().length);if(!els.length)return;const first=els[0],last=els[els.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
function status(msg,stage){$('pix-status').textContent=msg;if(stage)$('pix-stage').textContent=stage;const loading=!$('pix-qr-loading').hidden;const initial=!$('pix-start').hidden;const quiet=initial&&/^(Informe o e-mail|Pronto para começar|Clique em iniciar)/i.test(msg);$('pix-status').hidden=quiet||loading;$('pix-stage').hidden=quiet||loading;}
function setBusy(value){busy=value;[start,$('pix-check'),$('pix-cancel')].forEach(e=>{e.disabled=value});}
async function api(path,body){const ctrl=new AbortController(),t=setTimeout(()=>ctrl.abort(),15000);try{const response=await fetch(API+path,{method:'POST',mode:'cors',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:ctrl.signal,credentials:'omit'});let data;try{data=await response.json()}catch{throw new Error('Resposta inválida do servidor.')}if(!response.ok||data.success!==true)throw new Error(data.erro||`Erro HTTP ${response.status}`);return data;}finally{clearTimeout(t)}}
function normalizeEmail(value){return String(value||'').trim().toLowerCase();}
function validSaved(o){return o&&typeof o.id==='string'&&/^[a-f0-9-]{36}$/i.test(o.id)&&/^[a-f0-9]{64}$/i.test(o.acesso)&&typeof o.email==='string'&&Number.isFinite(o.startedAt)&&o.startedAt>Date.now()-RECORD_MS&&o.startedAt<=Date.now()+60000;}
function clearSaved(){savedOrder=null;try{localStorage.removeItem(storeKey);sessionStorage.removeItem(LEGACY_KEY)}catch{}}
function save(o){order=o;savedOrder=o;try{localStorage.setItem(storeKey,JSON.stringify(o))}catch{} updateResume();}
function restore(){try{sessionStorage.removeItem(LEGACY_KEY);const s=JSON.parse(localStorage.getItem(storeKey));if(validSaved(s))savedOrder=s;else clearSaved()}catch{clearSaved()}}
function remain(){return order&&Number.isFinite(order.startedAt)?Math.max(0,KEEP_MS-(Date.now()-order.startedAt)):0;}
function clockText(ms){const n=Math.ceil(ms/1000);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
function stopClock(){if(clockTimer){clearInterval(clockTimer);clockTimer=null;}}
function tickClock(){const left=remain();$('pix-countdown').textContent=clockText(left);if(left<=0){stopClock();stopPoll();$('pix-details').hidden=true;$('pix-timer-box').hidden=false;$('pix-cancel').hidden=false;$('pix-check').hidden=true;status('O prazo de 30 minutos para retomar este Pix terminou. Gere outro pedido.','Prazo encerrado');$('pix-new-purchase').textContent='Gerar outro Pix';}}
function startClock(){stopClock();if(!order||!Number.isFinite(order.startedAt))return;$('pix-timer-box').hidden=false;tickClock();if(remain()>0)clockTimer=setInterval(tickClock,1000);}
function identity(){return {id:order.id,acesso:order.acesso}}
function showOrder(){if(!order)return;hideSuccess();$('pix-modal-title').textContent='Pague com Pix';$('pix-modal-intro').textContent='Escaneie o QR Code ou copie o código Pix para pagar R$ 9,99.';$('pix-start').hidden=true;$('pix-order').hidden=false;$('pix-details').hidden=true;$('pix-check').hidden=false;$('pix-cancel').hidden=false;$('pix-new-purchase').textContent='Trocar e-mail';$('pix-timer-box').hidden=true;$('pix-qr-loading').hidden=false;$('pix-check').hidden=true;}
function hideSuccess(){
  if(successTimer){clearTimeout(successTimer);successTimer=null;}
  successDeadline=0;
  $('pix-success-screen').hidden=true;
  $('pix-modal').classList.remove('pix-is-complete');
  $('pix-modal-title').hidden=false;
  $('pix-modal-intro').hidden=false;
  $('pix-modal').querySelector('.pix-modal-top .tag').hidden=false;
  $('pix-modal').querySelector('.checkout-box').hidden=false;
}
function parsePaidAt(value){
  if(typeof value!=='string')return NaN;
  // D1 CURRENT_TIMESTAMP: UTC sem sufixo de fuso.
  const t=Date.parse(value.includes('T')?value:(value.replace(' ','T')+'Z'));
  return Number.isFinite(t)?t:NaN;
}
function showSuccess(license,paidAt){
  stopPoll();stopClock();
  const when=parsePaidAt(paidAt);
  // Nunca retomar uma confirmacao cuja janela de dez minutos ja encerrou.
  if(!Number.isFinite(when)||Date.now()-when>=SUCCESS_MS||when>Date.now()+60000){
    clearSaved();order=null;newPurchase();
    status('Pagamento confirmado. Para consultar a chave, use Recuperar licença pelo e-mail da compra.','Pagamento confirmado');
    return;
  }
  successDeadline=when+SUCCESS_MS;
  if(successTimer)clearTimeout(successTimer);
  successTimer=setTimeout(()=>{if(Date.now()>=successDeadline){clearSaved();order=null;newPurchase();status('A tela de confirmação expirou. Recupere a licença pelo e-mail informado na compra.','Licença por e-mail');}},Math.max(1,successDeadline-Date.now()+100));
  $('pix-modal').querySelector('.checkout-box').hidden=true;
  $('pix-modal-title').hidden=true;
  $('pix-modal-intro').hidden=true;
  $('pix-modal').querySelector('.pix-modal-top .tag').hidden=true;
  $('pix-license').textContent=license;
  const email=order?.email || $('pix-buyer-email').value.trim();
  $('pix-success-email-address').textContent=email || 'o e-mail informado na compra';
  $('pix-success-screen').hidden=false;
  $('pix-modal').classList.add('pix-is-complete');
  $('pix-modal').querySelector('.pix-modal-dialog').scrollTop=0;
}
function updateResume(){const canResume=savedOrder&&remainFor(savedOrder)>0;$('pix-resume').hidden=!canResume;$('pix-resume').textContent=canResume?'Continuar Pix anterior ('+clockText(remainFor(savedOrder))+')':'Continuar Pix anterior';}
function remainFor(o){return o&&Number.isFinite(o.startedAt)?Math.max(0,KEEP_MS-(Date.now()-o.startedAt)):0;}
function newPurchase(){if(busy)return;stopPoll();stopClock();hideSuccess();order=null;$('pix-modal-title').textContent='Comprar licença via Pix';$('pix-modal-intro').textContent='Informe o e-mail que receberá sua licença.';$('pix-order').hidden=true;$('pix-start').hidden=false;$('pix-details').hidden=true;$('pix-code').value='';$('pix-image').removeAttribute('src');$('pix-timer-box').hidden=true;$('pix-qr-loading').hidden=true;$('pix-stage').hidden=true;$('pix-status').hidden=true;status('Informe o e-mail para continuar.','Pronto para começar');updateResume();$('pix-buyer-email').focus();}
function cancelPayment(){if(busy)return; // Apenas volta ao formulário: a cobrança na Efí não é cancelada.
  newPurchase();
  status('Digite outro e-mail para criar um novo Pix. Se informar o mesmo e-mail, retomaremos a cobrança anterior.','Alterar e-mail');
}
async function resumeSaved(){
  if(busy||!savedOrder)return;
  if(!validSaved(savedOrder)){clearSaved();newPurchase();return;}
  order=savedOrder;$('pix-buyer-email').value=order.email;
  // Somente o servidor e a Efi podem confirmar pagamento; nunca gravar a chave localmente.
  showOrder();setBusy(true);
  try{
    let done=await consult();
    if(!done){
      // O pagamento pode ter ocorrido com o site fechado, sem ter sido conciliado ainda.
      const r=await api('/pedido/pagamento',identity());
      if(r.confirmado||r.licencaLiberada)done=await consult();
    }
    if(done)return;
    if(remain()<=0){
      stopClock();stopPoll();clearSaved();order=null;newPurchase();
      status('Os 30 minutos para retomar o Pix terminaram. Se pagou, recupere sua licença pelo e-mail.','Prazo encerrado');
      return;
    }
    try{const q=await api('/pedido/qrcode',identity());showQr(q)}
    catch{$('pix-qr-loading').hidden=true;$('pix-check').hidden=false;status('Não foi possível recuperar o QR Code. Tente verificar o pagamento.','Consulta indisponível')}
    schedulePoll();
  }catch(e){
    if(remain()<=0){clearSaved();order=null;newPurchase();status('Não foi possível confirmar o pedido antigo. Se pagou, utilize Recuperar licença.','Consulta indisponível');}
    else status('Não foi possível retomar o pedido: '+e.message,'Falha');
  }finally{setBusy(false)}
}
async function copy(text,button){try{await navigator.clipboard.writeText(text);let prev=button.textContent;button.textContent='Copiado!';setTimeout(()=>button.textContent=prev,1700)}catch{status('Não foi possível copiar automaticamente. Copie manualmente.')}}
function showQr(p){const pix=p.pix||{},v=p.cobranca||{};const qr=$('pix-image');const code=$('pix-code');const value=pix.copiaECola||'';if(value){code.value=value;$('pix-copy-row').hidden=false}else{$('pix-copy-row').hidden=true;code.value=''}const img=pix.imagemQrcode||'';if(typeof img==='string' && (/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(img)||/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(img))){qr.src=img;qr.hidden=false}else{qr.hidden=true;qr.removeAttribute('src')} const ready=!!value||!qr.hidden;$('pix-details').hidden=!ready;$('pix-qr-loading').hidden=true;if(ready){startClock();$('pix-check').hidden=false;}else{$('pix-timer-box').hidden=true;$('pix-check').hidden=false;}if(v.statusEfi==='CONCLUIDA')status('Cobrança concluída na Efí. Verifique o status do pedido.','Pagamento localizado');else if(value)status('Aguardando pagamento de R$ 9,99.','Aguardando pagamento');else status(p.mensagem||'QR Code não disponível.','Consulta realizada');}
async function consult(){const r=await api('/pedido/consultar',identity());const p=r.pedido||{};if(p.licencaLiberada===true && typeof p.licenca==='string' && p.licenca){showSuccess(p.licenca,p.pagoEm);return true}if(p.status==='PAID_TEST'){stopPoll();status('Pagamento de homologação confirmado. Nenhuma licença comercial será emitida.','Teste concluído');return true}if(p.status==='PAID'){status('Pagamento registrado. Aguardando disponibilização da licença.','Pagamento confirmado')}return false}
function stopPoll(){if(pollTimer){clearInterval(pollTimer);pollTimer=null}}
function schedulePoll(){stopPoll();let count=0;pollTimer=setInterval(async()=>{if(!order||busy||remain()<=0)return;if(++count>75){stopPoll();return}try{const done=await consult();if(!done){await api('/pedido/pagamento',identity());await consult()}}catch{}},8000)}
async function begin(){if(busy)return;setBusy(true);status('Preparando Pix...','Aguarde');try{const email=normalizeEmail($('pix-buyer-email').value);if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)||email.length>254)throw new Error('Informe um e-mail válido.');
if(savedOrder&&validSaved(savedOrder)&&remainFor(savedOrder)>0&&normalizeEmail(savedOrder.email)===email){setBusy(false);await resumeSaved();return;}
// Mudou o e-mail: pedido anterior não é cancelado na Efí; removemos apenas sua referência local.
// A referência anterior só será substituída quando o novo pedido for criado com sucesso.
const r=await api('/pedido/criar',{email});if(typeof r.pedidoId!=='string'||typeof r.acesso!=='string')throw new Error('Pedido incompleto.');save({id:r.pedidoId,acesso:r.acesso,email,startedAt:Date.now()});showOrder();status('Gerando seu QR Code...','Preparando Pix');try{await api('/pedido/criar-cobranca',identity());const q=await api('/pedido/qrcode',identity());showQr(q)}catch(e){$('pix-qr-loading').hidden=true;$('pix-check').hidden=false;status('Não foi possível carregar o QR Code: '+e.message+'. Tente retomar o pedido.','Pedido criado')}schedulePoll()}catch(e){status('Não foi possível iniciar: '+e.message,'Falha')}finally{setBusy(false)}}
async function check(){if(busy||!order)return;setBusy(true);try{const done=await consult();if(!done){const p=await api('/pedido/pagamento',identity());if(p.licencaLiberada===true){await consult()}else if(p.pagamento?.simulacao===true&&p.pagamento.confirmadoHomologacao===true){status('A Efí confirmou uma simulação. A licença comercial não é liberada em homologação.','Homologação')}else if(p.pagamento?.statusEfi==='CONCLUIDA'){status('Pagamento detectado. Aguardando confirmação no pedido.','Verificando')}else{status('Pagamento ainda não confirmado.','Aguardando pagamento')}}}catch(e){status('Falha ao consultar: '+e.message,'Verificação')}finally{setBusy(false)}}
start.addEventListener('click',begin);$('pix-new-purchase').addEventListener('click',newPurchase);$('pix-cancel').addEventListener('click',cancelPayment);$('pix-resume').addEventListener('click',resumeSaved);$('pix-check').addEventListener('click',check);

$('pix-copy-btn').addEventListener('click',()=>copy($('pix-code').value,$('pix-copy-btn')));
$('pix-copy-license').addEventListener('click',()=>copy($('pix-license').textContent,$('pix-copy-license')));
// Janela independente para recuperar a licença, sem modificar o fluxo Pix.
const recoveryModal=$('recovery-modal');
let recoveryPreviousFocus=null;
function openRecoveryModal(){
  if(!modal.hidden)closeModal();
  recoveryPreviousFocus=document.activeElement;
  recoveryModal.hidden=false;
  recoveryModal.setAttribute('aria-hidden','false');
  document.body.classList.add('pix-modal-open');
  $('license-recovery-email').focus();
}
function closeRecoveryModal(){
  recoveryModal.hidden=true;
  recoveryModal.setAttribute('aria-hidden','true');
  document.body.classList.remove('pix-modal-open');
  if(recoveryPreviousFocus&&typeof recoveryPreviousFocus.focus==='function')recoveryPreviousFocus.focus();
}
$('recovery-open').addEventListener('click',openRecoveryModal);
$('recovery-modal-close').addEventListener('click',closeRecoveryModal);
recoveryModal.querySelector('.pix-modal-backdrop').addEventListener('click',closeRecoveryModal);
document.addEventListener('keydown',e=>{
  if(recoveryModal.hidden)return;
  if(e.key==='Escape'){e.preventDefault();closeRecoveryModal();return;}
  if(e.key!=='Tab')return;
  const els=[...recoveryModal.querySelectorAll('button:not([disabled]),input:not([disabled])')].filter(x=>x.getClientRects().length);
  if(!els.length)return;
  const first=els[0],last=els[els.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
});
const recoveryForm=$('license-recovery-form');
recoveryForm.addEventListener('submit',async(event)=>{
  event.preventDefault();
  const email=$('license-recovery-email').value.trim();
  const button=$('license-recovery-submit'),message=$('license-recovery-status');
  if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)||email.length>254){message.textContent='Informe um e-mail válido.';return;}
  button.disabled=true;button.textContent='Enviando solicitação...';message.textContent='Aguarde enquanto processamos sua solicitação.';
  try{await recoverLicenseEmail(email);message.textContent='Se houver licenças comerciais associadas a este e-mail, enviaremos suas chaves. Confira sua caixa de entrada e spam.';}
  catch(e){message.textContent='Não foi possível processar a solicitação agora: '+e.message;}
  finally{button.disabled=false;button.textContent='Enviar licença por e-mail';}
});
restore();updateResume();status('Informe seu e-mail para iniciar a compra.','Pronto para começar');
})();