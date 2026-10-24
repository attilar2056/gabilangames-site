(()=>{'use strict';
// Integracao independente. Nao toca em Stripe ou Pix.
const API='https://gabilangames-pix.atilar55.workers.dev';
const $=id=>document.getElementById(id);
const modal=$('paypal-modal'),msg=$('paypal-message'),entry=$('paypal-entry'),pay=$('paypal-pay'),success=$('paypal-success');
if(!modal||!msg)return;
const storeKey='gg_paypal_checkout_v1';
let stored=null,config=null,chosenCurrency=null,chosenLocale=null,email='',busy=false,loading=false;
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
function save(value){stored=value;try{localStorage.setItem(storeKey,JSON.stringify(value))}catch{}}
function clear(){stored=null;try{localStorage.removeItem(storeKey)}catch{}}
async function api(path,data){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),20000);
 try{const r=await fetch(API+path,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:ctrl.signal});const info=await r.json();if(!r.ok||info.success!==true)throw Error(info.erro||'Falha na comunicacao');return info}
 finally{clearTimeout(timer)}
}
function openModal(){modal.hidden=false;modal.setAttribute('aria-hidden','false');document.body.classList.add('pix-modal-open');$('paypal-modal-close').focus()}
function closeModal(){modal.hidden=true;modal.setAttribute('aria-hidden','true');document.body.classList.remove('pix-modal-open')}
async function checkStatus(){
 if(!stored)return false;
 const d=await api('/paypal/status',{id:stored.id,access:stored.access});
 if(d.status==='PAID'&&d.license){showSuccess(d);return true}
 return false;
}
function showSuccess(result){
 view('success');
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
  const params=new URLSearchParams({'client-id':config.clientId,'currency':c,'intent':'capture','components':'buttons','locale':locale});
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
     message('Criando pedido seguro...','Creating secure order...');
     const v=await api('/paypal/create',{email,currency:chosenCurrency,locale:lang()});
     save({id:v.id,access:v.access,paypalOrderId:v.paypalOrderId,email,created:Date.now(),currency:chosenCurrency});
     busy=false;return v.paypalOrderId;
    }catch(e){busy=false;message('Não foi possível iniciar: '+e.message,'Could not start payment: '+e.message);throw e}
   },
   onApprove:async data=>{
    if(!stored||data.orderID!==stored.paypalOrderId){message('Pedido inválido. Verifique seu pagamento.','Order mismatch. Check payment status.');return}
    message('Confirmando pagamento com o PayPal...','Confirming payment with PayPal...');
    try{
     const captured=await api('/paypal/capture',{id:stored.id,access:stored.access});
     if(captured.status==='PAID'&&captured.license){showSuccess(captured);return}
     if(await checkStatus())return;
     message('Aguardando a confirmação do PayPal. Use Verificar pagamento.','Awaiting PayPal confirmation. Use Check payment.');
    }catch(e){
     try{if(await checkStatus())return}catch{}
     message('Ainda não foi possível confirmar. Use Verificar pagamento.','Unable to confirm yet. Use Check payment.');
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
async function open(){openModal();view('entry');message('Informe o e-mail para receber sua licença.','Enter your email to receive your license.');load();if(stored){$('paypal-email').value=stored.email||'';try{if(await checkStatus())return}catch{message('Pedido anterior não pôde ser consultado.','Could not check previous order.')} }
}
$('paypal-form').addEventListener('submit',async e=>{
 e.preventDefault();if(busy||loading)return;
 email=$('paypal-email').value.trim().toLowerCase();
 if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)){message('Informe um e-mail válido.','Enter a valid email.');return}
 busy=true;$('paypal-submit').disabled=true;
 chosenCurrency=currency();chosenLocale=langs[lang()]||'en-US';
 message('Preparando o PayPal...','Loading PayPal...');
 try{config=await api('/paypal/config');busy=false;await render()}
 catch(e){view('entry');message('PayPal indisponível: '+e.message,'PayPal unavailable: '+e.message)}
 finally{busy=false;$('paypal-submit').disabled=false}
});
$('paypal-verify').addEventListener('click',async()=>{message('Consultando PayPal...','Checking PayPal...');try{if(!await checkStatus())message('Pagamento ainda não confirmado.','Payment not confirmed yet.')}catch(e){message('Falha na consulta: '+e.message,'Could not check payment: '+e.message)}});
$('paypal-new').addEventListener('click',()=>{clear();view('entry');message('Nova compra: informe seu e-mail.','New purchase: enter your email.');});
$('paypal-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('paypal-result-license').textContent);$('paypal-copy').textContent='Copiado!';setTimeout(()=>$('paypal-copy').textContent='Copiar licença',1400)}catch{message('Selecione e copie a licença.','Select and copy the license.')}});
$('paypal-modal-close').addEventListener('click',closeModal);modal.querySelector('.pix-modal-backdrop').addEventListener('click',closeModal);
$('paypal-open')?.addEventListener('click',e=>{e.preventDefault();open()});$('paypal-price-open')?.addEventListener('click',open);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)closeModal()});
// Restaura apenas pedidos conhecidos, sem criar cobrancas automaticas.
load();
})();
