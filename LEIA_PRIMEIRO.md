# Varal Inteligente — R5G | ESP32, Firebase e imagens do aplicativo

## O que mudou

- Preservei **o site R5F, seu layout e os comandos locais**; eles continuam usando `/api/status`, `/api/eventos` e `/api/cmd`, sem depender de internet.
- Adicionei Wi-Fi doméstico opcional **STA + AP**. A rede própria `Varal-SENAI` permanece funcionando.
- Adicionei um sincronizador **ESP32 → Firebase Realtime Database** via HTTPS/TLS e Firebase Authentication, sem enviar comandos da internet diretamente ao motor.
- Reintegrei a configuração exata do Firebase fornecida: projeto `projeto-varal-ca245`, RTDB `projeto-varal-ca245-default-rtdb.firebaseio.com`.
- O status é gravado em `dispositivos/varal-01/status`; os últimos eventos, em `dispositivos/varal-01/eventos`. Um espelho compatível com os campos do site antigo é escrito em `varal` (`status`, `posicao`, `chuva`, `sensor_chuva`, `modo_auto`, `motor`, `falha`).
- Incluí a interface web remota **Firebase Hosting**, com autenticação, atualização em tempo real e PWA HTTPS. Ela é **somente monitoramento**: o botão de acionar motor fica desabilitado por segurança.
- Adicionei as **duas imagens enviadas**: a primeira como logo do site, a segunda como arte do app e ícones PWA de 192/512 pixels. Os arquivos originais acompanham a entrega.

## IMPORTANTE — O Firebase ainda não está autenticado/ativado no hardware

O código Firebase está implementado, mas você forneceu **somente a configuração pública do projeto**. Faltam:
1. O SSID e a senha de uma rede Wi-Fi **2,4 GHz** com internet. Configurar em `include/secrets.h` (na sua cópia local; não compartilhar esse arquivo).
2. No **Firebase Console** > Authentication > Sign-in method, ativar **Email/Password** e criar uma conta **exclusiva para a ESP32** e uma conta **de usuário** para a página remota. Colocar os dados da conta ESP32 em `include/secrets.h`.
3. Obter os UIDs dessas duas contas em Authentication > Users e substituir `UID_ESP32` e `UID_PROPRIETARIO` no exemplo de regras `firebase_online/regras_rtdb_EXEMPLO.json`.
4. Rever essas regras com as regras já utilizadas no seu Firebase antes de publicá-las. **Não substitua cegamente todo o conjunto de regras existente**, pois pode afetar outros sistemas. Nunca libere `.read` / `.write` para `true` globalmente.
5. Somente depois de preencher e revisar, gravar o firmware R5G na ESP32 e executar a imagem LittleFS. Monitor Serial 115200 indica conexão/sincronização e IP do roteador.

Sem esses dados, a ESP32 **permanece funcionando localmente** como antes; ela **não sincroniza no Firebase**. Não há como eu afirmar que o Firebase já esteja recebendo dados sem essas configurações e testes reais.

## Arquivos

`platformio.ini` — projeto VS Code/PlatformIO; `src/main.cpp` — controle local + envio de telemetria; `include/config.h` — pinos e limites; `include/secrets.h` — **preencher localmente**; `include/firebase_public.h` — API key/RTDB públicos; `include/firebase_ca.h` — certificado de autoridade para HTTPS; `include/firebase_cloud.h` — sincronização HTTPS, executada em uma tarefa FreeRTOS separada; `data/` — site da ESP32, PWA opcional (HTTP local geralmente não é instalável); `firebase_online/public/` — site remoto (Firebase Hosting com HTTPS/PWA); `firebase_online/firebase.json` — configuração de Hosting; `firebase_online/regras_rtdb_EXEMPLO.json` — regras propostas, NÃO implantadas; `imagens_originais/` — arquivos enviados.

## Programar ESP32

1. Extraia o ZIP e abra a pasta `Varal_R5G_Firebase_ESP32` no VS Code.
2. Preencha `include/secrets.h` **somente se quiser usar o Firebase**. Para testar a parte local, deixe em branco.
3. Execute `PlatformIO > esp32dev > General > Build`. Depois, com a ESP32 ligada ao USB, execute `Upload`.
4. Execute também `PlatformIO > esp32dev > Platform > Upload Filesystem Image` para atualizar o visual e as imagens.
5. Reinicie com EN. Continue acessando `Varal-SENAI` (`http://192.168.4.1`). Se Wi-Fi doméstico estiver configurado, a placa também ficará acessível no IP do roteador (veja `monitor` em 115200), inclusive no PC conectado via Ethernet ao mesmo roteador.
6. Verifique `/api/status` e os eventos. Não alimente o motor até verificar sensores e relés; o timeout de 4s é provisório.
7. O código Firebase só transmite **estado**, não executa ações remotas; mesmo que a internet caia, a automação local segue funcionando no loop principal.

## Publicar a página Firebase com PWA/HTTPS

No PC, instale o Firebase CLI (`npm install -g firebase-tools`), faça `firebase login`, entre na pasta `firebase_online` e execute `firebase deploy --only hosting --project projeto-varal-ca245`. Antes, configure Firebase Authentication (conta de usuário e domínio autorizado) e regras RTDB. O **endereço HTTPS real só será conhecido após o deploy**. Nenhum site foi implantado automaticamente.

Na página online, entre com **a conta de usuário autorizada**, não com a conta da ESP32. A página exibe status ao vivo via `onValue`, mas não permite comandos físicos remotos. O PWA do Firebase Hosting usa HTTPS e pode ser instalado em navegadores compatíveis; no HTTP local `192.168.4.1` a instalação completa continua limitada.

## Segurança e limites

- A chave `apiKey` do Firebase é pública por natureza, mas **não autoriza** escrita; os UIDs e regras de segurança controlam o acesso.
- **Nunca** coloque a senha da conta Firebase ou do roteador em `firebase.js` ou nos arquivos enviados ao Hosting. Use `include/secrets.h` somente no firmware privado. Não publique a pasta completa com credenciais.
- HTTPS usa certificados raiz e verificação TLS; requer sincronização NTP na rede com internet.
- Os serviços HTTPS rodam numa tarefa separada do loop do motor; o envio não substitui o corte físico de energia nem o fusível.
- A ESP32 envia um campo `hardware_validado: false` até que você faça os testes de bancada e o habilite conscientemente em `include/secrets.h`.
- O espelho `varal` conserva os nomes do site antigo, mas **não torna a lógica de comando antigo (`comando`, escrita no banco) funcional**. O painel antigo também pode precisar de autenticação para funcionar sob regras seguras.
- A telemetria enviada é de **cada inicialização**; `aberto_24h` e outras métricas históricas semanais do projeto antigo não são artificialmente calculadas.
- As rotas HTTP de controle do site local não possuem login adicional: use apenas em **rede doméstica confiável**, não abra portas do roteador para a internet.
- A conexão ao Wi-Fi da ESP32 é local; o computador via Ethernet no mesmo roteador poderá acessar o IP STA após conectar a placa ao Wi-Fi doméstico.
- A autenticação e o upload para Firebase/Hosting **não foram testados no seu projeto real** porque não tenho credenciais de conta nem acesso à sua rede. Os testes locais de firmware existentes continuam válidos, com a parte Firebase pendente de ensaio.

### Caminho de status no Realtime Database

`dispositivos/varal-01/status` e `dispositivos/varal-01/eventos`.

### Correspondência com o banco anterior

`varal/status` = `ABERTO` / `FECHADO` / `INDEFINIDO`; `varal/chuva` = booleano; `varal/sensor_chuva` = `MOLHADO` ou `SECO`; `varal/modo_auto` = booleano. Outros campos antigos não são apagados pelo PATCH de compatibilidade.
