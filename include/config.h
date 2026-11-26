#pragma once
#include <Arduino.h>

// HARDWARE R5D (mantido na integracao R5E)
// Cada GPIO vai a base de um BC337 por resistor de 2,2 kΩ;
// pull-down de 10 kΩ da base ao GND. Coletor -> entrada IN1/IN2 do rele;
// emissor -> GND do controle. O rele DEVE ter entrada ativa em LOW.
constexpr uint8_t PIN_RECOLHER = 25; // BC337 Q1 -> IN1 / K1
constexpr uint8_t PIN_ESTENDER = 26; // BC337 Q2 -> IN2 / K2
constexpr uint8_t PIN_CHUVA = 27;    // DO do FC-37/LM393, alimentado 3V3
constexpr uint8_t PIN_FC_RECOLHIDO = 32; // OUT endstop EXTERNO
constexpr uint8_t PIN_FC_ESTENDIDO = 33; // OUT endstop INTERNO

// Confirmar os niveis LOGICOS dos modulos fisicos sem alimentar o motor.
constexpr bool CHUVA_ATIVA_EM_LOW = true;
constexpr bool FC_RECOLHIDO_ATIVO_EM_LOW = true;
constexpr bool FC_ESTENDIDO_ATIVO_EM_LOW = true;

constexpr uint32_t FILTRO_CHUVA_MS = 100;
constexpr uint32_t FILTRO_FC_MS = 25;
constexpr uint32_t SECO_PARA_ESTENDER_MS = 60000UL;
constexpr uint32_t PAUSA_ENTRE_REVERTER_MS = 350UL;
constexpr uint32_t LIBERAR_FC_PARTIDA_MS = 1200UL;
constexpr uint32_t TEMPO_MAX_MOTOR_MS = 4000UL; // inicial; medir o curso real

// Rede LOCAL criada pela propria ESP32; sem internet e sem Firebase.
constexpr char NOME_WIFI[] = "Varal-SENAI";
constexpr char SENHA_WIFI[] = "alterar12345"; // ALTERAR antes da demonstracao
