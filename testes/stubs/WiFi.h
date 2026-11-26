#pragma once
#define WIFI_AP 2
struct WiFiClass { void mode(int);bool softAP(const char*,const char*);const char* softAPIP();};
extern WiFiClass WiFi;
