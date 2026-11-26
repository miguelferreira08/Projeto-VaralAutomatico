from playwright.sync_api import sync_playwright
from pathlib import Path
from bs4 import BeautifulSoup
root=Path(__file__).resolve().parent.parent/'data'
soup=BeautifulSoup((root/'index.html').read_text(),'html.parser')
for n in soup.find_all('script'):n.decompose()
for n in soup.find_all('link'):
 if n.get('rel') and ('stylesheet' in n.get('rel') or 'icon' in n.get('rel') or 'manifest' in n.get('rel')):n.decompose()
html='<!doctype html>'+str(soup)
mock=r'''(()=>{
 window.__mock={revisao:'R5E',chuva:false,limite_recolhido:true,limite_estendido:false,posicao:'recolhidas',motor:'parado',modo:'pausado',falha:false,erro:'',seco_ms:71000,tempo_estendido_ms:25000,tempo_recolhido_ms:90000,tempo_motor_ms:5000,acionamentos:2,uptime_ms:112000,event_seq:1,tempo_max_ms:4000};
 window.__events=[{id:1,segundos:2,texto:'ESP32 inicializada'}];window.__commands=[];
 window.fetch=async (url,opts={})=>{
   const acao=(String(url).match(/[?&]acao=([^&]+)/)||[])[1];
   if(String(url).includes('/api/cmd')){
    const s=window.__mock;
    const cmd=decodeURIComponent(acao||'');window.__commands.push(cmd);
    if(cmd==='estender'){
     if(s.chuva)return {ok:false,json:async()=>({ok:false,msg:'Chuva detectada'})};
     s.posicao='estendidas';s.limite_recolhido=false;s.limite_estendido=true;s.modo='manual';
    } else if(cmd==='recolher'){s.posicao='recolhidas';s.limite_recolhido=true;s.limite_estendido=false;s.modo='manual';}
    else if(cmd==='automatico'){s.modo='automatico';}
    else if(cmd==='manual'){s.modo='manual';}
    else if(cmd==='parar'){s.modo='pausado';s.motor='parado';}
    else if(cmd==='limpar'){s.falha=false;s.erro='';s.modo='pausado';}
    else if(cmd==='limpar_historico'){window.__events=[];s.event_seq++;return {ok:true,json:async()=>({ok:true,msg:'Histórico limpo'})};}
    s.event_seq++;
    window.__events.push({id:s.event_seq,segundos:15,texto:'Comando '+cmd});
    return {ok:true,json:async()=>({ok:true,msg:'Comando '+cmd+' aceito'})};
   }
   if(String(url).includes('/api/eventos'))return {ok:true,json:async()=>({eventos:window.__events})};
   if(String(url).includes('/api/status'))return {ok:true,json:async()=>({...window.__mock})};
   throw Error('Unexpected URL '+url);
 };
})();'''
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=__import__('shutil').which('chromium') or __import__('shutil').which('google-chrome') or None,args=['--no-sandbox'])
 for width,height in [(1440,960),(390,850)]:
  ctx=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=1)
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html)
  page.add_style_tag(content=(root/'style.css').read_text())
  page.evaluate(mock)
  page.add_script_tag(content=(root/'icons.js').read_text())
  page.add_script_tag(content=(root/'script.js').read_text())
  page.wait_for_function("document.querySelector('#connection-text').textContent==='ESP32 conectada'",timeout=9000)
  assert page.locator('#varal-status').inner_text()=='RECOLHIDO'
  assert page.locator('#sensor-status').inner_text()=='SECO'
  assert page.locator('#sem-atual-aberto').inner_text()=='2 acionamentos'
  assert page.locator('#tempo-aberto-24h').inner_text()=='0m 25s'
  assert page.locator('#btn-toggle-varal').is_enabled()
  assert page.locator('#check-auto').is_enabled()
  assert page.locator('#btn-clear-fault').is_disabled()
  name='desktop' if width>900 else 'mobile'
  # Capturas desativadas: teste automatizado não escreve imagens no projeto
  if width>900:
   page.locator('#btn-toggle-varal').click()
   page.wait_for_function("document.querySelector('#varal-status').textContent==='ESTENDIDO'",timeout=7000)
   assert page.evaluate('window.__commands.at(-1)')=='estender'
   page.locator('#btn-toggle-varal').click()
   page.wait_for_function("document.querySelector('#varal-status').textContent==='RECOLHIDO'",timeout=7000)
   assert page.evaluate('window.__commands.at(-1)')=='recolher'
   page.locator('label.switch-row').click()
   page.wait_for_function("document.querySelector('#mode-badge').textContent==='MODO AUTOMÁTICO'",timeout=7000)
   assert page.evaluate('window.__commands.at(-1)')=='automatico'
   page.locator('#btn-stop').click()
   page.wait_for_function("document.querySelector('#mode-badge').textContent==='PAUSADO'",timeout=7000)
   assert page.evaluate('window.__commands.at(-1)')=='parar'
   page.evaluate("window.__mock.chuva=true;window.__mock.modo='manual'")
   page.wait_for_function("document.querySelector('#sensor-status').textContent==='CHUVA DETECTADA'",timeout=7000)
   assert page.locator('#btn-toggle-varal').is_disabled()
   page.evaluate("window.__mock.falha=true;window.__mock.erro='Dois fins de curso ativos';window.__mock.chuva=false")
   page.wait_for_function("document.querySelector('#varal-status').textContent==='FALHA'",timeout=7000)
   assert page.locator('#btn-clear-fault').is_enabled()
   page.locator('#btn-clear-fault').click()
   page.wait_for_function("document.querySelector('#varal-status').textContent==='RECOLHIDO'",timeout=7000)
   page.locator('#btn-clear-logs').click()
   page.wait_for_function("document.querySelector('.event-log-list .log-empty')",timeout=7000)
   assert page.evaluate('window.__commands.at(-1)')=='limpar_historico'
   print('testes interação:',page.evaluate('window.__commands'))
  overflow=page.evaluate('document.documentElement.scrollWidth > window.innerWidth + 1')
  print(name,'console errors',errors,'overflow',overflow,'width',page.evaluate('document.documentElement.scrollWidth'))
  assert not errors and not overflow
  ctx.close()
 browser.close()
print('INTERFACE TESTS OK')
