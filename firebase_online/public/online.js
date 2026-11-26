// R5G: MONITORAMENTO online (somente leitura), por Firebase Authentication.
// O controle fisico e comandos do motor continuam LOCAIS na ESP32.
import { db, ref, onValue, auth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from './firebase.js';
const $ = id => document.getElementById(id);
let cancelStatus = null, cancelEvents = null;
let statusAtual = null, autent = false;
const fmt = ms => {
 let t=Math.max(0,Math.floor((Number(ms)||0)/1000)), h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=t%60;
 return h ? `${h}h ${String(m).padStart(2,'0')}m` : `${m}m ${String(s).padStart(2,'0')}s`;
};
const texto = (s,n=160) => String(s??'').slice(0,n);
const icone = n => `<i data-lucide="${n}"></i>`;
const refreshIcons=()=>{if(window.lucide)window.lucide.createIcons();};
function conexao(ok,mensagem){
 $('connection-badge').classList.toggle('online',ok);
 $('connection-badge').classList.toggle('offline',!ok);
 $('connection-text').textContent=mensagem;
}
function eventosTela(val){
 const ui=$('event-logs');ui.replaceChildren();
 const linhas=Array.isArray(val?.eventos)?val.eventos:[];
 if(!linhas.length){let li=document.createElement('li');li.className='log-empty';li.textContent='Nenhum evento enviado pela ESP32.';ui.append(li);return;}
 linhas.slice(-18).reverse().forEach(e=>{
   let li=document.createElement('li'),a=document.createElement('span'),b=document.createElement('span');
   a.textContent=texto(e.texto);b.className='log-time';b.textContent='+'+fmt((Number(e.segundos)||0)*1000);
   li.append(a,b);ui.append(li);
 });
}
function renderizar(s){
 statusAtual=s;
 const idade=Date.now() - Number(s.atualizado_em || 0);
 const recente=idade>=0 && idade<30000;
 const chuva=Boolean(s.chuva),pos=s.posicao||'intermediaria',mov=s.motor!=='parado',falha=Boolean(s.falha);
 conexao(recente,'ESP32 '+(recente?'sincronizada':'sem dados recentes'));
 $('varal-status').textContent=falha?'FALHA':mov?(s.motor==='recolhendo'?'RECOLHENDO':'ESTENDENDO'):
   pos==='recolhidas'?'RECOLHIDO':pos==='estendidas'?'ESTENDIDO':pos==='conflito'?'CONFLITO':'POSIÇÃO DESCONHECIDA';
 $('box-varal').className='status-box'+(falha?' is-fault':mov?' is-moving':pos==='recolhidas'?' is-closed':pos==='estendidas'?' is-open':'');
 $('sensor-status').textContent=chuva?'CHUVA DETECTADA':'SECO';
 $('box-sensor').className='status-box'+(chuva?' is-wet':'');
 $('visualizer-percent').textContent=pos==='recolhidas'?'0%':pos==='estendidas'?'100%':'--';
 $('varal-progress').style.width=pos==='recolhidas'?'0%':pos==='estendidas'?'100%':'0%';
 $('mode-badge').textContent=s.modo==='automatico'?'MODO AUTOMÁTICO':s.modo==='manual'?'MODO MANUAL':'PAUSADO';
 $('mode-badge').className='mode-tag'+(s.modo==='automatico'?'':' manual')+(s.modo==='pausado'?' paused':'');
 $('check-auto').checked=s.modo==='automatico';$('check-auto').disabled=true;
 $('temp').textContent=chuva?'0':String(Math.floor(Number(s.seco_ms||0)/1000));
 $('weather-desc').textContent=chuva?'Chuva presente no sensor':'Tempo contínuo sem chuva';
 $('rain-prob').textContent=chuva?'SIM':'NÃO';
 $('wind-speed').textContent=texto(s.motor||'parado').toUpperCase();
 $('weather-updated').textContent=recente?`Sincronizado ${new Date(s.atualizado_em).toLocaleTimeString('pt-BR')}`:'Dados antigos — confira a rede';
 $('tempo-aberto-24h').textContent=fmt(s.tempo_estendido_ms);
 $('tempo-fechado-24h').textContent=fmt(s.tempo_recolhido_ms);
 $('sem-atual-aberto').textContent=`${Number(s.acionamentos||0)} acionamentos`;
 $('sem-atual-fechado').textContent=fmt(s.tempo_motor_ms);
 $('sem-ant-aberto').textContent=`FC1: ${s.limite_recolhido?'ATIVO':'LIVRE'}`;
 $('sem-ant-fechado').textContent=`FC2: ${s.limite_estendido?'ATIVO':'LIVRE'}`;
 const comando=$('btn-toggle-varal');comando.disabled=true;comando.className='btn-primary-action btn-blocked';
 comando.innerHTML=icone('eye')+'<span>MONITORAMENTO — SEM COMANDO REMOTO</span>';
 $('btn-stop').disabled=true;$('btn-clear-fault').disabled=true;$('btn-clear-logs').disabled=true;
 $('command-feedback').textContent=!s.hardware_validado?'Hardware ainda não validado: não confiar nas leituras dos sensores.':recente?'Status sincronizado pelo Firebase. Comandos físicos apenas na rede local.':'ESP32 sem atualização recente: verifique energia ou Wi-Fi.';
 refreshIcons();
}
function limpar(){
 if(cancelStatus){cancelStatus();cancelStatus=null;}
 if(cancelEvents){cancelEvents();cancelEvents=null;}
 autent=false;statusAtual=null;
 $('firebase-login').classList.remove('hidden');$('firebase-authbar').classList.add('hidden');$('firebase-dashboard').classList.add('hidden');
 conexao(false,'Entrar no Firebase');
}
$('firebase-form').addEventListener('submit',async e=>{
 e.preventDefault();const bot=$('firebase-enter'),err=$('firebase-error');
 err.textContent='';bot.disabled=true;bot.textContent='Conectando...';
 try{
   await signInWithEmailAndPassword(auth,$('firebase-email').value.trim(),$('firebase-password').value);
   $('firebase-password').value='';
 }catch(ex){err.textContent='Não foi possível entrar. Verifique a conta, senha e configuração do Firebase Authentication.';}
 finally{bot.disabled=false;bot.textContent='Entrar no Firebase';}
});
$('firebase-logout').addEventListener('click',()=>signOut(auth));
onAuthStateChanged(auth,user=>{
 limpar();if(!user)return;
 autent=true;$('firebase-login').classList.add('hidden');$('firebase-authbar').classList.remove('hidden');$('firebase-dashboard').classList.remove('hidden');
 $('firebase-user').textContent=user.email||'Conta autorizada';conexao(false,'Aguardando dados da ESP32...');
 cancelStatus=onValue(ref(db,'dispositivos/varal-01/status'),snap=>{
   if(snap.exists())renderizar(snap.val());else conexao(false,'Sem dados no Firebase — configure ESP32');
 },e=>conexao(false,'Sem permissão para ler status (regras Firebase)'));
 cancelEvents=onValue(ref(db,'dispositivos/varal-01/eventos'),snap=>eventosTela(snap.val()),()=>eventosTela(null));
});
setInterval(()=>{if(autent&&statusAtual)renderizar(statusAtual);},5000);
refreshIcons();

// PWA completo em Firebase Hosting HTTPS: convite de instalação e cache estático.
(() => {
  const botao = document.getElementById('btn-install-pwa');
  if (!botao) return;
  let convite = null;
  window.addEventListener('beforeinstallprompt', evento => {
    evento.preventDefault();
    convite = evento;
    botao.classList.remove('hidden');
  });
  botao.addEventListener('click', async () => {
    if (!convite) return;
    const atual = convite;
    convite = null;
    botao.classList.add('hidden');
    await atual.prompt();
  });
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();
