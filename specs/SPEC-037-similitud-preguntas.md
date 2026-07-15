# SPEC-037 — Supresión robusta de preguntas casi idénticas en el asistente

## Descripción

Durante una entrevista real, el asistente en vivo encola preguntas sugeridas que son
prácticamente la misma pregunta con otra formulación, porque la barrera determinista de
SPEC-036 solo descarta candidatas cuyo texto normalizado es *idéntico* al de una pregunta ya
mostrada. Esta spec robustece esa supresión: una candidata nueva que sea **casi idéntica** a
cualquier pregunta ya visible (pendiente o anclada) se descarta y no se muestra al
entrevistador. No cambia la UI ni la cadencia de análisis: cambia qué candidatas entran en la
cola.

Origen: petición humana directa (2026-07-15), §1 de
`docs/drafts/improvements-preguntas-20260715.md`. Evoluciona RF-ASIS-002 y RF-ASIS-004
(feedback del tamaño justo: no abrumar con duplicados).

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes,
  páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests
  unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega.
  Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya
  commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador
  entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica
  explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura.
- Esta spec **no tiene UI**: no se toca ningún componente del renderer, ningún tipo de
  `src/renderer/src/types/` ni ningún canal IPC. Todo el cambio vive en la lógica del asistente
  en main y en su prompt.

## Criterios de aceptación

### Supresión determinista de casi idénticas (segunda barrera)

- GIVEN una cola con la pregunta pendiente «¿Cuánto pagasteis por la última herramienta que comprasteis?» WHEN el análisis devuelve la candidata «¿Cuánto pagasteis por esa herramienta que comprasteis la última vez?» THEN la candidata se descarta y la cola no cambia.
- GIVEN una cola con la pregunta pendiente «¿Cuánto pagasteis por la última herramienta que comprasteis?» WHEN el análisis devuelve la candidata «¿CUÁNTO pagasteis por la última herramienta que comprasteis?» (solo cambian mayúsculas/diacríticos/puntuación) THEN la candidata se descarta y la cola no cambia.
- GIVEN una cola cuya única pregunta similar a la candidata está **anclada** WHEN el análisis devuelve esa candidata casi idéntica THEN la candidata se descarta y la cola no cambia.
- GIVEN una cola con la pregunta pendiente «¿Cuánto pagáis hoy por gestionar las citas?» WHEN el análisis devuelve la candidata «¿Cuánto pagáis actualmente por la gestión de las citas?» (mismo tema, variación singular/plural y de sufijos) THEN la candidata se descarta y la cola no cambia.
- GIVEN una candidata descartada por similitud WHEN termina el análisis THEN `suggestionCount` no se incrementa y el evento `assistant:update` emitido lleva la cola sin la candidata.

### Aceptación de candidatas distintas

- GIVEN una cola con la pregunta pendiente «¿Cuánto pagasteis por la última herramienta que comprasteis?» WHEN el análisis devuelve la candidata «¿Quién decidió esa compra dentro del equipo?» THEN la candidata se encola al frente de pendientes.
- GIVEN una cola con la pregunta pendiente «¿Qué herramienta usáis para las citas?» WHEN el análisis devuelve la candidata «¿Cuánto tiempo perdisteis la última semana por culpa de los no-shows?» (comparte alguna palabra pero el tema es otro) THEN la candidata se encola al frente de pendientes.
- GIVEN una cola vacía WHEN el análisis devuelve una candidata cualquiera no vacía THEN la candidata se encola (la similitud contra cola vacía nunca descarta).

### Primera barrera (prompt)

- GIVEN una sesión de asistente activa WHEN se construye el prompt de sistema THEN incluye la instrucción de no proponer preguntas iguales, casi iguales **ni reformulaciones del mismo tema con otras palabras** respecto a la lista de preguntas en cola.
- GIVEN una sesión de asistente activa WHEN se construye el prompt de sistema THEN incluye la instrucción de que, si la mejor siguiente pregunta ya está en la cola, se repita **exactamente el mismo texto** de la cola (para que la barrera determinista la capture) en lugar de reformularla.

### Regresión (invariantes de SPEC-021/023/036)

- GIVEN una sesión con varias llamadas de análisis WHEN se compara `systemBlocks` entre llamadas THEN es byte-idéntico (el cambio de similitud no introduce estado dinámico en el prefijo cacheado).
- GIVEN una cola de pendientes en su tamaño máximo WHEN el análisis devuelve una candidata no similar THEN se descarta por el gate de capacidad exactamente igual que antes (la nueva barrera no altera el orden de comprobaciones observable: primero similitud, después capacidad).
- GIVEN una candidata aceptada WHEN se encola THEN conserva el comportamiento de SPEC-036: entra al frente de pendientes con id propio e incrementa `suggestionCount`.

## Notas técnicas

- **Dónde vive el cambio:** `src/main/assistantService.ts` — la función determinista de similitud
  (`normalizeQuestion` / `isSimilarToQueue`) y el texto de `buildSystemPrompt`. Sin dependencias
  nuevas, sin llamadas LLM adicionales, sin cambios de schema ni de IPC.
- **Algoritmo determinista requerido** (debe quedar exportado para QA, como `normalizeQuestion`
  en SPEC-036):
  1. Normalizar ambos textos: minúsculas, **sin diacríticos** (NFD + eliminación de marcas
     combinantes, precedente de `db/search.ts`), sin puntuación, espacios colapsados.
  2. Tokenizar por espacios y eliminar *stopwords* españolas de una lista fija en código
     (artículos, preposiciones, conjunciones, pronombres e interrogativos: «que, como, cuanto,
     cuanta, cuantos, cuantas, quien, donde, cuando, por, para, de, del, la, el, los, las, un,
     una, unos, unas, y, o, en, con, sin, al, se, os, esa, ese, eso, esta, este, esto, vosotros,
     usted, ustedes, hoy, ahora, actualmente, vez» — la lista exacta puede ampliarse, pero debe
     ser fija y determinista).
  3. Reducción singular/plural ingenua: a cada token de más de 3 caracteres se le recorta una
     «s» final («citas»→«cita», «herramientas»→«herramienta»).
  4. Similitud = **coeficiente de solapamiento** `|A∩B| / min(|A|,|B|)` entre los conjuntos de
     tokens resultantes. Umbral: `>= 0.7` → casi idéntica → se descarta.
  5. Salvaguardas: si alguno de los dos conjuntos queda vacío tras las stopwords, se cae a la
     comparación de SPEC-036 (igualdad de textos normalizados). La igualdad exacta de
     normalizados sigue descartando siempre (superconjunto del comportamiento anterior).
- La comparación se hace contra **toda** la cola (pendientes + ancladas), como en SPEC-036.
- El texto del prompt de sistema es estático: puede cambiar entre releases sin romper la
  byte-estabilidad **dentro** de una sesión (patrón SPEC-036 sobre SPEC-023).
- El umbral y la lista de stopwords son constantes documentadas en código (patrón
  `MIN_NEW_FINAL_LINES`), ajustables por el humano sin cambiar el contrato.

## Decisiones asumidas

- [métrica de similitud] → asumido coeficiente de solapamiento sobre tokens significativos con
  umbral 0.7 (alternativa: Jaccard, más estricto con preguntas de longitud dispar; o similitud
  semántica vía LLM, descartada por coste/latencia — Riesgo #5 y NFR §4.1). Regla: control de
  coste de SPEC-016/021 — la barrera debe ser local y determinista.
- [ámbito de la comparación] → asumido solo contra la cola visible (pendientes + ancladas), no
  contra preguntas ya resueltas o descartadas en el pasado (alternativa: histórico de sesión;
  se descarta porque una pregunta legítimamente puede volver si el tema reaparece).
- [normalización] → asumido añadir eliminación de diacríticos a la normalización (alternativa:
  conservarla solo para la nueva métrica y dejar `normalizeQuestion` intacta); se asume que la
  igualdad exacta de SPEC-036 también pasa a ser insensible a diacríticos, comportamiento
  estrictamente más conservador (descarta más duplicados, nunca menos).
- [instrucción de repetición literal] → asumido pedir al modelo repetir el texto exacto de la
  cola cuando la mejor jugada ya esté encolada (alternativa: permitir `suggestedQuestion` vacía
  en el schema; se descarta por tocar el contrato del structured output y su parseo defensivo).
