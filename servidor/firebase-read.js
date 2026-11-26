// Firebase APENAS como fonte de dados enviados pela ESP32.
// Não utiliza Firebase Authentication para contas do site.
// A credencial de serviço fica SOMENTE no servidor, nunca no GitHub Pages.
let instancia;
export function createFirebaseReader(){
  return async function readTelemetry(tabela){
    if(!process.env.FIREBASE_SERVICE_ACCOUNT_JSON && !process.env.GOOGLE_APPLICATION_CREDENTIALS){
      throw Object.assign(new Error('Leitura da ESP32 não configurada. Defina a credencial de serviço do Firebase no servidor.'),{code:503});
    }
    if(!instancia){
      const {initializeApp,cert,applicationDefault,getApps}=await import('firebase-admin/app');
      const {getDatabase}=await import('firebase-admin/database');
      if(!getApps().length){
        const c=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        const credential=c?cert(JSON.parse(c)):applicationDefault();
        initializeApp({credential,databaseURL:process.env.FIREBASE_DATABASE_URL||'https://projeto-varal-ca245-default-rtdb.firebaseio.com'});
      }
      instancia=getDatabase();
    }
    const path=tabela==='eventos'?'dispositivos/varal-01/eventos':'dispositivos/varal-01/status';
    const snap=await instancia.ref(path).get();
    return snap.exists()?snap.val():null;
  };
}
