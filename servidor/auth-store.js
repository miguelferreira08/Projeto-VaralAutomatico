// Contas proprias do R5H. NENHUMA senha ou sessao fica no Firebase.
// Requer Node.js 22+ (node:sqlite).
import {DatabaseSync} from 'node:sqlite';
import {randomBytes, scryptSync, timingSafeEqual, createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
const HASH_BYTES = 64;
const TTL_MS = 12 * 60 * 60 * 1000;
const emailValido = email => typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const normalizar = email => String(email || '').trim().toLowerCase();
const hashToken = token => createHash('sha256').update(token).digest('hex');
function gerarHash(senha,salt){return scryptSync(senha,Buffer.from(salt,'hex'),HASH_BYTES,{N:16384,r:8,p:1,maxmem:32*1024*1024}).toString('hex');}
export class AuthStore {
  constructor(filename){
    mkdirSync(dirname(filename),{recursive:true,mode:0o700});
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, hash TEXT NOT NULL, criado_em INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessoes (token_hash TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id), expira_em INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS sessoes_expira_em ON sessoes(expira_em);`);
  }
  cadastro(email,senha){
    email=normalizar(email);
    if(!emailValido(email))throw Object.assign(new Error('Informe um e-mail válido.'),{code:400});
    if(typeof senha !== 'string'||senha.length<10||senha.length>128)throw Object.assign(new Error('A senha precisa ter entre 10 e 128 caracteres.'),{code:400});
    const existe=this.db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
    if(existe)throw Object.assign(new Error('Este e-mail já possui cadastro.'),{code:409});
    const salt=randomBytes(16).toString('hex');
    const hash=gerarHash(senha,salt);
    try{this.db.prepare('INSERT INTO usuarios(email,salt,hash,criado_em) VALUES(?,?,?,?)').run(email,salt,hash,Date.now());}
    catch(e){if(String(e).includes('UNIQUE'))throw Object.assign(new Error('Este e-mail já possui cadastro.'),{code:409});throw e;}
    return this.entrar(email,senha);
  }
  entrar(email,senha){
    const usuario=this.db.prepare('SELECT id,email,salt,hash FROM usuarios WHERE email = ?').get(normalizar(email));
    // Tempo semelhante para conta inexistente: reduz a facilidade de descobrir e-mails.
    const salt=usuario?.salt || '00000000000000000000000000000000';
    const esperado=Buffer.from(usuario?.hash || '00'.repeat(HASH_BYTES),'hex');
    const recebido=Buffer.from(gerarHash(typeof senha==='string'?senha:'',salt),'hex');
    if(!usuario||!timingSafeEqual(esperado,recebido))throw Object.assign(new Error('E-mail ou senha incorretos.'),{code:401});
    const token=randomBytes(32).toString('hex');
    this.db.prepare('INSERT INTO sessoes(token_hash,usuario_id,expira_em) VALUES(?,?,?)').run(hashToken(token),usuario.id,Date.now()+TTL_MS);
    return {token,usuario:{id:usuario.id,email:usuario.email}};
  }
  autenticar(token){
    if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return null;
    const conta=this.db.prepare(`SELECT u.id,u.email FROM sessoes s JOIN usuarios u ON s.usuario_id=u.id WHERE s.token_hash=? AND s.expira_em > ?`).get(hashToken(token),Date.now());
    return conta?{id:conta.id,email:conta.email}:null;
  }
  sair(token){if(typeof token==='string'&&/^[a-f0-9]{64}$/.test(token))this.db.prepare('DELETE FROM sessoes WHERE token_hash=?').run(hashToken(token));}
  limparExpiradas(){this.db.prepare('DELETE FROM sessoes WHERE expira_em <= ?').run(Date.now());}
  fechar(){this.db.close();}
}
