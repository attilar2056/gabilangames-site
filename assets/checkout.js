(()=>{'use strict';
const API='https://gabilangames-pix.atilar55.workers.dev';
const $=id=>document.getElementById(id);
const storeKey='gabilangames_pix_pedido_v1';
let order=null,busy=false,pollTimer=null;
let savedOrder=null;
const start=$('pix-start-btn');
const modal=$('pix-modal');
const opener=$('pix-open-checkout');
let focusBeforeModal=null;
function openModal(){focusBeforeModal=document.activeElement;modal.hidden=false;modal.setAttribute('aria-hidden','false');document.body.classList.add('pix-modal-open');$('pix-modal-close').focus();if(!order&&savedOrder)resumeSaved();}
function closeModal(){modal.hidden=true;modal.setAttribute('aria-hidden','true');document.body.classList.remove('pix-modal-open');if(focusBeforeModal&&typeof focusBeforeModal.focus==='function')focusBeforeModal.focus();}
opener.addEventListener('click',e=>{e.preventDefault();openModal()});
$('pix-price-open').addEventListener('click',()=>opener.click());
$('pix-modal-close').addEventListener('click',closeModal);
modal.querySelector('.pix-modal-backdrop').addEventListener('click',closeModal);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)closeModal();if(e.key==='Tab'&&!modal.hidden){const els=[...modal.querySelectorAll('button:not([disabled]):not([hidden]),input:not([disabled]):not([hidden]),textarea:not([disabled]):not([hidden])')].filter(x=>x.getClientRects().length);if(!els.length)return;const first=els[0],last=els[els.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
function status(msg,stage){$('pix-status').textContent=msg;if(stage)$('pix-stage').textContent=stage;}
function setBusy(value){busy=value;[start,$('pix-check')].forEach(e=>{e.disabled=value});}
async function api(path,body){const ctrl=new AbortController(),t=setTimeout(()=>ctrl.abort(),15000);try{const response=await fetch(API+path,{method:'POST',mode:'cors',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:ctrl.signal,credentials:'omit'});let data;try{data=await response.json()}catch{throw new Error('Resposta inválida do servidor.')}if(!response.ok||data.success!==true)throw new Error(data.erro||`Erro HTTP ${response.status}`);return data;}finally{clearTimeout(t)}}
function save(o){order=o;savedOrder=o;try{sessionStorage.setItem(storeKey,JSON.stringify(o))}catch{}}
function restore(){try{const s=JSON.parse(sessionStorage.getItem(storeKey));if(s&&typeof s.id==='string'&&/^[a-f0-9-]{36}$/i.test(s.id)&&/^[a-f0-9]{64}$/i.test(s.acesso))savedOrder=s}catch{}}
function identity(){return {id:order.id,acesso:order.acesso}}
function showOrder(){if(!order)return;$('pix-modal-title').textContent='Pague com Pix';$('pix-modal-intro').textContent='Escaneie o QR Code ou copie o código Pix. Acompanhe a confirmação aqui.';$('pix-start').hidden=true;$('pix-order').hidden=false;$('pix-details').hidden=true;$('pix-license-panel').hidden=true;}
function updateResume(){ $('pix-resume').hidden=!savedOrder; }
function newPurchase(){if(busy)return;if(order && !confirm('Seu pedido anterior continuará existente. Você poderá retomar o pedido nesta aba enquanto a sessão estiver disponível. Deseja iniciar outra compra?'))return;stopPoll();order=null;$('pix-modal-title').textContent='Comprar licença via Pix';$('pix-modal-intro').textContent='Informe seu e-mail para continuar. Depois, escaneie o QR Code ou copie o código Pix.';$('pix-order').hidden=true;$('pix-start').hidden=false;$('pix-details').hidden=true;$('pix-license-panel').hidden=true;$('pix-code').value='';$('pix-image').removeAttribute('src');status('Informe seu e-mail para iniciar uma nova compra.','Pronto para começar');updateResume();}
async function resumeSaved(){if(busy||!savedOrder)return;order=savedOrder;showOrder();setBusy(true);try{const done=await consult();if(!done){try{const q=await api('/pedido/qrcode',identity());showQr(q)}catch{status('Pedido retomado. A cobrança pode ter sido concluída ou expirado.','Pedido anterior')}}schedulePoll()}catch(e){status('Não foi possível retomar o pedido: '+e.message,'Falha')}finally{setBusy(false)}}
async function copy(text,button){try{await navigator.clipboard.writeText(text);let prev=button.textContent;button.textContent='Copiado!';setTimeout(()=>button.textContent=prev,1700)}catch{status('Não foi possível copiar automaticamente. Copie manualmente.')}}
function showQr(p){const pix=p.pix||{},v=p.cobranca||{};const qr=$('pix-image');const code=$('pix-code');const value=pix.copiaECola||'';if(value){code.value=value;$('pix-copy-row').hidden=false}else{$('pix-copy-row').hidden=true;code.value=''}const img=pix.imagemQrcode||'';if(typeof img==='string' && (/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(img)||/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(img))){qr.src=img;qr.hidden=false}else{qr.hidden=true;qr.removeAttribute('src')} $('pix-details').hidden=(!value&&qr.hidden);if(v.statusEfi==='CONCLUIDA')status('Cobrança concluída na Efí. Verifique o status do pedido.','Pagamento localizado');else if(value)status('Escaneie o QR Code ou copie o código Pix para pagar R$ 1,00.','Aguardando pagamento');else status(p.mensagem||'QR Code não disponível.','Consulta realizada');}
async function consult(){const r=await api('/pedido/consultar',identity());const p=r.pedido||{};if(p.licencaLiberada===true && typeof p.licenca==='string' && p.licenca){$('pix-license-panel').hidden=false;$('pix-license').textContent=p.licenca;stopPoll();status('Pagamento confirmado. Sua licença está disponível.','Licença liberada');return true}if(p.status==='PAID_TEST'){stopPoll();status('Pagamento de homologação confirmado. Nenhuma licença comercial será emitida.','Teste concluído');return true}if(p.status==='PAID'){status('Pagamento registrado. Aguardando disponibilização da licença.','Pagamento confirmado')}return false}
function stopPoll(){if(pollTimer){clearInterval(pollTimer);pollTimer=null}}
function schedulePoll(){stopPoll();let count=0;pollTimer=setInterval(async()=>{if(!order||busy)return;if(++count>75){stopPoll();return}try{const done=await consult();if(!done){await api('/pedido/pagamento',identity());await consult()}}catch{}},8000)}
async function begin(){if(busy)return;setBusy(true);status('Criando pedido...','Aguarde');try{const email=$('pix-buyer-email').value.trim();if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)||email.length>254)throw new Error('Informe um e-mail válido antes de continuar.');const r=await api('/pedido/criar',{email});if(typeof r.pedidoId!=='string'||typeof r.acesso!=='string')throw new Error('Pedido incompleto.');save({id:r.pedidoId,acesso:r.acesso});showOrder();status('Pedido criado. Gerando cobrança Pix...','Pedido criado');try{await api('/pedido/criar-cobranca',identity());const q=await api('/pedido/qrcode',identity());showQr(q)}catch(e){status('Pedido criado, mas houve problema na cobrança: '+e.message+'. Você pode tentar verificar o pagamento ou retomar o pedido nesta aba.','Pedido criado')}schedulePoll()}catch(e){status('Não foi possível criar pedido: '+e.message,'Falha');}finally{setBusy(false)}}
async function check(){if(busy||!order)return;setBusy(true);try{const done=await consult();if(!done){const p=await api('/pedido/pagamento',identity());if(p.licencaLiberada===true){await consult()}else if(p.pagamento?.simulacao===true&&p.pagamento.confirmadoHomologacao===true){status('A Efí confirmou uma simulação. A licença comercial não é liberada em homologação.','Homologação')}else if(p.pagamento?.statusEfi==='CONCLUIDA'){status('Pagamento detectado. Aguardando confirmação no pedido.','Verificando')}else{status('Pagamento ainda não confirmado.','Aguardando pagamento')}}}catch(e){status('Falha ao consultar: '+e.message,'Verificação')}finally{setBusy(false)}}
start.addEventListener('click',begin);$('pix-new-purchase').addEventListener('click',newPurchase);$('pix-resume').addEventListener('click',resumeSaved);$('pix-check').addEventListener('click',check);

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
  try{await api('/licenca/recuperar',{email});message.textContent='Se houver licenças comerciais associadas a este e-mail, enviaremos suas chaves. Confira sua caixa de entrada e spam.';}
  catch(e){message.textContent='Não foi possível processar a solicitação agora: '+e.message;}
  finally{button.disabled=false;button.textContent='Enviar licença por e-mail';}
});
restore();updateResume();status('Informe seu e-mail para iniciar a compra. Você pode retomar seu pedido nesta aba.','Pronto para começar');
})();