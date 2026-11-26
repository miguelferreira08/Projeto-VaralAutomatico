# VARAL INTELIGENTE — UNIFICAÇÃO R5F

## O que foi unificado

- **Anexo 1 (`site(1).zip`)**: visual do painel, cores, cartões, organização responsiva e imagens de identificação.
- **Anexo 2 (`Varal_R5E_Integrado.zip`)**: firmware ESP32 original, sensores, fins de curso, motor, relés, comandos HTTP e telemetria real.
- **R5F** significa **interface unificada**. A base de firmware permanece **R5E** (o mesmo código que você já compilou e gravou); a revisão do hardware continua R5D.

O controle principal **não usa Firebase**. O site é hospedado diretamente na ESP32 em `http://192.168.4.1` e usa somente `/api/status`, `/api/eventos` e `/api/cmd`.

### Onde estão os arquivos

- `platformio.ini`: abre o projeto no VS Code + PlatformIO.
- `src/main.cpp`: firmware real do anexo 2, mantido inalterado.
- `include/config.h`: GPIOs e parâmetros da máquina.
- `data/index.html`: layout do anexo 1 com controles necessários à lógica do anexo 2.
- `data/style.css`: estilo do anexo 1 + ajustes para PARAR, LIMPAR FALHA e avisos.
- `data/script.js`: lógica de interface da API do anexo 2, com instalação PWA opcional.
- `data/icons.js`, `data/icons/`: ícones e imagens locais; dispensam CDN para o painel funcionar sem internet.
- `data/sw.js`, `data/manifest.json`: suporte PWA opcional (quando a origem é segura).
- `testes/`: verificações auxiliares do firmware e da interface.

## Como atualizar sua ESP32 no VS Code

1. Descompacte este ZIP.
2. No VS Code, abra **a pasta `Varal_R5F_Unificado`**, que contém `platformio.ini`.
3. No PlatformIO, execute `esp32dev > General > Build` (símbolo ✓) para confirmar o firmware.
4. Com a ESP32 conectada via USB, execute `esp32dev > General > Upload` para gravar o firmware.
5. Em seguida, execute `esp32dev > Platform > Upload Filesystem Image`. **Esta etapa é indispensável para substituir o site antigo** pelo visual novo.
6. Pressione EN para reiniciar a placa. Conecte-se ao Wi-Fi `Varal-SENAI`, senha `alterar12345`, abra `http://192.168.4.1`.
7. No navegador, `http://192.168.4.1/api/status` deve mostrar JSON do firmware.
8. Se o navegador ainda mostrar a interface antiga, atualize com recarga forçada / limpe os dados desse site (em alguns navegadores a interface pode estar em cache).

> Se o firmware R5E anterior continuar gravado e você quer mudar **somente o visual**, tecnicamente basta gravar `Upload Filesystem Image` da R5F, pois o código de controle da ESP32 é idêntico ao anexo 2. O procedimento completo Build + Upload + Upload Filesystem é o mais fácil de conferir.

## Recursos de segurança e limitações

- **Sem sensores conectados, os estados exibidos não são leituras confiáveis.** Não acione motor ou relés até conferir o circuito, os sinais 3,3 V e os fins de curso.
- Ligações ESP32: GPIO25->BC337 Q1->IN1, GPIO26->BC337 Q2->IN2; GPIO27 chuva; GPIO32 fim recolhido; GPIO33 fim estendido.
- Placa de 8 relés usa somente **K1/IN1 e K2/IN2**. A alimentação dos relés é separada e adequada a 5 V.
- Firmware inicia **PAUSADO**, impede extensão na chuva, faz pausa entre reversões, bloqueia conflito de fins de curso e tem timeout inicial de **4 segundos** (deve ser recalibrado com curso real).
- O comando PARAR pelo site **não substitui** interruptor físico/fusível/corte de potência.
- O novo painel não inventa **temperatura, vento ou previsão do tempo** (o firmware offline não fornece esses dados). O antigo cartão de clima foi adaptado para **sensor local de chuva, tempo seco e motor**.
- A telemetria exibida é **desde a inicialização da ESP32**. Sem banco de dados, não há histórico das últimas 24 horas ou de semanas anteriores; o antigo cartão foi reetiquetado de acordo.
- Eventos são as **18 últimas entradas em RAM**, com tempo relativo ao início, e podem ser limpos pelo painel.
- A senha `alterar12345` é inicial e deve ser alterada em `include/config.h` antes de uma apresentação fora de ambiente controlado. Qualquer aparelho conectado ao Wi-Fi do dispositivo tem acesso aos comandos HTTP.
- PWA no Wi-Fi local via **HTTP** geralmente não fica disponível para instalação; o site funciona normalmente no navegador sem PWA.

## Arquivos do anexo 1 retirados intencionalmente

`firebase.js`: não faz parte da integração local. O sistema anterior dependia de Firebase e Open-Meteo, que não funcionam na rede isolada da ESP32. Esses recursos não foram simulados nem substituídos por dados fictícios.

## Verificação

1. Build de firmware (o mesmo R5E já validado anteriormente).
2. Build Filesystem Image.
3. Teste do painel com a API `/api/status`, `/api/eventos`, `/api/cmd` em servidor simulado.
4. **Validação física dos relés e sensores ainda pendente**.
