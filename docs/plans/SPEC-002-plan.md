# Plan de implementación — SPEC-002: Spike transcripción STT streaming con Deepgram

> Generado por subagente Plan y aprobado por el orquestador (2026-07-03). Contrato: specs/SPEC-002-spike-stt-streaming-deepgram.md. Extiende el harness de SPEC-001 (bridge window.api, chunks Int16 por IPC `recording:write-chunk` ~512 ms / 32 KB, hook useAudioCapture).

## 1. Decisión técnica

**WebSocket global nativo del main process (Node 22 en Electron 38.8.6), sin `@deepgram/sdk`.** Lo que el SDK regala (KeepAlive, tipos de eventos) son ~20 líneas; lo difícil (reintento único, clasificación del 401) hay que hacerlo a mano con o sin SDK. Auth por subprotocolo `new WebSocket(url, ['token', KEY])`. **Fallback autorizado:** si la fase 0 muestra fallo de WS global o de auth por subprotocolo → conmutar a `@deepgram/sdk` (única dependencia permitida); `deepgramService` aísla el cambio a un archivo.

URL: `wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&channels=2&multichannel=true&interim_results=true&language=es`.

## 2. Tee del flujo PCM + backpressure

Punto único de bifurcación: handler `recording:write-chunk` de `src/main/ipc.ts` — primero `wavFileService.writeChunk` (intocable), después `transcriptionService.pushAudio(buffer)` en try/catch.

- `open`: `ws.send(buffer)`; guardarraíl `bufferedAmount > 1 MB` → descartar chunk y contar (el WAV nunca se afecta).
- `connecting`/reintento: cola FIFO cap 40 chunks (~20 s); al abrir, drenar en orden.
- `no-key`/`failed`/`closed`: no-op (captura sigue — AC degradación).

## 3. Archivos (✚ nuevo / ✎ modificado)

- ✚ `src/main/env.ts` — `loadLocalEnv()`: parser mínimo de `.env.local` (KEY=value, comillas, comentarios) → `process.env` si no definida. Sin dotenv, sin `import.meta.env` (inlinaría la key en build). Llamado en `index.ts` antes de `whenReady()`.
- ✚ `src/main/deepgramService.ts` — wrapper WS: connect/sendAudio/keepAlive/closeStream; parseo `Results` → onOpen/onResult/onClose/onError.
- ✚ `src/main/transcriptionService.ts` — sesión: hasKey, tee/cola, 1 reintento, acumulación de finales, persistencia `<wav>.transcript.json`, log de latencia (`receivedAtMs − endMs`), eventos a renderer.
- ✎ `src/main/ipc.ts` — tee; start/stop de transcripción acoplados a recording:start/stop; `StopResult` con `transcriptPath`.
- ✎ `src/preload/index.ts` — `api.transcription.onStatus(cb)/onResult(cb)` (devuelven unsubscribe).
- ✎ `src/renderer/src/types/audio.ts` — TranscriptionStatus ('inactive'|'connecting'|'active'|'disconnected'|'no-key'), TranscriptChannel, TranscriptLine, eventos, `StopResult = RecordingResult & { transcriptPath: string | null }`, kinds nuevos 'deepgram-auth'|'deepgram-connection'.
- ✚ `src/renderer/src/hooks/useTranscription.ts` — estado { status, lines, partials (mapa por canal), error }; reset al iniciar.
- ✚ `components/spike/TranscriptionSection.tsx` — Badge estado, Alert sin-key, área 200px autoscroll, empty "Esperando audio…".
- ✚ `components/spike/TranscriptLine.tsx` — Badge fuente (Micrófono outline / Sistema secondary) + texto + mm:ss atenuado.
- ✎ `ResultSection.tsx` — fila transcript; un solo botón Finder (misma carpeta).
- ✎ `SpikeAudioCapturePage.tsx` — integración; toast "Grabación y transcripción guardadas · Mostrar en Finder"; errores Deepgram en zona de errores existente.

La key nunca cruza el bridge: solo estados y textos.

## 4. Por grupo de ACs

- **Happy path:** `channel_index[0]` 0=mic/L, 1=sistema/R; interim → parcial por canal (muted italic al final del área); final → acumular + evento + log latencia. Badge verde "Transcribiendo". Autoscroll por ref.
- **Stop:** `finish()` → CloseStream, flush con timeout 2.5 s → stop WAV → persistir transcript.json si hay líneas → `StopResult.transcriptPath`.
- **Sin key:** status `no-key`, Badge ámbar, Alert default con instrucción `.env.local`/`DEEPGRAM_API_KEY`; captura sigue.
- **401:** al fallar apertura, clasificar con `fetch /v1/auth/token` (solo en fallo): 401 → 'deepgram-auth', Alert destructive "clave inválida", sin reintento; captura sigue.
- **Pérdida de conexión:** status `disconnected` + Alert destructive + 1 reintento (cola activa); éxito → active y limpiar Alert; fallo → conservar líneas, captura sigue.
- **KeepAlive:** timer 5 s; enviar si `lastAudioSentAt > 8 s`.
- **Edge cierre/desconexión mic:** gratis — ambos caminos llaman a `recording.stop()` y la persistencia vive en ese handler.

## 5. Orden + validación + riesgos

1. **Fase 0 fail-fast** (script desechable en scratchpad, Node del sistema): WS global presente también en main de Electron; conectar con key real; audio de voz sintético (`say` + `afconvert` LEI16 16 kHz, estéreo con frases solo-L y solo-R); verificar interim/final, channel_index, 401 con key corrupta, flush tras CloseStream. Si auth por subprotocolo falla → conmutar a SDK antes de escribir servicios.
2. Main (env → deepgram → transcription → ipc/index) con verificación por logs. 3. Tipos + preload. 4. Renderer (hook → componentes → página). 5. Errores/edges. 6. Limpiar logs de fase 0 (conservar log de latencia).

Validación: `npm run typecheck && npm run lint && npm run dev`. Sin tests.

Riesgos: WS global ausente (→SDK) · auth subprotocolo (→SDK) · 401 indistinguible (fetch clasificador) · dos parciales simultáneos (mapa por canal) · CloseStream sin flush (timeout 2.5 s, persistir igual) · backpressure (caps §2) · reintento reinicia startMs (aceptable en spike).
