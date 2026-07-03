# SPEC-004 — Spike: diarización de hablantes con Deepgram

> Requisito origen: RF-AUDIO-004 (Should) · Hito H0 ítem 5 · Checklist: "Probar diarización (entrevistador vs. interlocutor) de Deepgram"
> Relacionados: SPEC-002 (la atribución entrevistador/interlocutor por CANAL ya está resuelta vía multichannel; esta spec añade la distinción de voces DENTRO de un canal), Riesgo #9 del PRD (degradar con elegancia si la diarización falla)
> Naturaleza: **SPIKE**. El objetivo es probar la calidad de la diarización de Deepgram y dejar la evidencia para el go/no-go; la evaluación de calidad es juicio humano.

## Descripción

Activa la diarización de Deepgram (`diarize=true`) sobre el stream existente para que, cuando dos o más voces distintas hablen por el mismo canal (típico en entrevistas presenciales, donde entrevistador e interlocutor entran ambos por el micrófono), cada línea final quede etiquetada con su hablante ("Hablante 1", "Hablante 2", …) además de su fuente. La etiqueta se muestra en el área de transcripción y se persiste en el transcript, dejando al humano la evaluación de si la calidad es suficiente para el producto (Riesgo #9: si falla, todo sigue funcionando sin etiqueta).

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya pusheado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura. **Sin Supabase** (harness Electron local).
- **Matiz de spike:** no se renombra a "Entrevistador"/"Interlocutor" (mapeo semántico de hablantes = producto futuro, H4/H5); el spike solo expone el índice de hablante que da Deepgram.

## Criterios de aceptación

### Etiquetado de hablantes (happy path)

- GIVEN la transcripción está activa WHEN dos voces distintas hablan por el mismo canal THEN sus líneas finales muestran, junto al Badge de fuente, la etiqueta del hablante ("Hablante 1", "Hablante 2") asignada por la diarización.
- GIVEN una línea final con hablante identificado WHEN se persiste el transcript THEN la línea incluye el campo `speaker` con el índice numérico del hablante.
- GIVEN líneas de hablantes distintos consecutivas WHEN se muestran en el área THEN cada una lleva su propia etiqueta (no se agrupan).

### Degradación (Riesgo #9)

- GIVEN un resultado final sin información de hablante WHEN se muestra la línea THEN aparece sin etiqueta de hablante (solo el Badge de fuente, como hasta ahora) y `speaker` se persiste como `null`.
- GIVEN la diarización no aporta datos en toda la sesión WHEN se detiene THEN el flujo completo (transcript, latencia, persistencia) funciona exactamente igual que en SPEC-002/003.

### Parciales

- GIVEN un resultado parcial (interim) WHEN se muestra la línea parcial en curso THEN no lleva etiqueta de hablante (los interims no traen diarización estable).

## UX Design

### Wireframe textual

**Pantalla única — Harness (extensión de la línea de transcript)**

Sin secciones nuevas. En cada línea final del área de transcripción (SPEC-002 §5bis), tras el Badge de fuente:

- Etiqueta de hablante como texto corto `muted` ("Hablante 1") — texto, no Badge, para no competir visualmente con el Badge de fuente. Ausente si no hay dato.
- Línea parcial: sin cambios.

### Componentes shadcn utilizados

Ya instalados y suficientes. Sin componentes nuevos.

### Patrón de interacción

- **Texto muted en vez de segundo Badge**: dos Badges por línea saturan una línea de lectura rápida (densidad, regla 8.2); el hablante es metadato secundario en el spike. Decisión no cubierta por el design system, documentada aquí.
- **Degradación silenciosa** (sin Alert): la ausencia de hablante no es un error del flujo (Riesgo #9); mostrar avisos por línea sería ruido.

### Comportamiento responsive

- Desktop only (excepción documentada en SPEC-001).

## Notas técnicas

- **Query param:** añadir `diarize=true` a la URL del WebSocket de Deepgram existente. Con `multichannel=true`, Deepgram diariza por canal; el índice de hablante llega por palabra (`words[].speaker`).
- **Extracción del speaker por línea:** un final puede contener palabras de varios hablantes; para el spike, asignar a la línea el hablante **mayoritario** de sus `words` (empate → el primero). Si Deepgram parte los finales por hablante (comportamiento habitual con diarize), esto es directo.
- **Contrato:** `TranscriptLine` (y el evento de resultado) gana `speaker: number | null`. La etiqueta UI es `Hablante ${speaker + 1}` (Deepgram indexa desde 0). El transcript.json persiste `speaker` por línea dentro de `lines`.
- **Sin cambios** en KeepAlive, reintento, latencia ni en el resto del flujo.
- **Evidencia para go/no-go (manual):** sesión presencial simulada (dos personas o voz+grabación por el mic) y valoración humana de si las etiquetas separan bien las voces.
- **Divergencia de stack:** igual que SPEC-001/002/003.
