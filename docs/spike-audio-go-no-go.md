# H0 — Decisión go/no-go técnico del spike de audio

> Estado: **BORRADOR — GO provisional, pendiente de la sesión de validación final del humano**
> Fecha: 2026-07-03 · Rama: pipeline/SPEC-001 · Specs: SPEC-001…SPEC-004

## Pregunta que responde H0

¿Es técnicamente viable el pilar de Maurya — capturar micrófono + audio del sistema en macOS y transcribirlo en vivo con latencia utilizable — sin fricción inaceptable para el usuario? (Riesgos #3 y #4 del PRD.)

## Evidencia acumulada

### ✅ Confirmado (con verificación humana o ejecución real)

1. **Captura dual mic+sistema funciona** (SPEC-001): loopback de Chromium vía flags (`MacLoopbackAudioForScreenShare` + `MacCatapSystemAudioLoopbackCapture`, backend Core Audio taps) en Electron 38.8.6 / macOS 26.5.1. **Verificado por el humano 2026-07-03 ("Todo OK")**: medidores independientes por fuente, WAV estéreo 16 kHz/16-bit con L=voz y R=sistema, ambas audibles.
2. **Permisos TCC gestionables** (cubierto por SPEC-001): estado sin disparar prompt, instrucciones y deep-links a Ajustes; concedidos y funcionando en la máquina de desarrollo.
3. **Deepgram streaming conecta y transcribe** (fase 0 de SPEC-002, contra la API real): auth por subprotocolo, interims + finales, `channel_index` correcto por canal (atribución Micrófono/Sistema), flush tras CloseStream ~2 s. Sin SDK, cero dependencias nuevas.
4. **Pipeline completo compilado y testeado**: 40/40 tests unitarios en verde (captura, transcripción, latencia, diarización), typecheck y lint limpios.

### ⏳ Pendiente de la sesión de validación final (humano)

1. **Transcripción en vivo end-to-end con voz real** (SPEC-002): interims/finales en pantalla, atribución por fuente, transcript.json persistido junto al WAV.
2. **Números de latencia reales** (SPEC-003): fila "Latencia STT" (mediana/p95/máx) tras la sesión y veredicto "utilizable en directo" (umbral p95 ≤ 5 s; objetivo PRD 3-5 s).
3. **Calidad de la diarización** (SPEC-004): con dos voces por el micrófono, ¿separa bien "Hablante 1/2"? (Nota: índices se reinician por canal.)
4. **Sesión sostenida de 15 min** (AC-16 de SPEC-001): sin pérdida de audio ni crecimiento de memoria.

## Decisión técnica documentada (mecanismos elegidos)

| Componente | Decisión | Mínimos |
|---|---|---|
| Audio de sistema | Loopback Chromium por flags, backend CATap (`setDisplayMediaRequestHandler` + `audio: 'loopback'`) | macOS 14.2+ (13.2 con backend SCK) · Electron 38.x pinneado |
| Micrófono | `getUserMedia` con selección de dispositivo | — |
| Formato | WAV estéreo PCM 16-bit · 16 kHz · L=mic, R=sistema (`linear16` de Deepgram) | — |
| STT | Deepgram streaming WS nativo, `multichannel=true&diarize=true&interim_results=true&language=es` | key en `.env.local`, solo en main process |
| Riesgo conocido | Electron ≥39 exige `NSAudioCaptureUsageDescription` en Info.plist (empaquetado firmado) — planificar para el producto final (H7) | — |

## Limitaciones documentadas

- Prompt TCC en dev se atribuye a "Electron" genérico (aceptable en spike; el empaquetado firmado lo resuelve en H7).
- Proxy de permiso: `getMediaAccessStatus('screen')` como aproximación del TCC "System Audio Recording Only" de CATap.
- Índices de diarización se reinician por canal; el mapeo semántico entrevistador/interlocutor llega en H4/H5.
- Latencia p50 nearest-rank (n par → elemento inferior central).

## Veredicto

**GO provisional.** Los dos riesgos técnicos mayores del PRD (#4 captura, #3 latencia/STT) están despejados a nivel de mecanismo con evidencia real (captura verificada por humano; Deepgram conectado y transcribiendo en fase 0). El GO definitivo se firma cuando el humano complete la sesión de validación final (4 puntos de arriba) y anote aquí los números de latencia y su juicio de calidad.

### Registro de la sesión de validación final

- Fecha: 2026-07-10
- Validación: **uso en entrevistas reales** (el humano usó el pipeline completo en entrevistas de discovery reales, no en sesión sintética de 15 min). Declaración literal: "El spike es un GO como una casa, ya lo usé en entrevistas reales."
- Transcripción en vivo: funcionando en condiciones reales (implícito en el uso declarado).
- Latencia (mediana / p95 / máx): sin números registrados — la medición cuantitativa queda para el ítem H7 de optimización de latencia; el juicio cualitativo del humano es "utilizable".
- Diarización (calidad percibida): sin observaciones negativas reportadas.
- **Veredicto final: GO — firmado por el humano (2026-07-10).**
