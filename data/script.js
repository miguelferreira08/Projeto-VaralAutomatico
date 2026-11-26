// R5E: integracao real do site enviado pelo usuario com HTTP local da ESP32.
// Sem Firebase, sem conexao com internet; todo comando recebe resposta da ESP32.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const ui = {
    badge: $('connection-badge'), conn: $('connection-text'), mode: $('mode-badge'),
    position: $('varal-status'), sensor: $('sensor-status'),
    boxVaral: $('box-varal'), boxSensor: $('box-sensor'),
    progress: $('varal-progress'), percent: $('visualizer-percent'),
    main: $('btn-toggle-varal'), stop: $('btn-stop'), clearFault: $('btn-clear-fault'),
    automatic: $('check-auto'), msg: $('command-feedback'),
    log: $('event-logs'), clearLogs: $('btn-clear-logs'),
    rainTime: $('temp'), rainDesc: $('weather-desc'),
    rainValue: $('rain-prob'), motorValue: $('wind-speed'), updated: $('weather-updated'),
    openTime: $('tempo-aberto-24h'), closedTime: $('tempo-fechado-24h'),
    actions: $('sem-atual-aberto'), motorTime: $('sem-atual-fechado'),
    fc1: $('sem-ant-aberto'), fc2: $('sem-ant-fechado')
  };
  let estado = null;
  let conectado = false;
  let ocupada = false;
  let consultando = false;
  let seqEventos = -1;
  const API_TIMEOUT_MS = 2500;

  const textoSeguro = (s, max=200) => String(s ?? '').slice(0,max);
  function duracao(ms) {
    let s = Math.floor(Math.max(0,Number(ms)||0)/1000);
    const horas=Math.floor(s/3600);s%=3600;
    const min=Math.floor(s/60);const seg=s%60;
    return horas ? `${horas}h ${String(min).padStart(2,'0')}m` : `${min}m ${String(seg).padStart(2,'0')}s`;
  }
  function horaAtual() {
    const d=new Date();return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  function icone(nome) { return `<i data-lucide="${nome}"></i>`; }
  function atualizarIcones() { if(window.lucide) lucide.createIcons(); }
  function notificar(mensagem, erro=false) {
    ui.msg.textContent=textoSeguro(mensagem);
    ui.msg.style.color=erro?'#fca5a5':'';
    const container=$('toast-container');
    if(!container) return;
    const t=document.createElement('div'); t.className='toast'; t.textContent=textoSeguro(mensagem);
    container.appendChild(t);setTimeout(()=>t.remove(),3500);
  }
  async function requisitar(url, options={}) {
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),API_TIMEOUT_MS);
    try {
      const res=await fetch(url,{...options,cache:'no-store',signal:ctrl.signal});
      let data;
      try { data=await res.json(); } catch { throw new Error('Resposta inválida da ESP32'); }
      if (!res.ok || data.ok===false) throw new Error(textoSeguro(data.msg||'Comando recusado'));
      return data;
    } finally { clearTimeout(timer); }
  }
  function disponibilidade(atual) {
    conectado=atual;
    ui.badge.classList.toggle('online',atual);
    ui.badge.classList.toggle('offline',!atual);
    ui.conn.textContent=atual?'ESP32 conectada':'ESP32 desconectada';
    if(!atual){
      ui.main.disabled=true;ui.stop.disabled=true;ui.clearFault.disabled=true;ui.automatic.disabled=true;
      ui.position.textContent='Sem conexão';
      ui.updated.textContent='Sem dados recentes';
    }
  }
  function mostrar(s) {
    const pos=s.posicao, chuva=Boolean(s.chuva), mov=s.motor!=='parado', falha=Boolean(s.falha);
    const modo=s.modo;
    ui.position.textContent=falha?'FALHA':mov?(s.motor==='recolhendo'?'RECOLHENDO...':'ESTENDENDO...'):
      pos==='recolhidas'?'RECOLHIDO':pos==='estendidas'?'ESTENDIDO':pos==='conflito'?'CONFLITO DE SENSORES':'POSIÇÃO DESCONHECIDA';
    ui.boxVaral.className='status-box'+(falha?' is-fault':mov?' is-moving':pos==='recolhidas'?' is-closed':pos==='estendidas'?' is-open':'');
    ui.sensor.textContent=chuva?'CHUVA DETECTADA':'SECO';
    ui.boxSensor.className='status-box'+(chuva?' is-wet':'');
    ui.percent.textContent=pos==='recolhidas'?'0%':pos==='estendidas'?'100%':'--';
    ui.progress.style.width=pos==='recolhidas'?'0%':pos==='estendidas'?'100%':'0%';
    ui.mode.textContent=modo==='automatico'?'MODO AUTOMÁTICO':modo==='manual'?'MODO MANUAL':'PAUSADO';
    ui.mode.className='mode-tag'+(modo==='automatico'?'':' manual')+(modo==='pausado'?' paused':'');
    ui.automatic.checked=modo==='automatico';
    ui.automatic.disabled=ocupada||falha;
    ui.main.disabled=ocupada||falha;
    ui.stop.disabled=ocupada||(!mov&&modo==='pausado');
    ui.clearFault.disabled=ocupada||!falha;

    if(falha){
      ui.main.className='btn-primary-action btn-blocked';
      ui.main.innerHTML=icone('shield-alert')+'<span>FALHA: VERIFICAR ANTES DE OPERAR</span>';
      ui.msg.textContent=textoSeguro(s.erro);
    } else if(mov){
      ui.main.className='btn-primary-action btn-recolher';
      ui.main.innerHTML=icone('pause')+'<span>PARAR MOVIMENTO</span>';
    } else if(pos==='estendidas'||pos==='intermediaria'){
      ui.main.className='btn-primary-action btn-recolher';
      ui.main.innerHTML=icone('arrow-left-to-line')+'<span>RECOLHER VARAL</span>';
    } else if(chuva){
      ui.main.className='btn-primary-action btn-blocked';
      ui.main.innerHTML=icone('cloud-rain')+'<span>NÃO ESTENDER: CHUVA</span>';
      ui.main.disabled=true;
    } else {
      ui.main.className='btn-primary-action btn-estender';
      ui.main.innerHTML=icone('arrow-right-from-line')+'<span>ESTENDER VARAL</span>';
    }
    if(!falha && pos==='conflito') {ui.main.disabled=true;}
    if(!falha && !ocupada && pos==='intermediaria' && !mov && modo==='pausado') {
      // Recuperacao conservadora: recolher manualmente sob supervisao.
      ui.msg.textContent='Posição não identificada: recolha até o fim de curso, sob supervisão.';
    }
    ui.rainTime.textContent=chuva?'0':String(Math.floor(Number(s.seco_ms||0)/1000));
    ui.rainDesc.textContent=chuva?'Chuva presente no sensor':'Tempo contínuo sem chuva';
    ui.rainValue.textContent=chuva?'SIM':'NÃO';
    ui.motorValue.textContent=s.motor==='parado'?'PARADO':s.motor==='recolhendo'?'RECOLHENDO':'ESTENDENDO';
    ui.updated.textContent=`Atualizado às ${horaAtual()}`;
    ui.openTime.textContent=duracao(s.tempo_estendido_ms);
    ui.closedTime.textContent=duracao(s.tempo_recolhido_ms);
    ui.actions.textContent=`${Number(s.acionamentos||0)} acionamentos`;
    ui.motorTime.textContent=duracao(s.tempo_motor_ms);
    ui.fc1.textContent=`FC1: ${s.limite_recolhido?'ATIVO':'LIVRE'}`;
    ui.fc2.textContent=`FC2: ${s.limite_estendido?'ATIVO':'LIVRE'}`;
    atualizarIcones();
  }
  async function eventos() {
    try {
      const resposta=await requisitar('/api/eventos');
      const linhas=Array.isArray(resposta.eventos)?resposta.eventos:[];
      ui.log.replaceChildren();
      if(!linhas.length){
        const li=document.createElement('li');li.className='log-empty';li.textContent='Nenhum evento registrado nesta sessão.';ui.log.append(li);return;
      }
      linhas.slice(-18).reverse().forEach(ev=>{
        const li=document.createElement('li');
        const mensagem=document.createElement('span');mensagem.textContent=textoSeguro(ev.texto,150);
        const horario=document.createElement('span');horario.className='log-time';
        horario.textContent=`+${duracao((Number(ev.segundos)||0)*1000)}`;
        li.append(mensagem,horario);ui.log.append(li);
      });
    } catch { /* a tela de estado continua operacional */ }
  }
  async function ler() {
    if(consultando)return;consultando=true;
    try {
      const s=await requisitar('/api/status');
      const eraOffline=!conectado;
      estado=s;disponibilidade(true);mostrar(s);
      if(eraOffline && !s.falha) { ui.msg.textContent='ESP32 conectada. Faça os testes dos sensores antes de alimentar o motor.'; }
      if(eraOffline||s.event_seq!==seqEventos){seqEventos=s.event_seq;await eventos();}
    } catch {
      if(conectado) notificar('Comunicação com a ESP32 interrompida.',true);
      disponibilidade(false);estado=null;
    } finally { consultando=false; }
  }
  async function comando(acao) {
    if(!conectado||ocupada) return;
    ocupada=true;ui.main.disabled=true;ui.stop.disabled=true;ui.automatic.disabled=true;ui.clearFault.disabled=true;
    try {
      const ret=await requisitar('/api/cmd?acao='+encodeURIComponent(acao),{method:'POST'});
      notificar(ret.msg||'Comando aceito pela ESP32');
      await ler();
    } catch (e) {
      notificar(e.message||'Falha ao enviar comando',true);
      await ler();
    } finally {ocupada=false;if(estado&&conectado)mostrar(estado);}
  }
  ui.main.addEventListener('click',()=>{
    if(!estado)return;
    if(estado.motor!=='parado')return comando('parar');
    const alvo=estado.posicao==='estendidas'||estado.posicao==='intermediaria'?'recolher':'estender';
    return comando(alvo);
  });
  ui.stop.addEventListener('click',()=>comando('parar'));
  ui.clearFault.addEventListener('click',()=>comando('limpar'));
  ui.automatic.addEventListener('change',()=>comando(ui.automatic.checked?'automatico':'manual'));
  ui.clearLogs.addEventListener('click',async()=>{
    if(!conectado) return;
    await comando('limpar_historico');seqEventos=-1;await eventos();
  });
  if(window.lucide)lucide.createIcons();
  disponibilidade(false);
  ler();
  setInterval(ler,800);
})();

// PWA opcional: depende do suporte do navegador e de origem segura.
// Na rede local HTTP da ESP32 o controle funciona normalmente sem instalar PWA.
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
    const atual = convite; convite = null;
    botao.classList.add('hidden');
    await atual.prompt();
  });
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
})();
