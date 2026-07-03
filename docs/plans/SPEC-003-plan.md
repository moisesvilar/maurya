# Plan de implementación — SPEC-003: medición de latencia audio→texto

> Generado por subagente Plan y aprobado por el orquestador (2026-07-03). Contrato: specs/SPEC-003-spike-medicion-latencia.md.

## 1. Cálculo (main, función pura)

`computeLatencyStats(lines): LatencyStats | null` en `transcriptionService.ts`. Null si 0 líneas. Deltas `receivedAtMs − endMs` ordenados; percentil **nearest-rank**: `sorted[max(0, ceil(p/100·n)−1)]`; `maxMs = sorted[n−1]`. n=1 → p50=p95=max (AC edge). Reconexión cubierta gratis (`session.lines` acumula ambos tramos).

## 2. Contrato

- `types/audio.ts`: `interface LatencyStats { count; p50Ms; p95Ms; maxMs }`; `StopResult.latency: LatencyStats | null`.
- `persistTranscript(wavPath)` → `{ transcriptPath, latency }`; writer pasa a `{ lines, latency }` (JSON.stringify con 2 espacios). Mismo objeto stats alimenta pantalla y archivo.
- `ipc.ts` handler `recording:stop`: `return { ...result, transcriptPath, latency }`.
- Preload y MauryaApi: sin cambios (StopResult viaja opaco).

## 3. UI (ResultSection)

Fila condicional `latency !== null` bajo la del transcript: label muted "Latencia STT" + `mediana X,X s · p95 X,X s · máx X,X s · N resultado(s)` (helper `toLocaleString('es-ES', {min/maxFractionDigits:1})`) + Badge: verde "OK" (`bg-green-600 text-white`, precedente en PermissionsSection) si `p95Ms ≤ 5000`, `destructive` "Lenta" si `> 5000` (comparación sobre el crudo). Página sin cambios.

## 4. AC→cambio

Fila+stats → computeLatencyStats + StopResult.latency + ResultSection · Badge OK/Lenta → ternario p95Ms>5000 · JSON coherente → writer {lines, latency} · Empty → null oculta fila · Reconexión → acumulación existente · n=1 → propiedad del nearest-rank.

## 5. Orden, validación, riesgos

Orden: types → transcriptionService → ipc → ResultSection. Validación: typecheck && lint && dev (sesión manual + JSON). Riesgos identificados (NO tocar en dev, van a QA): transcriptionService.test.ts asume array plano y firma string|null; fixtures StopResult sin latency en 5 archivos de tests (error TS en tsconfig.test.json y posible lint). p50 nearest-rank en n par = inferior central (documentar en JSDoc). Deltas negativos por reinicio de reloj en reconexión: no filtrar (spike).
