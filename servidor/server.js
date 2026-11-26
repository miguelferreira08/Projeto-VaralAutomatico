import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {AuthStore} from './auth-store.js';
import {createFirebaseReader} from './firebase-read.js';

const dir = resolve(fileURLToPath(new URL('.',import.meta.url)));
const staticDir = resolve(dir,'../site_online');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'};
function json(res,code,value){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(JSON.stringify(value));}
function bodyJSON(req){
  return new Promise((ok,fail)=>{
    const parts=[];let size=0;
    req.on('data',c=>{size+=c.length;if(size>8192){fail(Object.assign(new Error('Requisição muito grande.'),{code:413}));req.destroy();return;}parts.push(c);});
    req.on('end',()=>{try{ok(JSON.parse(Buffer.concat(parts).toString('utf8')));}catch{fail(Object.assign(new Error('JSON inválido.'),{code:400}));}});
    req.on('error',fail);
  });
}
export function createServer({store,readTelemetry,allowedOrigins=[],frontend=staticDir}={}){
  if(!store||!readTelemetry)throw new Error('Dependências do servidor ausentes');
  const attempts = new Map();
  let lastClean = 0;
  function throttle(ip){
    const now=Date.now(), previous=attempts.get(ip)||[];
    const recent=previous.filter(t=>now-t<15*60*1000);
    if(recent.length>=12){attempts.set(ip,recent);return true;}
    recent.push(now);attempts.set(ip,recent);
    if(attempts.size>2000)attempts.clear();
    return false;
  }
  return http.createServer(async(req,res)=>{
    let pathname;
    try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{return json(res,400,{erro:'Endereço inválido.'});}
    const origin=req.headers.origin;
    if(origin){
      const sameHost = (()=>{try{return new URL(origin).host === req.headers.host;}catch{return false;}})();
      if(allowedOrigins.includes(origin) || sameHost){
        res.setHeader('Access-Control-Allow-Origin',origin);
        res.setHeader('Vary','Origin');
        res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
        res.setHeader('Access-Control-Max-Age','600');
      }else if(pathname.startsWith('/api/')){
        return json(res,403,{erro:'Origem não autorizada.'});
      }
    }
    if(req.method==='OPTIONS'&&pathname.startsWith('/api/')){res.writeHead(204);return res.end();}
    if(pathname.startsWith('/api/')){
      const mt=req.method;
      if(Date.now()-lastClean>3600000){store.limparExpiradas();lastClean=Date.now();}
      try{
        if(pathname==='/api/saude'&&mt==='GET')return json(res,200,{ok:true,servico:'Varal R5H',autenticacao:'contas locais'});
        const authPath=pathname==='/api/auth/entrar'||pathname==='/api/auth/cadastro';
        if(authPath&&mt==='POST'){
          // limite por origem/IP; mantém senhas protegidas contra tentativas em massa básicas.
          const ip=req.socket.remoteAddress||'unknown';
          if(throttle(ip))return json(res,429,{erro:'Muitas tentativas. Tente novamente mais tarde.'});
          const d=await bodyJSON(req);
          if(!d||typeof d!=='object')return json(res,400,{erro:'Dados inválidos.'});
          const result=pathname==='/api/auth/cadastro'?store.cadastro(d.email,d.senha):store.entrar(d.email,d.senha);
          return json(res,pathname==='/api/auth/cadastro'?201:200,result);
        }
        const match=/^Bearer ([0-9a-f]{64})$/.exec(req.headers.authorization||'');
        const token=match?.[1];
        const user=store.autenticar(token);
        if(!user)return json(res,401,{erro:'Sessão inválida ou expirada. Entre novamente.'});
        if(pathname==='/api/auth/eu'&&mt==='GET')return json(res,200,{usuario:user});
        if(pathname==='/api/auth/sair'&&mt==='POST'){store.sair(token);return json(res,200,{ok:true});}
        if(pathname==='/api/status'&&mt==='GET'){
          const val=await readTelemetry('status');
          if(!val)return json(res,404,{erro:'A ESP32 ainda não enviou status ao banco.'});
          return json(res,200,val);
        }
        if(pathname==='/api/eventos'&&mt==='GET'){
          const val=await readTelemetry('eventos');
          return json(res,200,{eventos:Array.isArray(val?.eventos)?val.eventos:Array.isArray(val)?val:[]});
        }
        return json(res,404,{erro:'Rota não encontrada.'});
      }catch(e){
        const status=Number(e?.code)||500;
        const code=[400,401,409,413,429,503].includes(status)?status:500;
        if(code===500)console.error('[API]',e);
        return json(res,code,{erro:code===500?'Erro interno do servidor.':e.message});
      }
    }
    if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{erro:'Método não permitido.'});
    const frontendRoot=resolve(frontend);
    // Nunca exponha arquivos de credenciais, a pasta de banco ou o firmware.
    const relative=pathname==='/'?'/index.html':pathname;
    const filename=resolve(frontendRoot,'.'+relative);
    if(filename!==frontendRoot&&!filename.startsWith(frontendRoot+sep))return json(res,403,{erro:'Acesso negado.'});
    const ending=extname(filename);
    const target=ending?filename:join(filename,'index.html');
    try{
      const bytes=await readFile(target);
      res.writeHead(200,{'Content-Type':mime[extname(target)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
      return req.method==='HEAD'?res.end():res.end(bytes);
    }catch{return json(res,404,{erro:'Arquivo não encontrado.'});}
  });
}
export function start(){
  const filename=resolve(process.env.DATABASE_PATH||join(dir,'storage','contas.sqlite'));
  const store=new AuthStore(filename);
  const origins=(process.env.ALLOWED_ORIGINS||'https://miguelferreira08.github.io,http://localhost:3000,http://127.0.0.1:3000').split(',').map(s=>s.trim()).filter(Boolean);
  const server=createServer({store,readTelemetry:createFirebaseReader(),allowedOrigins:origins});
  const port=Number(process.env.PORT||3000);
  server.listen(port,'0.0.0.0',()=>console.log(`Varal R5H: http://localhost:${port}`));
  const shutdown=()=>server.close(()=>{store.fechar();process.exit(0);});
  process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
  return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))start();
