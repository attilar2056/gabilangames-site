(()=>{'use strict';
// Integracao independente. Nao toca em Stripe ou Pix.
const API='https://gabilangames-pix.atilar55.workers.dev';
// Protecao do site oficial: nao oferecer checkout Sandbox ao publico.
const paypalOfficialHost = location.hostname === 'gabilangames.com.br' || location.hostname === 'www.gabilangames.com.br';

const $=id=>document.getElementById(id);
const modal=$('paypal-modal'),msg=$('paypal-message'),entry=$('paypal-entry'),pay=$('paypal-pay'),success=$('paypal-success');
if(!modal||!msg)return;
const storeKey='gg_paypal_checkout_v1';
let stored=null,config=null,chosenCurrency=null,chosenLocale=null,email='',busy=false,loading=false,recoveryTimer=null,recoveryBusy=false;
const sdkPromises=new Map();
const langs={pt:'pt-BR',en:'en-US',es:'es-ES',ar:'en-US',de:'de-DE',fr:'fr-FR',it:'it-IT',pl:'pl-PL',ru:'ru-RU',ja:'ja-JP',ko:'ko-KR','zh-CN':'zh-CN','zh-TW':'zh-TW'};
function lang(){return window.GabilanLanguage?.get?.()||$('gg-language')?.value||'pt'}
function currency(){return lang()==='pt'?'BRL':'USD'}
function money(c){return c==='BRL'?'R$ 14,99':'US$ 2,99'}
function price(){const value=money(currency());document.querySelectorAll('[data-paypal-price]').forEach(el=>el.textContent=value);}
price();window.addEventListener('gabilan-language-change',price);
function message(pt,en){msg.textContent=lang()==='pt'?pt:(en||pt)}
function view(which){entry.hidden=which!=='entry';pay.hidden=which!=='pay';success.hidden=which!=='success'}
function load(){try{const value=JSON.parse(localStorage.getItem(storeKey));if(value&&value.id&&value.access&&value.created>Date.now()-24*3600*1000){stored=value;return}}catch{}stored=null;try{localStorage.removeItem(storeKey)}catch{}}
function save(value){stored=value;try{localStorage.setItem(storeKey,JSON.stringify(value))}catch{};startRecovery()}
function stopRecovery(){if(recoveryTimer){clearInterval(recoveryTimer);recoveryTimer=null}}
function startRecovery(){
 if(recoveryTimer||!stored||modal.hidden)return;
 recoveryTimer=setInterval(()=>{
  if(modal.hidden||!stored||Date.now()-stored.created>5*60*1000){stopRecovery();return}
  checkStatus().catch(()=>{});
 },8000);
}
function clear(){stopRecovery();stored=null;try{localStorage.removeItem(storeKey)}catch{}}
async function api(path,data){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),20000);
 try{const r=await fetch(API+path,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:ctrl.signal});const info=await r.json();if(!r.ok||info.success!==true)throw Error(info.erro||'Falha na comunicacao');return info}
 finally{clearTimeout(timer)}
}
// Preview continua livre para testes. No dominio oficial, so libera quando
// o proprio Worker informar modo Live. Em qualquer erro, permanece oculto.
async function paypalOfficialLiveConfig(){
 if(!paypalOfficialHost)return config;
 try{
  const latest=await api('/paypal/config');
  if(latest.mode==='live' && typeof latest.clientId==='string' && latest.clientId.trim()){
   config=latest;
   document.documentElement.classList.remove('gg-paypal-awaiting-live');
   return latest;
  }
 }catch{}
 document.documentElement.classList.add('gg-paypal-awaiting-live');
 return null;
}
if(paypalOfficialHost)paypalOfficialLiveConfig();
function openModal(){modal.hidden=false;modal.setAttribute('aria-hidden','false');document.body.classList.add('pix-modal-open');$('paypal-modal-close').focus()}
function closeModal(){stopRecovery();modal.hidden=true;modal.setAttribute('aria-hidden','true');document.body.classList.remove('pix-modal-open')}
async function checkStatus(){
 if(!stored||recoveryBusy)return false;
 recoveryBusy=true;
 const pedido=stored;
 try{
  const params={id:pedido.id,access:pedido.access};
  const d=await api('/paypal/status',params);
  if(!stored||stored.id!==pedido.id)return false;
  if(d.status==='PAID'&&d.license){showSuccess(d);return true}
  // O SDK pode fechar o popup sem invocar onApprove, apesar de o comprador
  // ja ter aprovado. O Worker autentica a aprovacao antes de capturar.
  if(d.paypalStatus==='APPROVED'){
   message('Compra aprovada. Finalizando o pagamento...','Order approved. Finalizing payment...');
   const paid=await api('/paypal/capture',params);
   if(!stored||stored.id!==pedido.id)return false;
   if(paid.status==='PAID'&&paid.license){showSuccess(paid);return true}
  }
  return false;
 }finally{recoveryBusy=false}
}
function showSuccess(result){
 stopRecovery();view('success');
 const sandbox=!!result.sandbox;
 $('paypal-success').querySelector('.pix-success-subtitle').textContent=sandbox?'TESTE SANDBOX: nenhum dinheiro real foi cobrado e nenhuma licença comercial foi criada.':(lang()==='pt'?'Pagamento PayPal confirmado. Sua licença está disponível.':'PayPal payment confirmed. Your license is ready.');$('paypal-result-license').textContent=result.license;
 $('paypal-result-email').textContent=result.email||stored?.email||email;
 message(result.sandbox?'Teste Sandbox confirmado. Licença apenas demonstrativa.':'Pagamento confirmado. Sua licença está disponível.',result.sandbox?'Sandbox test confirmed. Demonstration only.':'Payment confirmed. Your license is ready.');
}
function sdk(config,c,locale){
 const ns='ggPayPal'+c;
 if(window[ns])return Promise.resolve(window[ns]);
 if(sdkPromises.has(ns))return sdkPromises.get(ns);
 const promise=new Promise((resolve,reject)=>{
  const s=document.createElement('script');
  const params=new URLSearchParams({'client-id':config.clientId,'currency':c,'intent':'capture','components':'buttons'});
  s.src='https://www.paypal.com/sdk/js?'+params.toString();s.async=true;s.dataset.namespace=ns;
  s.onload=()=>window[ns]?.Buttons?resolve(window[ns]):reject(Error('SDK PayPal indisponivel'));
  s.onerror=()=>reject(Error('Falha ao carregar o PayPal'));
  document.head.appendChild(s);
 });
 sdkPromises.set(ns,promise);
 promise.catch(()=>sdkPromises.delete(ns));
 return promise;
}
async function render(){
 if(loading)return;loading=true;
 view('pay');$('paypal-amount-display').textContent=money(chosenCurrency);
 message('Escolha PayPal para autorizar o pagamento.','Select PayPal to approve your payment.');
 $('paypal-buttons').replaceChildren();
 try{
  const p=await sdk(config,chosenCurrency,chosenLocale);
  if(modal.hidden)return;
  const buttons=p.Buttons({
   style:{layout:'vertical',shape:'rect',label:'paypal'},
   createOrder:async()=>{
    if(busy)throw Error('Pagamento em andamento');busy=true;
    try{
     // Nao sobrescrever um pedido ainda nao conciliado apenas por clicar novamente.
     // O comprador pode escolher explicitamente Nova compra se necessario.
     if(stored){
      if(await checkStatus())throw Error('Pagamento confirmado');
      throw Error('Ja existe um pedido pendente. Use Verificar pagamento antes de iniciar outro.');
     }
     message('Criando pedido seguro...','Creating secure order...');
     const v=await api('/paypal/create',{email,currency:chosenCurrency,locale:lang()});
     save({id:v.id,access:v.access,paypalOrderId:v.paypalOrderId,email,created:Date.now(),currency:chosenCurrency});
     busy=false;return v.paypalOrderId;
    }catch(e){busy=false;if(success.hidden)message('Não foi possível iniciar: '+e.message,'Could not start payment: '+e.message);throw e}
   },
   onApprove:async data=>{
    if(!stored||data.orderID!==stored.paypalOrderId){message('Pedido divergente. Use Verificar pagamento.','Order mismatch. Check payment status.');return}
    message('Confirmando pagamento com o PayPal...','Confirming payment with PayPal...');
    try{
     if(await checkStatus())return;
     startRecovery();
     message('Aprovação recebida. Estamos confirmando. Use Verificar pagamento se necessário.','Approval received. Confirming payment. Use Check payment if needed.');
    }catch(e){
     startRecovery();
     message('Aprovação recebida; confirmação pendente. Use Verificar pagamento.','Approval received; confirmation pending. Use Check payment.');
    }
   },
   onCancel:()=>message('Pagamento cancelado. Nenhuma licença foi emitida.','Payment cancelled. No license issued.'),
   onError:()=>message('Falha no Checkout PayPal. Confira sua conexão ou tente novamente.','PayPal Checkout error. Please retry.')
  });
  if(!buttons.isEligible())throw Error('PayPal indisponível para esta conta ou região');
  await buttons.render('#paypal-buttons');
 }catch(e){message('Falha ao preparar o PayPal: '+e.message,'Failed to prepare PayPal: '+e.message);view('entry')}
 finally{loading=false}
}
async function open(){
 if(paypalOfficialHost && !await paypalOfficialLiveConfig())return;
 openModal();view('entry');message('Informe o e-mail para receber sua licença.','Enter your email to receive your license.');load();
 if(stored){
  $('paypal-email').value=stored.email||'';
  try{
   if(await checkStatus())return;
   message('Pedido anterior encontrado. Use Verificar pagamento antes de iniciar outra compra.','Previous order found. Check payment before starting a new purchase.');
  }catch{message('Nao foi possivel consultar o pedido anterior. Tente Verificar pagamento.','Unable to check previous order. Please use Check payment.')}
  startRecovery();
  // Apresenta os controles Verificar pagamento / Nova compra para o pedido
  // preservado, sem criar um novo pedido PayPal automaticamente.
  email=stored.email||'';
  chosenCurrency=stored.currency||currency();
  chosenLocale=langs[lang()]||'en-US';
  try{config=await api('/paypal/config');await render()}
  catch{view('pay');$('paypal-buttons').replaceChildren();message('Pedido anterior: use Verificar pagamento.','Previous order: use Check payment.')}
 }
}
$('paypal-form').addEventListener('submit',async e=>{
 e.preventDefault();if(busy||loading)return;
 email=$('paypal-email').value.trim().toLowerCase();
 if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)){message('Informe um e-mail válido.','Enter a valid email.');return}
 busy=true;$('paypal-submit').disabled=true;
 chosenCurrency=currency();chosenLocale=langs[lang()]||'en-US';
 message('Preparando o PayPal...','Loading PayPal...');
 try{config=await api('/paypal/config');if(paypalOfficialHost && config.mode!=='live')throw Error('PayPal Live indisponivel');busy=false;await render()}
 catch(e){view('entry');message('PayPal indisponível: '+e.message,'PayPal unavailable: '+e.message)}
 finally{busy=false;$('paypal-submit').disabled=false}
});
$('paypal-verify').addEventListener('click',async()=>{message('Consultando PayPal...','Checking PayPal...');try{if(!await checkStatus())message('Pagamento ainda não confirmado.','Payment not confirmed yet.')}catch(e){message('Falha na consulta: '+e.message,'Could not check payment: '+e.message)}});
$('paypal-new').addEventListener('click',()=>{
 if(stored&&!window.confirm(lang()==='pt'?'O pedido anterior pode ter sido aprovado. Antes de iniciar outra compra, use Verificar pagamento. Deseja mesmo descartar a referencia deste pedido?':'Your previous order may have been approved. Check payment before starting another purchase. Discard the previous order reference?'))return;
 clear();view('entry');message('Nova compra: informe seu e-mail.','New purchase: enter your email.');
});
$('paypal-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('paypal-result-license').textContent);$('paypal-copy').textContent='Copiado!';setTimeout(()=>$('paypal-copy').textContent='Copiar licença',1400)}catch{message('Selecione e copie a licença.','Select and copy the license.')}});
$('paypal-modal-close').addEventListener('click',closeModal);modal.querySelector('.pix-modal-backdrop').addEventListener('click',closeModal);
$('paypal-open')?.addEventListener('click',e=>{e.preventDefault();open()});$('paypal-price-open')?.addEventListener('click',open);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)closeModal()});
// Restaura apenas pedidos conhecidos, sem criar cobrancas automaticas.
load();
})();
