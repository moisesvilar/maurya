# SPEC-022-iter-1 — La marca de modo degradado solo se emite si la conexión degradada llegó a abrir

## Descripción

Iteración de corrección de defecto sobre la implementación de SPEC-022.

La desencadena el hallazgo del QA Dev durante la generación de la suite (gap #1 de su entrega,
2026-07-10): cuando el intento de fallback sin diarización TAMBIÉN falla, el evento de rendición
viaja con `degraded: true` porque el flag de sesión se activa al intentar el fallback y nunca se
limpia. El renderer, con la grabación aún en curso, mostraría entonces el Alert "Transcribiendo sin
atribución de hablante. La transcripción y el asistente siguen funcionando." junto al error de
rendición — un mensaje falso: la transcripción no sigue funcionando.

Cambia únicamente la condición de emisión de la marca: `degraded` solo acompaña a los eventos
cuando la sesión está de verdad en modo degradado, es decir, cuando la conexión sin diarización
llegó a abrir. No cambia nada más: ni el flag interno (que sigue garantizando el intento único),
ni los reintentos, ni los mensajes, ni el Alert del renderer (que ya depende del campo del evento).

## Alcance de implementación

- Esta iteración define **únicamente** una corrección puntual de lógica en
  `src/main/transcriptionService.ts` (condición de emisión de la marca `degraded`).
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests
  unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega.
  Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya
  commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador
  entregue será descartado o reemplazado.
- No hay cambios de schema, canales IPC, tipos ni `package.json`.
- **Fuera de alcance:** el comportamiento de reintentos de la sesión degradada que abre y luego cae
  (observación #2 del QA: rendición directa, aceptada por diseño "un único intento") y cualquier
  cambio en el renderer.

## Defecto a corregir

### Síntoma

Tras agotar el fallback sin éxito (la conexión sin diarización tampoco abre), el evento de
rendición de `transcription:status` incluye `degraded: true`. En el renderer, con la grabación en
curso, `useTranscription.degraded` queda a true y RecordingSection renderiza el Alert de modo
degradado junto al error de rendición, afirmando que "la transcripción y el asistente siguen
funcionando" cuando la sesión se ha quedado sin transcripción. Fijado provisionalmente por el test
de AC-03 de la suite SPEC-022 tal como está implementado (el QA lo señaló como dictamen pendiente).

### Causa raíz

`src/main/transcriptionService.ts`: el flag de sesión `degraded` cumple doble función (fallback ya
intentado + modo vigente) y `emitStatus` lo vuelca al evento con la condición `target.degraded` a
secas. El flag se activa ANTES de saber si la conexión degradada abre; si no abre, la rendición
hereda la marca aunque la sesión nunca haya entrado en modo degradado operativo.

### Cambio requerido

En `emitStatus`, la marca solo se incluye cuando la sesión degradada está operativa: la condición
pasa de `target.degraded` a `target.degraded && target.everOpened` (la conexión de fallback marca
`everOpened` en su `onOpen`, por lo que la conjunción expresa exactamente "el intento sin
diarización llegó a abrir"). El flag interno `degraded` NO cambia (sigue garantizando el intento
único). Comportamiento esperado:

- Fallback abre → eventos posteriores (`active`, `inactive` de cierre, etc.) con `degraded: true`
  (sin cambios respecto a hoy).
- Fallback no abre → evento de rendición con el shape actual **sin** campo `degraded`; el Alert
  del renderer no aparece.
- Sesión normal → sin campo `degraded` (sin cambios).

## Notas técnicas

- Fichero afectado: `src/main/transcriptionService.ts`, solo la condición del spread en
  `emitStatus` (+ ajuste del comentario). Sin impacto en datos/schema/IPC (explícito: no).
- Matiz de `everOpened`: también es true si una conexión CON diarización hubiera abierto antes —
  pero en ese caso el fallback nunca se dispara (condición `!target.everOpened` en
  `retryOrGiveUp`), así que la conjunción no introduce falsos positivos.
- Retrocompatibilidad: el tipo `TranscriptionStatusEvent.degraded?: boolean` no cambia; los
  consumidores (useTranscription → RecordingSection) no se tocan y quedan corregidos gratis.
- Dependencias: SPEC-022 (base), SPEC-002 (reintentos).
- Verificación manual sugerida: simular rechazo total del handshake (key de red cortada tras
  arrancar), comprobar que tras la rendición aparece SOLO el error de conexión, sin el Alert de
  modo degradado.
