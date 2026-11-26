// R5H: cadastro e login PROPRIOS, sem SDK/Authentication do Firebase no navegador.
// O backend autentica a pessoa e devolve somente dados de monitoramento.
const $ = id => document.getElementById(id);
const base = String(window.VARAL_API_URL || '').replace(/\/+$/, '');
const hostNoGitHub = !location.hostname.toLowerCase().endsWith('.github.io');
const configurado = base.length > 0 || hostNoGitHub;
const tokenKey = 'varal_r5h_sessao';
let token = sessionStorage.getItem(tokenKey) || '';
let usuario = null, statusAtual = null, ultimoStatus = null, modoCadastro = false, timer = null;
const texto = (s, n=160) => String(s ?? '').slice(0,n);
const fmt = ms => {
  let t=Math.max(0,Math.floor((Number(ms)||0)/1000)),h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=t%60;
  return h ? `${h}h ${String(m).padStart(2,'0')}m` : `${m}m ${String(s).padStart(2,'0')}s`;
};
const icone = n => `<i data-lucide="${n}"></i>`;
const refreshIcons = () => {if(window.lucide)window.lucide.createIcons();};
function aviso(msg,classe='error'){
  const el=$('account-error');el.className='auth-message '+classe;el.textContent=msg;
}
function conexao(ok,msg){
  $('connection-badge').classList.toggle('online',ok);
  $('connection-badge').classList.toggle('offline',!ok);
  $('connection-text').textContent=msg;
}
function mudarModo(registrar){
  modoCadastro=registrar;
  $('tab-entrar').classList.toggle('active',!registrar);
  $('tab-cadastrar').classList.toggle('active',registrar);
  $('tab-entrar').setAttribute('aria-selected',String(!registrar));
  $('tab-cadastrar').setAttribute('aria-selected',String(registrar));
  $('confirm-label').classList.toggle('hidden',!registrar);
  $('account-confirm').required=registrar;
  $('account-password').setAttribute('autocomplete',registrar?'new-password':'current-password');
  $('account-submit').textContent=registrar?'Criar minha conta':'Entrar';
  $('auth-hint').textContent=registrar?'Sua senha precisa ter pelo menos 10 caracteres. Após cadastrar, você entrará automaticamente.':'Ainda não tem conta? Selecione “Criar conta”.';
  aviso('','ok');
}
async function api(path, options={}){
  if(!configurado) throw new Error('Configure a URL HTTPS do servidor em site_online/config.js antes de usar o GitHub Pages.');
  const headers={'Accept':'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...options.headers};
  if(token)headers['Authorization']='Bearer '+token;
  let response;
  try{
    response=await fetch(base+path,{...options,headers,cache:'no-store',mode:'cors'});
  }catch{
    throw new Error('Servidor de cadastro indisponível. Confira a URL HTTPS e se a API está ligada.');
  }
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const err = new Error(data.erro || ('Erro HTTP '+response.status));
    err.status=response.status;
    throw err;
  }
  return data;
}
function deslogar(mensagem=''){
  clearInterval(timer);timer=null;
  token='';usuario=null;statusAtual=null;ultimoStatus=null;
  sessionStorage.removeItem(tokenKey);
  $('account-dashboard').classList.add('hidden');
  $('account-authbar').classList.add('hidden');
  $('account-login').classList.remove('hidden');
  conexao(false,'Sem login');
  if(mensagem)aviso(mensagem);
}
function logado(conta,chave){
  token=chave;usuario=conta;
  sessionStorage.setItem(tokenKey,token);
  $('account-password').value='';$('account-confirm').value='';
  $('account-login').classList.add('hidden');
  $('account-authbar').classList.remove('hidden');
  $('account-dashboard').classList.remove('hidden');
  $('account-user').textContent=conta.email;
  conexao(false,'Consultando ESP32...');
  clearInterval(timer);
  atualizar();timer=setInterval(atualizar,5000);
}
$('tab-entrar').addEventListener('click',()=>mudarModo(false));
$('tab-cadastrar').addEventListener('click',()=>mudarModo(true));
$('account-form').addEventListener('submit',async evento=>{
  evento.preventDefault();
  const bot=$('account-submit');
  const email=$('account-email').value.trim();
  const senha=$('account-password').value;
  if(modoCadastro && senha!==$('account-confirm').value){aviso('As senhas não coincidem.');return;}
  bot.disabled=true;bot.textContent=modoCadastro?'Criando conta...':'Entrando...';aviso('','ok');
  try{
    const rota=modoCadastro?'/api/auth/cadastro':'/api/auth/entrar';
    const dados=await api(rota,{method:'POST',body:JSON.stringify({email,senha})});
    logado(dados.usuario,dados.token);
  }catch(e){aviso(e.message);}
  finally{bot.disabled=false;bot.textContent=modoCadastro?'Criar minha conta':'Entrar';}
});
$('account-logout').addEventListener('click',async()=>{
  try{await api('/api/auth/sair',{method:'POST'});}catch{}
  deslogar('Você saiu da sua conta.');
});
function eventosTela(val){
  const ui=$('event-logs');ui.replaceChildren();
  const linhas=Array.isArray(val?.eventos)?val.eventos:[];
  if(!linhas.length){const li=document.createElement('li');li.className='log-empty';li.textContent='Nenhum evento recente enviado pela ESP32.';ui.append(li);return;}
  linhas.slice(-18).reverse().forEach(e=>{
    const li=document.createElement('li'),a=document.createElement('span'),b=document.createElement('span');
    a.textContent=texto(e.texto);b.className='log-time';b.textContent='+'+fmt((Number(e.segundos)||0)*1000);
    li.append(a,b);ui.append(li);
  });
}
function renderizar(s){
  statusAtual=s;
  const idade=Date.now()-Number(s.atualizado_em||0);
  const recente=idade>=0&&idade<30000;
  const chuva=Boolean(s.chuva),pos=s.posicao||'intermediaria',mov=s.motor!=='parado',falha=Boolean(s.falha);
  conexao(recente,recente?'ESP32 sincronizada':'ESP32 sem atualização recente');
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
  $('command-feedback').textContent=!s.hardware_validado?'Hardware ainda não validado: não confiar nas leituras dos sensores.':recente?'Status recebido pelo servidor. Comandos físicos apenas na rede local.':'ESP32 sem atualização recente: verifique energia ou Wi-Fi.';
  refreshIcons();
}
async function atualizar(){
  if(!token)return;
  try{
    const status=await api('/api/status');
    if(status&&typeof status==='object'){ultimoStatus=status;renderizar(status);}
    const dados=await api('/api/eventos');
    eventosTela(dados);
  }catch(e){
    if(e.status===401){deslogar('Sua sessão expirou. Entre novamente.');return;}
    conexao(false,'Aguardando ESP32');
    $('command-feedback').textContent=e.message;
    if(!ultimoStatus){$('weather-updated').textContent='Sem dados disponíveis';$('varal-status').textContent='AGUARDANDO';}
  }
}
(async()=>{
  mudarModo(false);
  if(!configurado){aviso('Falta informar a URL do servidor em site_online/config.js para funcionar no GitHub Pages.');return;}
  if(!token)return;
  try{const d=await api('/api/auth/eu');logado(d.usuario,token);}
  catch{deslogar('Entre novamente para continuar.');}
})();
refreshIcons();
// PWA: apenas arquivos locais e estáticos em cache; nunca status, senha ou sessão.
(()=>{
  const b=$('btn-install-pwa');if(!b)return;
  let convite=null;
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();convite=e;b.classList.remove('hidden');});
  b.addEventListener('click',async()=>{if(!convite)return;const e=convite;convite=null;b.classList.add('hidden');await e.prompt();});
  if('serviceWorker' in navigator && window.isSecureContext){
    window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  }
})();
