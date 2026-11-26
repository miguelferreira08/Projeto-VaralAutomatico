// Simulador de logica: compila o firmware como C++11 com stubs Arduino.
// NAO e compilacao real ESP32 nem comprova eletrica/sensores/relés.
#include <array>
#include <cassert>
#include <iostream>
#include "../src/main.cpp"

static uint32_t agoraMs=10;
static std::array<int,40> leituras;
static std::array<int,40> saidas;
static String comando;
static int ultimaResposta=0;

uint32_t millis(){return agoraMs;}
void delay(unsigned int x){agoraMs+=x;}
void pinMode(uint8_t,uint8_t){}
void digitalWrite(uint8_t p,int v){saidas[p]=v;}
int digitalRead(uint8_t p){return leituras[p];}
void SerialClass::begin(unsigned long){}
void SerialClass::println(const String&){}
void SerialClass::println(const char*){}
void SerialClass::print(const char*){}
SerialClass Serial;
void WiFiClass::mode(int){}
bool WiFiClass::softAP(const char*,const char*){return true;}
const char* WiFiClass::softAPIP(){return "192.168.4.1";}
WiFiClass WiFi;
File::operator bool()const{return false;}
bool File::isDirectory()const{return false;}
void File::close(){}
bool LittleFSClass::begin(bool){return false;}
File LittleFSClass::open(const String&,const char*){return File{};}
LittleFSClass LittleFS;
WebServer::WebServer(int){}
void WebServer::on(const char*,int,void(*)()){}
void WebServer::onNotFound(void(*)()){}
void WebServer::begin(){}
void WebServer::handleClient(){}
String WebServer::arg(const char*){return comando;}
String WebServer::uri(){return "/";}
void WebServer::sendHeader(const char*,const char*){}
void WebServer::send(int code,const char*,const String&){ultimaResposta=code;}
void WebServer::send(int code,const char*,const char*){ultimaResposta=code;}
size_t WebServer::streamFile(File&,const char*){return 0;}
void tick(uint32_t dt){agoraMs+=dt;controle(agoraMs);assert(!(saidas[PIN_RECOLHER]==HIGH && saidas[PIN_ESTENDER]==HIGH));}
void cmd(const char* acao){comando=acao;apiComando();}
void change(uint8_t pin,int value,uint32_t filtro){leituras[pin]=value;tick(1);tick(filtro+2);}
int main(){
  leituras.fill(HIGH); saidas.fill(LOW);
  leituras[PIN_FC_ESTENDIDO]=LOW; // inicialmente estendido
  setup();
  assert(modo==Modo::Pausado&&saidas[PIN_RECOLHER]==LOW&&saidas[PIN_ESTENDER]==LOW);
  // Teste 1: chuva no AUTOMATICO -> recolher via K1 somente
  cmd("automatico");assert(ultimaResposta==200);
  change(PIN_CHUVA,LOW,FILTRO_CHUVA_MS);tick(PAUSA_ENTRE_REVERTER_MS+5);
  assert(saidas[PIN_RECOLHER]==HIGH && saidas[PIN_ESTENDER]==LOW);
  change(PIN_FC_ESTENDIDO,HIGH,FILTRO_FC_MS);
  change(PIN_FC_RECOLHIDO,LOW,FILTRO_FC_MS);
  assert(saidas[PIN_RECOLHER]==LOW && saidas[PIN_ESTENDER]==LOW);
  // Teste 2: so estende apos 60 segundos secos
  change(PIN_CHUVA,HIGH,FILTRO_CHUVA_MS);
  tick(SECO_PARA_ESTENDER_MS-500);
  assert(saidas[PIN_ESTENDER]==LOW);
  tick(600);tick(PAUSA_ENTRE_REVERTER_MS+5);
  assert(saidas[PIN_RECOLHER]==LOW && saidas[PIN_ESTENDER]==HIGH);
  change(PIN_FC_RECOLHIDO,HIGH,FILTRO_FC_MS);
  change(PIN_FC_ESTENDIDO,LOW,FILTRO_FC_MS);
  assert(saidas[PIN_RECOLHER]==LOW && saidas[PIN_ESTENDER]==LOW);
  // Teste 3: bloqueia estender com chuva, inclusive em modo manual
  cmd("manual");change(PIN_CHUVA,LOW,FILTRO_CHUVA_MS);
  cmd("estender");assert(ultimaResposta==409);
  assert(saidas[PIN_ESTENDER]==LOW);
  // Teste 4: dois fins ativos -> falha e relés OFF
  change(PIN_FC_RECOLHIDO,LOW,FILTRO_FC_MS);
  assert(falha && modo==Modo::Pausado);
  assert(saidas[PIN_RECOLHER]==LOW && saidas[PIN_ESTENDER]==LOW);
  cmd("limpar");assert(ultimaResposta==409);
  // Teste 5: resolver conflito permite limpar mantendo motor desligado
  change(PIN_FC_ESTENDIDO,HIGH,FILTRO_FC_MS);
  cmd("limpar");assert(ultimaResposta==200&&!falha);
  assert(saidas[PIN_RECOLHER]==LOW && saidas[PIN_ESTENDER]==LOW);
  std::cout<<"OK: partida pausada; chuva; recuo; 60s seco; reversao; bloqueio; falha; limpeza\n";
}
