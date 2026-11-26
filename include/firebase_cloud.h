#pragma once
// R5G: replicacao de status ao Firebase Realtime Database.
// Executa em uma tarefa FreeRTOS separada do loop de controle local.
// Requer Wi-Fi domestico, horario NTP e Firebase Authentication configurados.
#ifdef VARAL_HOST_TEST
inline void iniciarFirebaseCloud() {}
inline void enfileirarFirebaseCloud(const String&, const String&, const String&, uint32_t) {}
#else
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>
#include "secrets.h"
#include "firebase_public.h"
#include "firebase_ca.h"

struct CloudPacote {
  char status[1100];
  char legado[400];
  char eventos[4800];
  uint32_t sequencia;
};
static QueueHandle_t filaFirebase = nullptr;
static bool firebaseLigado = false;

static String obterCampoStringJson(const String& corpo, const char* nome) {
  // O Firebase Auth devolve os tokens como strings JSON sem escapes internos.
  String chave = String("\"") + nome + "\"";
  int inicio = corpo.indexOf(chave);
  if (inicio < 0) return "";
  inicio = corpo.indexOf(':', inicio + chave.length());
  if (inicio < 0) return "";
  inicio++;
  while (inicio < (int)corpo.length() && (corpo[inicio] == ' ' || corpo[inicio] == '\n')) inicio++;
  if (inicio >= (int)corpo.length() || corpo[inicio] != '"') return "";
  inicio++;
  int fim = corpo.indexOf('"', inicio);
  if (fim < 0) return "";
  return corpo.substring(inicio, fim);
}
static String escaparJsonCloud(const String& original) {
  String out;
  out.reserve(original.length() + 8);
  for (size_t i = 0; i < original.length(); i++) {
    char c = original[i];
    if (c == '"' || c == '\\') { out += '\\'; out += c; }
    else if (c == '\n' || c == '\r') out += ' ';
    else if ((uint8_t)c >= 0x20) out += c;
  }
  return out;
}
static int enviarHttps(const String& url, const String& metodo, const String& corpo, String* resposta) {
  WiFiClientSecure tls;
  tls.setCACert(FIREBASE_ROOT_CAS);
  tls.setTimeout(2500);
  HTTPClient http;
  http.setTimeout(2500);
  if (!http.begin(tls, url)) return -1;
  http.addHeader("Content-Type", "application/json");
  int codigo = metodo == "POST" ? http.POST(corpo) : metodo == "PATCH" ? http.sendRequest("PATCH", corpo) : http.PUT(corpo);
  if (resposta && codigo > 0) *resposta = http.getString();
  http.end();
  return codigo;
}
static String autenticarFirebase() {
  String corpo = "{\"email\":\"" + escaparJsonCloud(FIREBASE_EMAIL_DISPOSITIVO) +
    "\",\"password\":\"" + escaparJsonCloud(FIREBASE_SENHA_DISPOSITIVO) +
    "\",\"returnSecureToken\":true}";
  String resposta;
  int code = enviarHttps(String("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=")+
    FIREBASE_API_KEY, "POST", corpo, &resposta);
  if (code != 200) {
    Serial.printf("[Firebase] autenticacao nao concluida (HTTP %d). Verifique conta, senha e TLS.\n",code);
    return "";
  }
  return obterCampoStringJson(resposta, "idToken");
}
static String acrescentarHorarioServidor(const String& json) {
  if (!json.endsWith("}")) return json;
  return json.substring(0, json.length()-1) + ",\"atualizado_em\":{\".sv\":\"timestamp\"}}";
}
static void tarefaFirebase(void* _) {
  String idToken;
  uint32_t autenticadoEm = 0;
  uint32_t ultimaSequenciaEnviada = UINT32_MAX;
  static CloudPacote pacote{};
  for (;;) {
    if (xQueueReceive(filaFirebase, &pacote, portMAX_DELAY) != pdTRUE) continue;
    if (WiFi.status() != WL_CONNECTED || time(nullptr) < 1700000000) continue;
    if (idToken.length() == 0 || (uint32_t)(millis() - autenticadoEm) > 45UL*60UL*1000UL) {
      idToken = autenticarFirebase();
      autenticadoEm = millis();
      if (idToken.length() == 0) continue;
    }
    String url = String(FIREBASE_DATABASE_URL) + "/dispositivos/" + FIREBASE_DEVICE_ID;
    String authQuery = String(".json?auth=") + idToken;
    int cod = enviarHttps(url + "/status" + authQuery, "PUT", acrescentarHorarioServidor(pacote.status), nullptr);
    if (cod == 401 || cod == 403) { idToken = ""; Serial.printf("[Firebase] negado (%d): verificar regras RTDB/UID.\n",cod); continue; }
    if (cod < 200 || cod >= 300) {
      Serial.printf("[Firebase] status nao sincronizado (HTTP %d).\n",cod);
      continue;
    }
    // Compatibilidade com o antigo site, que lia /varal/status, /varal/chuva e /varal/modo_auto.
    int legadoCod = enviarHttps(String(FIREBASE_DATABASE_URL)+"/varal"+authQuery, "PATCH", acrescentarHorarioServidor(pacote.legado), nullptr);
    if (legadoCod < 200 || legadoCod >= 300) Serial.printf("[Firebase] espelho antigo nao atualizado (%d).\n",legadoCod);
    if (pacote.sequencia != ultimaSequenciaEnviada) {
      int eventosCod = enviarHttps(url + "/eventos" + authQuery, "PUT", pacote.eventos, nullptr);
      if (eventosCod >= 200 && eventosCod < 300) ultimaSequenciaEnviada = pacote.sequencia;
    }
    Serial.println("[Firebase] status atualizado.");
  }
}
inline void iniciarFirebaseCloud() {
  if (!WIFI_CASA_SSID[0] || !FIREBASE_EMAIL_DISPOSITIVO[0] || !FIREBASE_SENHA_DISPOSITIVO[0]) {
    Serial.println("[Firebase] offline: preencher Wi-Fi e conta de dispositivo em include/secrets.h");
    return;
  }
  filaFirebase = xQueueCreate(1,sizeof(CloudPacote));
  if (!filaFirebase) { Serial.println("[Firebase] nao foi possivel reservar fila."); return; }
  configTime(0, 0, "time.google.com", "pool.ntp.org");
  if (xTaskCreatePinnedToCore(tarefaFirebase, "firebase-sync", 12288, nullptr, 1, nullptr, 0) != pdPASS) {
    vQueueDelete(filaFirebase); filaFirebase=nullptr;
    Serial.println("[Firebase] erro ao iniciar tarefa."); return;
  }
  firebaseLigado = true;
  Serial.println("[Firebase] tarefa iniciada; aguardando Wi-Fi e horario NTP.");
}
inline void enfileirarFirebaseCloud(const String& status, const String& legado, const String& eventos, uint32_t seq) {
  if (!firebaseLigado || !filaFirebase) return;
  static CloudPacote pacote{};
  status.toCharArray(pacote.status, sizeof(pacote.status));
  legado.toCharArray(pacote.legado, sizeof(pacote.legado));
  eventos.toCharArray(pacote.eventos, sizeof(pacote.eventos));
  // Envio sem espera; o controle do motor nao aguarda Firebase ou internet.
  pacote.sequencia = seq;
  xQueueOverwrite(filaFirebase, &pacote);
}
#endif
