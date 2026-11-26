#pragma once
#include "Arduino.h"
#include "LittleFS.h"
#include <functional>
#define HTTP_GET 0
#define HTTP_POST 1
struct WebServer {WebServer(int);void on(const char*,int,void(*)());void onNotFound(void(*)());void begin();void handleClient();String arg(const char*);String uri();void sendHeader(const char*,const char*);void send(int,const char*,const String&);void send(int,const char*,const char*);size_t streamFile(File&,const char*);};
