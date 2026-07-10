# SPEC-022 — Plan de implementación

> Generado por subagente Plan (2026-07-10). Contrato: specs/SPEC-022-degradacion-sin-diarizacion.md. Verificado sobre el código real: (a) la URL vive en la constante `DEEPGRAM_URL` de `src/main/deepgramService.ts:8-9` con `diarize=true` como último query param — extraerla a un builder no altera el orden de los demás parámetros (los tests existentes usan `toContain`, no igualdad exacta); (b) el camino auth ya está excluido estructuralmente: en `handleClose` (transcriptionService.ts:214-227) el resultado `'auth'` de `classifyConnectionFailure` emite `AUTH_ERROR` y hace `return` **sin llamar nunca** a `retryOrGiveUp` → el fallback, al vivir dentro de `retryOrGiveUp`, no necesita lógica anti-auth propia; (c) la decisión de la spec "solo si la conexión nunca abre" es de **sesión**, no de conexión: el test SPEC-002·AC-11 (conexión abierta que cae + reintento que nunca abre) NO debe disparar el fallback — hace falta un flag `everOpened` de sesión, no basta `connection.opened`; (d) `emitStatus` (transcriptionService.ts:81-87) construye el evento con shape exacto (`{ status }` o `{ status, error }`) y varios tests asertan con `toHaveBeenCalledWith` **igualdad exacta** → el campo nuevo `degraded` debe ser opcional y **omitirse cuando es false**, no emitirse como `degraded: false`; (e) asistente, nota y etiquetas ya toleran `speaker: null` (assistantService.ts:347 omite el tag `sN`; noteService.ts:70-74 y lib/speakerLabel.ts → "Tú"/"Interlocutor 1") — cero cambios en ese frente. Decisión clave: **el flag de sesión `degraded` cumple doble función** — "fallback ya intentado" (se pone una vez, nunca se limpia) y "modo vigente" (parametriza `openConnection` y `emitStatus`).

## 1. deepgramService: URL parametrizable y opciones de conexión

- **src/main/deepgramService.ts**:
  - Sustituir la constante `DEEPGRAM_URL` por una base sin diarización + builder (sin duplicar la cadena):
    ```ts
    const DEEPGRAM_BASE_URL =
      'wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&channels=2&multichannel=true&interim_results=true&language=es'
    function buildDeepgramUrl(diarize: boolean): string {
      return diarize ? `${DEEPGRAM_BASE_URL}&diarize=true` : DEEPGRAM_BASE_URL
    }
    ```
    Con `diarize=true` la URL resultante es **byte a byte la actual** (el param ya era el último).
  - `export interface DeepgramConnectionOptions { diarize?: boolean }` (default `true`, documentado como SPEC-022).
  - Constructor: `constructor(apiKey: string, callbacks: DeepgramCallbacks, options?: DeepgramConnectionOptions)` → `new WebSocket(buildDeepgramUrl(options?.diarize ?? true), ['token', apiKey])`. Nada más cambia (parser, `majoritySpeaker`, `classifyConnectionFailure` intactos: sin `diarize`, `words[].speaker` no llega y `majoritySpeaker` ya devuelve `null`).

## 2. transcriptionService: intento único de fallback en `retryOrGiveUp`

- **src/main/transcriptionService.ts**:
  - `Session` gana dos flags (init en `startTranscription`): `everOpened: boolean` (false) — alguna conexión de la sesión llegó a abrir — y `degraded: boolean` (false) — fallback intentado / modo vigente.
  - `openConnection`: en el `onOpen`, `target.everOpened = true`. Al construir: `new DeepgramConnection(apiKey, {...}, { diarize: !target.degraded })` — una reconexión en modo degradado no reintroduce la diarización.
  - `retryOrGiveUp` — **solo** en la rama de rendición (tras el `if` de reintentos, que NO se toca), antes del `emitStatus` final:
    ```ts
    // SPEC-022: último recurso — un único intento sin diarización, solo si
    // ninguna conexión de la sesión llegó a abrir (el camino auth nunca llega aquí)
    if (!target.everOpened && !target.degraded && target.apiKey !== null) {
      target.degraded = true
      openConnection(target, target.apiKey)
      return
    }
    ```
    Intento **silencioso**: no se emite status (el Alert "Reintentando la conexión…" previo sigue visible); si abre, `onOpen` emite `'active'` degradado (limpia el error en el hook); si falla, `handleClose` → `classifyConnectionFailure` → `retryOrGiveUp` de nuevo → rendición actual **con el mensaje literal intacto**.
  - `emitStatus`: incluir `degraded: true` en el evento **solo cuando** `target.degraded` (spread condicional), preservando el shape exacto actual para sesiones normales. Todos los eventos posteriores de la sesión degradada (incl. `'active'` y el `'inactive'` de cierre) llevan la marca.
  - **Cero cambios** en: `MAX_RETRIES`, mensajes de reintento/rendición, `AUTH_ERROR`, camino auth de `handleClose`, `handleResult`, `persistTranscript`, `finishTranscription`.

## 3. Tipo del evento de status (contrato IPC, retrocompatible)

- **src/renderer/src/types/audio.ts**: `TranscriptionStatusEvent` gana `degraded?: boolean` documentado como SPEC-022 (ausente = false; presente solo tras el fallback sin diarización). Sin canal IPC nuevo ni cambios en preload (`onStatus` ya tipa por este interface).

## 4. Hook useTranscription: exponer el modo degradado

- **src/renderer/src/hooks/useTranscription.ts**: estado nuevo `degraded: boolean` (init false); en el listener de `onStatus`: `setDegraded(event.degraded === true)`. `reset()` lo devuelve a false; `UseTranscriptionResult` gana el campo. El spike (/capture desenrutado) no lo consume: sin cambios allí.

## 5. Alert de modo degradado en RecordingSection

- **src/renderer/src/components/recording/DegradedTranscriptionAlert.tsx (nuevo)** — patrón de `NoKeyAlert.tsx`: `<Alert data-testid="transcription-degraded-alert">` (variant default), icono `Users` de lucide con `aria-hidden`, `<AlertDescription>` con el copy **literal**: "Transcribiendo sin atribución de hablante. La transcripción y el asistente siguen funcionando.". Sin botones ni título adicional.
- **src/renderer/src/components/recording/RecordingSection.tsx**: destructurar `degraded` del hook y renderizar `{capturing && degraded && <DegradedTranscriptionAlert />}` junto a los avisos de conexión existentes. El gate `capturing` garantiza que desaparece al terminar la sesión. Nada más cambia (TranscriptArea ya renderiza `speaker: null` con etiquetas genéricas vía `speakerLabel`).

## 6. Verificación de no-cambios (sin código)

Confirmado en el código; el implementador NO toca estos archivos:
- **Asistente**: `assistantService.ts:347-348` ya omite el sufijo ` sN` con `speaker: null`.
- **Nota/export**: `noteService.ts:70-74, 188, 414` etiqueta "Tú"/"Interlocutor 1" ante `speaker: null`.
- **Persistencia**: `persistTranscript` serializa `lines` tal cual; `transcript.json` no cambia de forma.
- **UI de líneas**: `lib/speakerLabel.ts` ya cubre el caso null.

## AC → fase

| AC | Fase |
|---|---|
| AC-01 Intento único sin diarización al agotar reintentos sin abrir | 1, 2 |
| AC-02 Fallback abre → `speaker: null` + status degradado | 1, 2, 3 |
| AC-03 Fallback también falla → rendición actual sin cambios | 2 |
| AC-04 Fallo auth → sin fallback, mensaje auth intacto | 2 (estructural: auth nunca llega a `retryOrGiveUp`) |
| AC-05 Stop en sesión degradada → transcript.json con forma actual | 2, 6 |
| AC-06 Alert informativo con copy literal, persistente en sesión | 4, 5 |
| AC-07 Líneas con etiquetas genéricas sin errores | 6 (ya cubierto) |
| AC-08 Sesión normal → Alert nunca aparece | 2 (flag omitido), 4, 5 |
| AC-09 Asistente analiza con formato existente para `speaker: null` | 6 (ya cubierto) |
| AC-10 Nota/export con etiquetas genéricas | 6 (ya cubierto) |

## Breakage presupuestado (QA lo repone; el implementador NO escribe tests)

- **Esperado: cero roturas** si se respetan las dos decisiones de diseño: (1) `degraded` **omitido** del evento cuando es false — `tests/unit/spike-transcription/transcriptionService.test.ts` y afines asertan igualdad **exacta** de `{ status }` / `{ status, error }`; emitir `degraded: false` los rompería; (2) fallback condicionado a `!target.everOpened` (sesión) — el test SPEC-002·AC-11 (primera conexión ABRE, el reintento no) aserta `instances).toHaveLength(2)` y rendición inmediata; un fallback por conexión crearía una 3ª instancia y lo rompería.
- `deepgramService.test.ts` y `deepgramService.diarization.test.ts` asertan `toContain('diarize=true')` sobre la construcción por defecto → siguen pasando (default `diarize: true`, URL idéntica).
- Los mocks de `DeepgramConnection` (6 suites) definen constructor de 2 argumentos: el 3º opcional no rompe tipos ni runtime. `tests/helpers/mockApi.ts` no cambia.
- `RecordingSection.test.tsx`: el Alert nuevo no se renderiza por defecto → sin roturas. Puntos de test nuevos para /somo-qa-dev: fallback (3ª conexión sin diarize tras agotar reintentos never-opened), exclusión auth, evento con `degraded: true`, Alert por testid.

## Orden, validación y riesgos

**Orden**: fase 1 → 2 → 3 → 4 → 5 (la 6 es verificación). `npm run typecheck` + `npm run lint` por bloque; smoke manual (humano): forzar rechazo del handshake, comprobar Alert + líneas "Interlocutor 1" + transcript.json y nota tras detener.

**Riesgos**:
1. **Igualdad exacta de eventos**: añadir `degraded: false` siempre rompe ~10 aserciones existentes; el spread condicional es obligatorio.
2. **Semántica sesión vs conexión**: usar `connection.opened` en lugar de `everOpened` de sesión dispararía el fallback en reconexión-tras-caída (contra la spec y contra AC-11 de SPEC-002).
3. **`classifyConnectionFailure` se re-ejecuta cuando el fallback falla**: si devolviera `'auth'` (key revocada a mitad), se emite el mensaje de auth — razonable y coherente con AC-04.
4. **Status durante el intento silencioso**: el usuario ve "Reintentando la conexión…" hasta que el fallback abre o se rinde — asumido por la spec.
5. **Doble función del flag `degraded`**: se pone una vez y nunca se limpia en la sesión → garantiza el "un único intento"; `startTranscription` crea sesión nueva con ambos flags a false.
6. **No tocar el orden de emisiones**: el fallback va DESPUÉS del `if` de reintentos y ANTES del `emitStatus` de rendición.
