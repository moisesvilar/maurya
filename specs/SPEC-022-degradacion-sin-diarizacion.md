# SPEC-022 — Degradación elegante de la transcripción sin diarización

> Traza: Riesgo #9 del PRD ("Diarización imperfecta degrada el juicio — degradar con elegancia si
> falla; la asistencia sigue funcionando sin atribución perfecta"), RF-AUDIO-004 (diarización,
> Should). Ítem H7 del checklist "Degradación elegante si falla la diarización". El grueso del
> pipeline ya tolera `speaker: null` (UI con etiqueta genérica, asistente y nota funcionan sin
> atribución); esta spec cierra el hueco restante: el fallo de conexión causado por los parámetros
> de diarización y la visibilidad del modo degradado.

## Descripción

La transcripción en vivo pide a Deepgram diarización (quién habla) además del texto. Si Deepgram
rechaza repetidamente la conexión — por ejemplo porque el plan o el modelo no soportan la
diarización —, hoy la sesión entera se queda sin transcripción. Con esta spec, la app agota los
reintentos normales y, antes de rendirse, prueba una conexión sin diarización: si abre, la
transcripción continúa sin atribución de hablante, el usuario ve un aviso discreto de que está en
modo degradado, y el asistente y la nota siguen funcionando con normalidad.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes,
  páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests
  unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega.
  Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya
  commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador
  entregue será descartado o reemplazado.
- No hay cambios de schema ni de infraestructura: `TranscriptLine.speaker` ya es `number | null` y
  `transcript.json` no cambia de forma.
- Los reintentos existentes (número, clasificación de auth, mensajes actuales) **no se modifican**:
  el fallback sin diarización se añade DESPUÉS de agotarlos, como último recurso.

## Criterios de aceptación

### Fallback de conexión sin diarización

- GIVEN una sesión de transcripción cuyos reintentos de conexión con diarización se agotan sin llegar a abrir WHEN se va a emitir la rendición THEN se intenta UNA única conexión adicional con los mismos parámetros pero sin diarización antes de rendirse.
- GIVEN el intento sin diarización abre con éxito WHEN llegan resultados THEN la transcripción continúa con `speaker: null` en todas las líneas y el estado emitido al renderer indica el modo degradado.
- GIVEN el intento sin diarización también falla WHEN se agota THEN se emite la rendición actual sin cambios de comportamiento ni de mensaje ("La captura continúa sin transcripción…").
- GIVEN un fallo clasificado como de autenticación WHEN se detecta THEN NO se intenta el fallback sin diarización (una key inválida no se arregla quitando la diarización) y se mantiene el mensaje de auth actual.
- GIVEN una sesión degradada en curso WHEN se detiene la grabación THEN `transcript.json` se persiste con la forma actual (líneas con `speaker: null`) y el flujo de cierre no cambia.

### Visibilidad del modo degradado

- GIVEN la sesión pasa a modo degradado WHEN el renderer recibe el estado THEN la sección de grabación muestra un Alert informativo (no destructivo) con el texto "Transcribiendo sin atribución de hablante. La transcripción y el asistente siguen funcionando." que permanece mientras dure la sesión.
- GIVEN la sesión degradada WHEN se muestran líneas finales THEN cada línea usa las etiquetas genéricas existentes (mic → "Tú"; sistema → "Interlocutor 1") sin errores ni huecos.
- GIVEN una sesión normal (diarización funcionando) WHEN transcribe THEN el Alert de modo degradado no aparece nunca.

### Asistencia y nota en modo degradado

- GIVEN una sesión degradada con asistente activo WHEN el asistente analiza THEN las llamadas al LLM se construyen con las líneas sin índice de hablante (formato existente para `speaker: null`) y las sugerencias siguen llegando con normalidad.
- GIVEN una entrevista grabada en modo degradado WHEN se genera la nota de resumen THEN la generación funciona y el export etiqueta cada intervención con las etiquetas genéricas existentes.

## UX Design

### Wireframe textual

**Único cambio de UI — Alert de modo degradado en la sección Grabación (RecordingSection)**

- Alert (variant default, icono `Users` de lucide con `aria-hidden`), colocado junto a los avisos
  informativos existentes de la sección (mismo bloque donde hoy aparecen los avisos de conexión):
  texto único "Transcribiendo sin atribución de hablante. La transcripción y el asistente siguen
  funcionando.". Sin botones. Desaparece al terminar la sesión de grabación.
- El resto de la sección (badges de estado, transcripción, medidores, asistente) no cambia.

### Componentes shadcn utilizados

Componentes: Alert. Ya instalado; sin componentes adicionales.

### data-testid

- `transcription-degraded-alert` — el Alert de modo degradado

El resto de elementos son localizables por role/label/text.

### Patrón de interacción

- **Alert informativo persistente durante la sesión**, no Toast: es un estado que dura toda la
  grabación, no un evento puntual (regla 6.1: Toast no sirve para información que debe permanecer).
  No es destructive: nada ha fallado de forma irrecuperable — la transcripción sigue.
- El fallback es **automático y silencioso** salvo por el Alert: no se pide confirmación al usuario
  en mitad de una entrevista (coherente con NFR §4.1: feedback glanceable, sin abrumar).

### Comportamiento responsive

- **Mobile (< md):** el Alert ocupa el ancho del contenedor como los avisos existentes; sin cambios adicionales.
- **Tablet (md-lg):** interpolado entre mobile y desktop.
- **Desktop (lg+):** layout completo del wireframe.

## Notas técnicas

- **Conexión (`src/main/deepgramService.ts` + `src/main/transcriptionService.ts`):** la URL de
  Deepgram es hoy una constante con `diarize=true`. El fallback necesita poder construir la URL sin
  ese parámetro y que `retryOrGiveUp` — solo en el camino "nunca llegó a abrir" y tras agotar
  `MAX_RETRIES` — encadene el intento único sin diarización antes de emitir la rendición. El camino
  de auth (clasificación existente) queda excluido explícitamente.
- **Señal al renderer:** el estado de transcripción que ya viaja por eventos tipados gana la marca
  de modo degradado (p. ej. un campo booleano en el status existente), siguiendo el patrón IPC de
  CLAUDE.md (tipo en `src/renderer/src/types/`, sin canal nuevo si el evento de status actual lo
  admite).
- **Sin cambios** en: formato de `transcript.json`, etiquetas de hablante (`speakerLabel` en
  noteService y `lib/speakerLabel.ts`), prompt del asistente (ya omite el hablante con
  `speaker: null`), disparadores del asistente (SPEC-016) y flujo de consentimiento (SPEC-019).
- Dependencias: SPEC-002 (conexión Deepgram), SPEC-004 (diarización), SPEC-015 (sección de
  grabación), SPEC-016 (asistente), SPEC-017 (nota).

## Decisiones asumidas

- **El fallback se dispara solo si la conexión nunca abre** (alternativa: también cuando una
  conexión abierta se cae repetidamente) → una conexión que llegó a abrir con diarización no falla
  por la diarización; recortar parámetros ahí no aporta y cambiaría el comportamiento de reconexión
  probado en SPEC-002.
- **Un único intento de fallback** (alternativa: repetir el ciclo completo de reintentos sin
  diarización) → si Deepgram tampoco acepta la conexión simplificada, el problema no es la
  diarización; alargar los reintentos retrasa la rendición sin beneficio.
- **Sin distinción del motivo del rechazo** (alternativa: analizar el código/mensaje del handshake
  para decidir si el fallback aplica) → el WS nativo entrega errores vacíos y códigos genéricos
  (lección de SPEC-002); intentar sin diarización como último recurso es más robusto que clasificar.
- **El modo degradado no se persiste** en `transcript.json` (alternativa: marcar la sesión como
  degradada en el archivo) → las líneas con `speaker: null` ya expresan la ausencia de atribución;
  un flag añadiría schema sin consumidor.
