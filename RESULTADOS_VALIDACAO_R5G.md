# Validação R5G

- Regressão do controlador C++ por teste com stubs: **PASSOU** (partida pausada, chuva, fim de curso, 60s secos, reversão, conflito, limpeza de falhas).
- `construirStatusJson`, `construirEventosJson`, `construirLegacyJson`: objetos JSON válidos no teste de host.
- JavaScript `script.js`, `online.js`, `firebase.js`: sintaxe verificada por Node.js.
- UI local (API simulada) em 1440×960 e 390×850, fluxos manuais e automático: **PASSOU**.
- UI Firebase Online em 1440×900 e 390×850 com *mock* Firebase Auth/RTDB: **PASSOU** (leitura, login simulado, bloqueio de comandos remotos, layout responsivo).
- Imagens e manifesto PWA: arquivos presentes, ícones 192×192 e 512×512, conforme JPEGs enviados.
- Tamanho do LittleFS estático: cabe no espaço padrão previsto, mas **é necessário executar `Build Filesystem Image` no seu PlatformIO para confirmar**.
- **Não houve Build real ESP32/PlatformIO neste ambiente** nem autenticação real contra Firebase, envio de dados ao seu projeto, deploy no Hosting ou testes físicos. Esses testes dependem da rede e contas configuradas.
