#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <LittleFS.h>
#include "config.h"
#include "secrets.h"
#include "firebase_cloud.h"

// R5G: seguranca principal independente do navegador e da rede.
// O motor NAO deve ser alimentado ate validar 3V3, relés, endstops,
// polaridades e sentido de movimento. Uso escolar supervisionado.

WebServer web(80);

enum class Modo : uint8_t { Pausado, Manual, Automatico };
enum class Direcao : uint8_t { Parado, Recolher, Estender };
Modo modo = Modo::Pausado; // partida segura: nenhum movimento antes de habilitar
Direcao motor = Direcao::Parado;
Direcao agendado = Direcao::Parado;
uint32_t agendadoEm = 0;
uint32_t motorIniciadoEm = 0;
uint32_t secoDesde = 0;
uint32_t ultimoContadorEm = 0;
bool saidaDoFcOrigem = true;
bool fcOrigemAtivo = false;
bool homingAuto = false;
bool falha = false;
String mensagemFalha;
uint32_t totalEstendidoMs = 0;
uint32_t totalRecolhidoMs = 0;
uint32_t totalMotorMs = 0;
uint32_t acionamentos = 0;

struct EntradaFiltrada {
  uint8_t pino;
  bool ativoLow;
  uint32_t filtroMs;
  bool ultimoBruto = false;
  bool ativo = false;
  uint32_t alterouEm = 0;
  EntradaFiltrada(uint8_t p, bool low, uint32_t ms) : pino(p), ativoLow(low), filtroMs(ms) {}
  void iniciar() {
    pinMode(pino, INPUT_PULLUP); // DO e OUT apenas em 3,3 V!
    ultimoBruto = digitalRead(pino) == (ativoLow ? LOW : HIGH);
    ativo = ultimoBruto;
    alterouEm = millis();
  }
  void atualizar(uint32_t agora) {
    bool leitura = digitalRead(pino) == (ativoLow ? LOW : HIGH);
    if (leitura != ultimoBruto) { ultimoBruto = leitura; alterouEm = agora; }
    if (ativo != ultimoBruto && (uint32_t)(agora - alterouEm) >= filtroMs) ativo = ultimoBruto;
  }
};
EntradaFiltrada chuva{PIN_CHUVA, CHUVA_ATIVA_EM_LOW, FILTRO_CHUVA_MS};
EntradaFiltrada fcRec{PIN_FC_RECOLHIDO, FC_RECOLHIDO_ATIVO_EM_LOW, FILTRO_FC_MS};
EntradaFiltrada fcEst{PIN_FC_ESTENDIDO, FC_ESTENDIDO_ATIVO_EM_LOW, FILTRO_FC_MS};

struct Evento {
  uint32_t id = 0;
  uint32_t segundos = 0;
  String texto;
};
constexpr uint8_t MAX_EVENTOS = 18;
Evento eventos[MAX_EVENTOS];
uint8_t quantidadeEventos = 0;
uint8_t posProximo = 0;
uint32_t sequenciaEventos = 0;

void registrar(const String& texto) {
  Evento& e = eventos[posProximo];
  e.id = ++sequenciaEventos;
  e.segundos = millis() / 1000UL;
  e.texto = texto;
  posProximo = (posProximo + 1) % MAX_EVENTOS;
  if (quantidadeEventos < MAX_EVENTOS) quantidadeEventos++;
  Serial.println("[R5G] " + texto);
}

const char* nomeModo() {
  if (modo == Modo::Automatico) return "automatico";
  if (modo == Modo::Manual) return "manual";
  return "pausado";
}
const char* nomeMotor() {
  if (motor == Direcao::Recolher) return "recolhendo";
  if (motor == Direcao::Estender) return "estendendo";
  return "parado";
}
const char* nomePosicao() {
  if (fcRec.ativo && fcEst.ativo) return "conflito";
  if (fcRec.ativo) return "recolhidas";
  if (fcEst.ativo) return "estendidas";
  return "intermediaria";
}

void desligarRele() {
  digitalWrite(PIN_RECOLHER, LOW); // BC337 em corte -> IN1 inativo
  digitalWrite(PIN_ESTENDER, LOW); // BC337 em corte -> IN2 inativo
  motor = Direcao::Parado;
}
void pararTudo() {
  agendado = Direcao::Parado;
  desligarRele();
}
void registrarFalha(const String& causa) {
  pararTudo();
  modo = Modo::Pausado;
  homingAuto = false;
  falha = true;
  mensagemFalha = causa;
  registrar("FALHA: " + causa);
}

// Prepara um sentido, deixando AMBOS os relés OFF durante o tempo morto.
void solicitar(Direcao destino, uint32_t agora) {
  if (falha) return;
  if (destino == Direcao::Parado) { pararTudo(); return; }
  if (destino == Direcao::Estender && chuva.ativo) return;
  if ((destino == Direcao::Recolher && fcRec.ativo) ||
      (destino == Direcao::Estender && fcEst.ativo)) {
    if (agendado != Direcao::Parado || motor != Direcao::Parado) pararTudo();
    return;
  }
  if (destino == motor || destino == agendado) return;
  desligarRele();
  agendado = destino;
  agendadoEm = agora;
}

void controle(uint32_t agora) {
  bool chuvaAntes = chuva.ativo;
  bool recAntes = fcRec.ativo;
  bool estAntes = fcEst.ativo;
  chuva.atualizar(agora);
  fcRec.atualizar(agora);
  fcEst.atualizar(agora);

  // Telemetria referente apenas ao periodo desde a ultima inicializacao.
  uint32_t dt = (uint32_t)(agora - ultimoContadorEm);
  ultimoContadorEm = agora;
  if (dt < 2000) { // ignora intervalo espurio em caso de travamento prolongado
    if (motor != Direcao::Parado) totalMotorMs += dt;
    else if (fcRec.ativo && !fcEst.ativo) totalRecolhidoMs += dt;
    else if (fcEst.ativo && !fcRec.ativo) totalEstendidoMs += dt;
  }

  if (chuvaAntes != chuva.ativo) registrar(chuva.ativo ? "Chuva detectada" : "Sensor seco");
  if (recAntes != fcRec.ativo && fcRec.ativo) registrar("Fim de curso: recolhido");
  if (estAntes != fcEst.ativo && fcEst.ativo) registrar("Fim de curso: estendido");
  if (chuva.ativo) secoDesde = 0;
  else if (secoDesde == 0) secoDesde = agora;

  if (fcRec.ativo && fcEst.ativo && !falha) registrarFalha("Dois fins de curso ativos simultaneamente");
  if (falha) return;

  // Independentemente do modo, NUNCA continuar estendendo quando chover.
  if (chuva.ativo && (motor == Direcao::Estender || agendado == Direcao::Estender)) {
    pararTudo();
    registrar("Estender interrompido pela chuva");
  }

  if (motor != Direcao::Parado) {
    bool chegou = (motor == Direcao::Recolher && fcRec.ativo) ||
                   (motor == Direcao::Estender && fcEst.ativo);
    if (chegou) {
      desligarRele();
      registrar("Motor parado no fim de curso");
    } else if ((uint32_t)(agora - motorIniciadoEm) >= TEMPO_MAX_MOTOR_MS) {
      registrarFalha("Tempo maximo de motor excedido");
      return;
    } else if (fcOrigemAtivo && !saidaDoFcOrigem) {
      bool origemContinuaAtiva = (motor == Direcao::Recolher) ? fcEst.ativo : fcRec.ativo;
      if (!origemContinuaAtiva) saidaDoFcOrigem = true;
      else if ((uint32_t)(agora - motorIniciadoEm) >= LIBERAR_FC_PARTIDA_MS) {
        registrarFalha("Fim de curso de partida nao liberado");
        return;
      }
    }
  }

  // Atualizar a intenção automática ANTES de ligar um motor agendado.
  // Prevenimos estender se a chuva apareceu durante o tempo morto.
  if (modo == Modo::Automatico) {
    if (chuva.ativo) {
      homingAuto = !fcRec.ativo;
      if (!fcRec.ativo) solicitar(Direcao::Recolher, agora);
    } else if (homingAuto) {
      if (fcRec.ativo) homingAuto = false;
      else solicitar(Direcao::Recolher, agora);
    } else if (fcRec.ativo && secoDesde != 0 &&
               (uint32_t)(agora - secoDesde) >= SECO_PARA_ESTENDER_MS) {
      solicitar(Direcao::Estender, agora);
    }
  }

  if (agendado != Direcao::Parado && motor == Direcao::Parado &&
      (uint32_t)(agora - agendadoEm) >= PAUSA_ENTRE_REVERTER_MS) {
    Direcao alvo = agendado;
    agendado = Direcao::Parado;
    if (alvo == Direcao::Recolher && fcRec.ativo) return;
    if (alvo == Direcao::Estender && (fcEst.ativo || chuva.ativo)) return;
    fcOrigemAtivo = alvo == Direcao::Recolher ? fcEst.ativo : fcRec.ativo;
    saidaDoFcOrigem = !fcOrigemAtivo;
    motorIniciadoEm = agora;
    // Saídas sempre exclusivas: nunca ligar K1 e K2 juntos.
    desligarRele();
    if (alvo == Direcao::Recolher) digitalWrite(PIN_RECOLHER, HIGH);
    else digitalWrite(PIN_ESTENDER, HIGH);
    motor = alvo;
    acionamentos++;
    registrar(alvo == Direcao::Recolher ? "Motor: recolhendo" : "Motor: estendendo");
  }
}

String jsonEsc(const String& s) {
  String r; r.reserve(s.length() + 8);
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c == '"' || c == '\\') { r += '\\'; r += c; }
    else if (c == '\n' || c == '\r') r += ' ';
    else if ((uint8_t)c >= 0x20) r += c;
  }
  return r;
}
void jsonResponse(int code, const String& json) {
  web.sendHeader("Cache-Control", "no-store, max-age=0");
  web.sendHeader("X-Content-Type-Options", "nosniff");
  web.send(code, "application/json; charset=utf-8", json);
}
void respostaComando(int code, bool ok, const String& msg) {
  jsonResponse(code, String("{\"ok\":") + (ok ? "true" : "false") +
               ",\"msg\":\"" + jsonEsc(msg) + "\"}");
}

String construirStatusJson() {
  uint32_t agora = millis();
  uint32_t secoMs = (!chuva.ativo && secoDesde != 0) ? (uint32_t)(agora - secoDesde) : 0;
  String out; out.reserve(540);
  out += "{\"revisao\":\"R5G\",\"chuva\":";
  out += chuva.ativo ? "true" : "false";
  out += ",\"limite_recolhido\":"; out += fcRec.ativo ? "true" : "false";
  out += ",\"limite_estendido\":"; out += fcEst.ativo ? "true" : "false";
  out += ",\"posicao\":\""; out += nomePosicao(); out += '"';
  out += ",\"motor\":\""; out += nomeMotor(); out += '"';
  out += ",\"modo\":\""; out += nomeModo(); out += '"';
  out += ",\"falha\":"; out += falha ? "true" : "false";
  out += ",\"erro\":\""; out += jsonEsc(mensagemFalha); out += '"';
  out += ",\"seco_ms\":"; out += String(secoMs);
  out += ",\"tempo_estendido_ms\":"; out += String(totalEstendidoMs);
  out += ",\"tempo_recolhido_ms\":"; out += String(totalRecolhidoMs);
  out += ",\"tempo_motor_ms\":"; out += String(totalMotorMs);
  out += ",\"acionamentos\":"; out += String(acionamentos);
  out += ",\"uptime_ms\":"; out += String(agora);
  out += ",\"event_seq\":"; out += String(sequenciaEventos);
  out += ",\"tempo_max_ms\":"; out += String(TEMPO_MAX_MOTOR_MS);
  out += ",\"hardware_validado\":"; out += HARDWARE_VALIDADO ? "true" : "false";
#ifndef VARAL_HOST_TEST
  out += ",\"wifi_cliente\":"; out += WiFi.status() == WL_CONNECTED ? "true" : "false";
  out += ",\"ip_rede\":\""; out += WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : String(""); out += "\"";
#else
  out += ",\"wifi_cliente\":false,\"ip_rede\":\"\"";
#endif
  out += "}";
  return out;
}
void apiStatus() { jsonResponse(200, construirStatusJson()); }

String construirEventosJson() {
  String out; out.reserve(2200);
  out = "{\"eventos\":[";
  uint8_t primeira = (posProximo + MAX_EVENTOS - quantidadeEventos) % MAX_EVENTOS;
  for (uint8_t i = 0; i < quantidadeEventos; i++) {
    const Evento& e = eventos[(primeira + i) % MAX_EVENTOS];
    if (i) out += ',';
    out += "{\"id\":"; out += String(e.id);
    out += ",\"segundos\":"; out += String(e.segundos);
    out += ",\"texto\":\""; out += jsonEsc(e.texto); out += "\"}";
  }
  out += "]}";
  return out;
}
void apiEventos() { jsonResponse(200, construirEventosJson()); }

String construirLegacyJson() {
  String pos = nomePosicao();
  String situacao = pos == "estendidas" ? "ABERTO" : pos == "recolhidas" ? "FECHADO" : "INDEFINIDO";
  String out = String("{\"status\":\"") + situacao + "\",\"posicao\":\"" + pos + "\"";
  out += ",\"chuva\":"; out += chuva.ativo ? "true" : "false";
  out += ",\"sensor_chuva\":\""; out += chuva.ativo ? "MOLHADO" : "SECO"; out += "\"";
  out += ",\"modo_auto\":"; out += modo == Modo::Automatico ? "true" : "false";
  out += ",\"motor\":\""; out += nomeMotor(); out += "\"";
  out += ",\"falha\":"; out += falha ? "true" : "false";
  out += ",\"hardware_validado\":"; out += HARDWARE_VALIDADO ? "true" : "false";
  out += "}"; return out;
}

void apiComando() {
  String acao = web.arg("acao");
  uint32_t agora = millis();
  if (acao == "parar") {
    pararTudo(); modo = Modo::Pausado; homingAuto = false;
    registrar("Parada solicitada pelo site");
    respostaComando(200, true, "Motor parado e automacao pausada"); return;
  }
  if (acao == "limpar") {
    pararTudo(); modo = Modo::Pausado; homingAuto = false;
    if (fcRec.ativo && fcEst.ativo) {
      respostaComando(409, false, "Conflito de sensores: verifique os dois fins de curso"); return;
    }
    falha = false; mensagemFalha = "";
    registrar("Falha limpa; sistema permanece pausado");
    respostaComando(200, true, "Falha limpa, motor desligado"); return;
  }
  if (acao == "limpar_historico") {
    quantidadeEventos = 0; posProximo = 0;
    respostaComando(200, true, "Historico visual limpo"); return;
  }
  if (falha) { respostaComando(409, false, "Falha ativa. Verifique e limpe antes de operar"); return; }
  if (acao == "automatico") {
    pararTudo(); modo = Modo::Automatico;
    homingAuto = !(fcRec.ativo || fcEst.ativo);
    secoDesde = chuva.ativo ? 0 : agora; // exige 60 s secos apos ativar
    registrar("Modo automatico ativado");
    respostaComando(200, true, "Modo automatico ativado"); return;
  }
  if (acao == "manual") {
    pararTudo(); modo = Modo::Manual; homingAuto = false;
    registrar("Modo manual ativado");
    respostaComando(200, true, "Modo manual ativado; motor parado"); return;
  }
  if (acao == "recolher") {
    modo = Modo::Manual; homingAuto = false;
    solicitar(Direcao::Recolher, agora);
    registrar("Comando manual: recolher");
    respostaComando(200, true, fcRec.ativo ? "Varal ja esta recolhido" : "Recolhimento solicitado"); return;
  }
  if (acao == "estender") {
    if (chuva.ativo) { respostaComando(409, false, "Chuva detectada: nao e permitido estender"); return; }
    modo = Modo::Manual; homingAuto = false;
    solicitar(Direcao::Estender, agora);
    registrar("Comando manual: estender");
    respostaComando(200, true, fcEst.ativo ? "Varal ja esta estendido" : "Extensao solicitada"); return;
  }
  respostaComando(400, false, "Comando desconhecido");
}

const char* tipoArquivo(const String& caminho) {
  if (caminho.endsWith(".html")) return "text/html; charset=utf-8";
  if (caminho.endsWith(".css")) return "text/css; charset=utf-8";
  if (caminho.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (caminho.endsWith(".json")) return "application/json; charset=utf-8";
  if (caminho.endsWith(".png")) return "image/png";
  if (caminho.endsWith(".jpg") || caminho.endsWith(".jpeg")) return "image/jpeg";
  if (caminho.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}
void servirArquivo() {
  String caminho = web.uri();
  if (caminho == "/") caminho = "/index.html";
  if (caminho.indexOf("..") >= 0 || caminho.indexOf('\\') >= 0) {
    web.send(400, "text/plain", "Caminho invalido"); return;
  }
  File arq = LittleFS.open(caminho, "r");
  if (!arq || arq.isDirectory()) {
    web.send(404, "text/plain", "Arquivo nao encontrado. Execute Upload Filesystem Image.");
    if (arq) arq.close();
    return;
  }
  web.sendHeader("Cache-Control", "no-store, max-age=0");
  web.sendHeader("X-Content-Type-Options", "nosniff");
  web.streamFile(arq, tipoArquivo(caminho));
  arq.close();
}

void setup() {
  // Inicializar saídas em OFF ANTES de iniciar Wi-Fi e WebServer.
  digitalWrite(PIN_RECOLHER, LOW);
  digitalWrite(PIN_ESTENDER, LOW);
  pinMode(PIN_RECOLHER, OUTPUT);
  pinMode(PIN_ESTENDER, OUTPUT);
  desligarRele();
  Serial.begin(115200);
  chuva.iniciar(); fcRec.iniciar(); fcEst.iniciar();
  uint32_t agora = millis();
  secoDesde = chuva.ativo ? 0 : agora;
  ultimoContadorEm = agora;
  registrar("R5G iniciada em modo PAUSADO");
  if (fcRec.ativo && fcEst.ativo) registrarFalha("Dois fins de curso ativos na inicializacao");

  if (!LittleFS.begin(false)) {
    Serial.println("ERRO: LittleFS nao montado. Grave o sistema de arquivos com Upload Filesystem Image.");
  }
  // AP sempre ativo; STA opcional no Wi-Fi domestico para Firebase e PC Ethernet.
#ifndef VARAL_HOST_TEST
  WiFi.mode(WIFI_AP_STA);
  WiFi.setAutoReconnect(true);
#else
  WiFi.mode(WIFI_AP);
#endif
  if (!WiFi.softAP(NOME_WIFI, SENHA_WIFI)) Serial.println("FALHA: ponto de acesso Wi-Fi nao iniciou");
  else { Serial.print("Site do varal: http://"); Serial.println(WiFi.softAPIP()); }
  web.on("/api/status", HTTP_GET, apiStatus);
  web.on("/api/eventos", HTTP_GET, apiEventos);
  web.on("/api/cmd", HTTP_POST, apiComando);
  web.onNotFound(servirArquivo);
  web.begin();
#ifndef VARAL_HOST_TEST
  if (WIFI_CASA_SSID[0]) {
    WiFi.begin(WIFI_CASA_SSID, WIFI_CASA_SENHA);
    Serial.println("[Wi-Fi] tentando conectar ao roteador, sem interromper o AP.");
  }
#endif
  iniciarFirebaseCloud();
  registrar("Servidor HTTP iniciado");
}

void loop() {
  uint32_t agora = millis();
  controle(agora);          // o controle nao depende do navegador aberto
  web.handleClient();      // interface local: 192.168.4.1 e, se configurado, IP do roteador
#ifndef VARAL_HOST_TEST
  static bool wifiCasaAntes = false;
  bool wifiCasaAgora = WiFi.status() == WL_CONNECTED;
  if (wifiCasaAgora && !wifiCasaAntes) {
    Serial.print("[Wi-Fi] Acesse tambem pelo roteador: http://");
    Serial.println(WiFi.localIP().toString());
  }
  if (!wifiCasaAgora && wifiCasaAntes) Serial.println("[Wi-Fi] rede domestica desconectada. AP local continua funcionando.");
  wifiCasaAntes = wifiCasaAgora;
  static uint32_t ultimoCloud = 0;
  if ((uint32_t)(agora - ultimoCloud) >= FIREBASE_INTERVALO_MS) {
    ultimoCloud = agora;
    enfileirarFirebaseCloud(construirStatusJson(), construirLegacyJson(), construirEventosJson(), sequenciaEventos);
  }
#endif
  delay(2);
}
