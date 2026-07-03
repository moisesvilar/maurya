# Plan de implementación — SPEC-004: diarización de hablantes (Deepgram)

> Generado por subagente Plan y aprobado por el orquestador (2026-07-03). Contrato: specs/SPEC-004-spike-diarizacion-deepgram.md.

## 1. URL
`deepgramService.ts` cte `DEEPGRAM_URL`: añadir `&diarize=true`. Nada más cambia (auth/KeepAlive/CloseStream intactos).

## 2. Speaker mayoritario (main, parseo)
- Tipos del mensaje: `alternatives` gana `words?: { speaker?: number }[]`; `DeepgramResult.speaker: number | null`.
- `majoritySpeaker(words, isFinal)`: interim → null siempre; filtrar words con speaker numérico (vacío → null); contar en Map (insertion order); ganador por `>` estricto → empate lo gana el primero en aparecer.

## 3. Contrato
- `TranscriptLine.speaker: number | null` (requerido; null explícito se persiste). Evento hereda.
- `transcriptionService.handleResult`: `speaker: result.speaker` al construir line → persistencia gratis vía writer existente.
- `useTranscription.onResult`: añade `speaker` a la línea consolidada; partials sin speaker.
- Preload/MauryaApi: sin cambios.

## 4. UI
`TranscriptLine.tsx`: tras el Badge de fuente, `{line.speaker !== null && <span className="shrink-0 text-xs text-muted-foreground">Hablante {line.speaker + 1}</span>}` (texto muted, no Badge). Parcial sin cambios.

## 5. AC→cambio
Etiqueta → §1+§2+§4 · persistencia speaker → §3 · consecutivas sin agrupar → render por línea existente · sin dato → null (span ausente, JSON null) · sesión sin diarización → flujo idéntico · interims → §2 paso 1.

## 6. Orden, validación, riesgos
Orden: types → deepgramService → transcriptionService → useTranscription → TranscriptLine. Validación: typecheck && lint && sesión manual (dos voces por mic; transcript.json con speaker; degradación con una voz). Calidad = juicio humano (go/no-go).
Tests que romperán (a QA, no tocar en dev): deepgramService.test.ts (toHaveBeenCalledWith exacto sin speaker; fixtures sin words), useTranscription.test.ts (toEqual exacto), fixtures TranscriptLine requerido en spike-latency/transcriptionService.latency.test.ts, TranscriptLine.test.tsx, posible TranscriptionSection.test.tsx. Dominio: con multichannel los índices de speaker se reinician por canal (Hablante 1 mic ≠ Hablante 1 sistema) — aceptable en spike, documentar.
