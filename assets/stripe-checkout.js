(()=>{'use strict';
const API='https://gabilangames-pix.atilar55.workers.dev';
const $=id=>document.getElementById(id);
const modal=$('stripe-modal'),info=$('stripe-message'),entry=$('stripe-entry'),pay=$('stripe-pay'),success=$('stripe-success');
const key='gg_stripe_checkout_test_v1';let stored=null,instance=null,busy=false,watch=null;
const card=$('stripe-open');
const top=$('stripe-price-open');
// O idioma selecionado no site tem prioridade sobre o idioma do navegador.
function isBrazilianPortuguese(){
 const selected=window.GabilanLanguage?.get?.();
 if(selected)return selected==='pt';
 try { const saved=localStorage.getItem('gabilangames_site_language_v1');if(saved)return saved==='pt'; } catch(e){}
 return (navigator.languages?.[0]||navigator.language||'').toLowerCase().startsWith('pt');
}
function checkoutCurrency(){return isBrazilianPortuguese()?'BRL':'USD'}
// Envia o idioma do site ao Worker; a Stripe controla a traducao do formulario incorporado.
function checkoutLanguage(){return window.GabilanLanguage?.get?.() || $('gg-language')?.value || 'en'}
function updateStripePrice(){
 const price=checkoutCurrency()==='BRL'?'R$ 14,99':'US$ 2,99';
 for(const el of document.querySelectorAll('[data-stripe-price]'))el.textContent=price;
 if(card)card.setAttribute('aria-label','Comprar com cartão - '+price);
 if(top){top.disabled=false;top.removeAttribute('title');top.setAttribute('aria-label','Pagar com cartão - '+price)}
}
updateStripePrice();
window.addEventListener('gabilan-language-change',updateStripePrice);

function loadSaved(){try{const item=JSON.parse(localStorage.getItem(key));if(item&&item.id&&item.access&&item.created>Date.now()-60*60*1000){stored=item;return}}catch{} localStorage.removeItem(key)}
function save(item){stored=item;try{localStorage.setItem(key,JSON.stringify(item))}catch{}}
function clear(){stored=null;try{localStorage.removeItem(key)}catch{}}
function message(t){info.textContent=t}
function view(v){entry.hidden=v!=='entry';pay.hidden=v!=='pay';success.hidden=v!=='success'}
async function api(path,data){const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),20000);try{const r=await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:ctrl.signal});const d=await r.json();if(!r.ok||d.success!==true)throw Error(d.erro||'Falha na comunicação');return d}finally{clearTimeout(timer)}}
function show(){modal.hidden=false;document.body.classList.add('pix-modal-open');$('stripe-modal-close').focus();}
function close(){modal.hidden=true;document.body.classList.remove('pix-modal-open');if(watch)clearInterval(watch);watch=null;}
async function stripeSDK(){if(window.Stripe)return window.Stripe;await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://js.stripe.com/v3/';s.onload=resolve;s.onerror=reject;document.head.appendChild(s)});if(!window.Stripe)throw Error('Não foi possível carregar a Stripe');return window.Stripe}
async function status(){if(!stored)return false;const data=await api('/stripe/status',{id:stored.id,access:stored.access});if(data.status==='PAID'&&data.license){showSuccess(data);return true}return false}
function showSuccess(data){if(watch)clearInterval(watch);watch=null;view('success');$('stripe-result-license').textContent=data.license;$('stripe-result-email').textContent=data.email||stored?.email||'o e-mail da compra';message('Pagamento confirmado e licença liberada.');if(instance){instance.destroy();instance=null}}
function poll(){if(watch)clearInterval(watch);watch=setInterval(()=>{if(!modal.hidden&&stored)status().catch(()=>{})},7000)}
async function open(){show();view('entry');message('Pagamento seguro via Stripe.');loadSaved();if(stored){$('stripe-email').value=stored.email||'';message('Há um pedido anterior. Vamos consultar seu pagamento.');try{if(await status())return}catch(e){message('Não foi possível consultar: '+e.message)} if(stored.clientSecret){await render(stored.clientSecret,stored.publishableKey);return}message('Se o pagamento anterior não foi concluído, você pode iniciar outra compra.')}}
async function render(clientSecret,publishableKey){view('pay');message('Conclua o pagamento abaixo. O processamento é realizado pela Stripe.');try{const Stripe=await stripeSDK();if(instance){instance.destroy();instance=null}const stripe=Stripe(publishableKey);instance=await stripe.initEmbeddedCheckout({clientSecret,onComplete:async()=>{message('Pagamento processado. Confirmando licença...');try{if(!await status()){message('Aguardando confirmação segura. Você receberá a licença por e-mail após a aprovação.');poll()}}catch(e){message('Estamos verificando o pagamento: '+e.message);poll()}}});instance.mount('#stripe-embedded');poll()}catch(e){message('Falha ao carregar checkout: '+e.message);view('entry')}}
$('stripe-form').addEventListener('submit',async e=>{e.preventDefault();if(busy)return;const email=$('stripe-email').value.trim().toLowerCase();if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))return message('Informe um e-mail válido.');busy=true;$('stripe-submit').disabled=true;message('Preparando checkout...');try{const result=await api('/stripe/create',{email,currency:checkoutCurrency(),locale:checkoutLanguage()});save({id:result.id,access:result.access,created:Date.now(),email,clientSecret:result.clientSecret,publishableKey:result.publishableKey});await render(result.clientSecret,result.publishableKey)}catch(err){view('entry');message('Não foi possível iniciar: '+err.message)}finally{busy=false;$('stripe-submit').disabled=false}});
$('stripe-new').addEventListener('click',()=>{if(watch)clearInterval(watch);watch=null;if(instance){instance.destroy();instance=null}clear();view('entry');message('Nova compra: informe seu e-mail.');});
$('stripe-verify').addEventListener('click',async()=>{message('Consultando...');try{if(!await status())message('Pagamento ainda não confirmado.')}catch(e){message('Falha: '+e.message)}});
$('stripe-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('stripe-result-license').textContent);$('stripe-copy').textContent='Copiado!';setTimeout(()=>$('stripe-copy').textContent='Copiar licença',1600)}catch{message('Selecione e copie a licença manualmente.')}});
$('stripe-modal-close').addEventListener('click',close);modal.querySelector('.pix-modal-backdrop').addEventListener('click',close);
card?.addEventListener('click',e=>{e.preventDefault();open()});top?.addEventListener('click',open);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)close()});
loadSaved();if(new URLSearchParams(location.search).has('stripe_return')){open();history.replaceState(null,'',location.pathname+location.hash)}
})();
