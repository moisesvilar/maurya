# SPEC-023 — Optimización de latencia del asistente en vivo (objetivo < 5 s)

> Traza: NFR §4.1 (latencia de la asistencia, objetivo < 3-5 s), ítem H7 del checklist
> "Optimización de latencia de la asistencia". Baseline medido en sesión real instrumentada
> (2026-07-10, app real + voz sintetizada + Deepgram + Claude): 3 ciclos analyzing→sugerencia de
> **5,85 / 6,06 / 4,95 s** con ~1.308 tokens de entrada y ~136 de salida por llamada — por encima
> del objetivo. Descomposición: la salida (~136 tok a velocidad de opus) domina con ~3-4,5 s; la
> entrada aporta ~1,5-2 s de TTFT.

## Descripción

Las sugerencias del asistente tardan hoy ~5-6 segundos en aparecer desde que arranca cada análisis,
por encima del objetivo de <5 s del PRD. Esta spec aplica dos optimizaciones que no alteran el
comportamiento funcional: cachear el prefijo fijo del prompt (instrucciones + guión/objetivos, que
no cambian durante la sesión) para recortar el tiempo de entrada, y acotar la longitud de la
sugerencia generada (pregunta y razón más concisas) para recortar el tiempo de salida, que es el
dominante. Además corrige la medición de coste para que el caché no falsee los importes de
SPEC-021. El cierre se valida re-midiendo con el mismo protocolo instrumentado del baseline.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes,
  páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests
  unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega.
  Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya
  commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador
  entregue será descartado o reemplazado.
- No hay cambios de schema de datos ni de canales IPC.
- **Regla del modelo intacta**: nunca `temperature`/`top_p`/`top_k`/`budget_tokens`. `cache_control`
  y los ajustes de prompt/schema/`max_tokens` sí están permitidos. Los disparadores de frecuencia de
  SPEC-016 (3 líneas / 20 s / 45 s) **no se tocan**.
- Sin UI nueva: solo main (`assistantService`, `aiCost`).

## Criterios de aceptación

### Caché del prefijo fijo del prompt

- GIVEN una sesión del asistente WHEN se construye cada llamada al LLM THEN el bloque fijo (instrucciones de sistema + guión y objetivos de la entrevista) va marcado con `cache_control` de tipo `ephemeral` y solo la ventana de transcripción queda fuera del prefijo cacheado.
- GIVEN dos análisis consecutivos de la misma sesión WHEN se inspeccionan las llamadas THEN el prefijo cacheado es byte a byte idéntico entre llamadas (condición necesaria para el acierto de caché; la ventana de transcripción es lo único que varía).
- GIVEN la generación de guión y de nota (SPEC-014/017) WHEN se construyen sus llamadas THEN quedan SIN cambios (son llamadas únicas donde el caché no aporta).

### Salida acotada

- GIVEN el schema de structured output del asistente WHEN se define THEN la pregunta sugerida y la razón declaran longitudes máximas acotadas en el propio schema, y el prompt instruye explícitamente brevedad (razón de una sola frase corta).
- GIVEN una sugerencia generada WHEN se muestra en el panel THEN conserva la misma estructura visible que hoy (badge de acción + pregunta + razón de una línea + chips de alarma): la optimización acorta el texto, no elimina elementos.
- GIVEN `max_tokens` del asistente WHEN se define THEN baja de 1024 a un valor coherente con la salida acotada, con margen (p. ej. 512), sin riesgo de truncado del JSON.

### Coste con caché (corrección de SPEC-021)

- GIVEN una respuesta del SDK con campos de caché (`cache_creation_input_tokens`, `cache_read_input_tokens`) WHEN se registra el uso THEN el coste estimado los incluye con sus tarifas reales (escritura de caché 1,25× la tarifa de entrada; lectura 0,1×), y los tokens de entrada reportados en el desglose suman los tres componentes.
- GIVEN una respuesta sin campos de caché WHEN se registra THEN el cálculo actual no cambia (retrocompatible).

### Validación de latencia (cierre del ítem)

- GIVEN el protocolo de medición instrumentada del baseline (sesión real, ≥3 ciclos analyzing→active) WHEN se repite tras la optimización THEN la mediana de los ciclos es **< 5 s** (registro en docs/MEMORY.md con los números). Este criterio se verifica por medición instrumentada, no por test unitario (MANUAL en el map con el protocolo referenciado).
- GIVEN que la mediana re-medida no baje de 5 s WHEN se evalúe el resultado THEN la decisión de cambiar el modelo del asistente (p. ej. a un modelo más rápido) se ESCALA al humano — no se toma en esta spec (contradice la elección de modelo documentada en CLAUDE.md).

## Notas técnicas

- **assistantService (`src/main/assistantService.ts`)**: el `system` pasa a formato de bloques con
  `cache_control: { type: 'ephemeral' }` en el último bloque fijo. El guión/objetivos deben moverse
  al prefijo fijo si hoy viajan en el mensaje de usuario junto a la ventana de transcripción — el
  mensaje de usuario debe quedar reducido a la parte variable (ventana + instrucción de análisis).
  Las llamadas van ≥20 s aparte y muy por debajo del TTL de 5 min del caché.
- **Schema**: los `maxLength` se declaran en el JSON Schema del structured output (el modelo los
  respeta) y el prompt refuerza la brevedad. Ojo con no cambiar los nombres de campos: el parseo y
  los tipos del renderer no cambian.
- **aiCost (`src/main/aiCost.ts`)**: `extractUsage` gana los campos de caché (defensivo, 0 si
  ausentes) y `computeCostUsd` sus tarifas (entrada $5/MTok, escritura caché $6,25/MTok, lectura
  $0,50/MTok, salida $25/MTok). `AiUsage` persistido no cambia de forma: los componentes de caché
  se pliegan en `inputTokens` (suma) y en el coste; sin migración.
- **Protocolo de medición** (reproducible, ya ejecutado para el baseline): app dev con
  `--remote-debugging-port`, listeners CDP sobre `assistant:update`, guion de ~10 frases con `say`
  por altavoces, mediana de los deltas analyzing→active. Documentado en docs/MEMORY.md (2026-07-10).
- Dependencias: SPEC-016 (asistente), SPEC-021 (medición de coste), CLAUDE.md (regla del modelo).

## Decisiones asumidas

- **Objetivo fijado en < 5 s (banda alta del NFR "3-5 s")** → el diferenciador es utilizable en
  conversación con <5 s; exigir <3 s forzaría el cambio de modelo, que es decisión humana.
- **Caché solo en el asistente** (alternativa: también guión/nota) → guión y nota son llamadas
  únicas por entrevista; el caché no amortiza y añadiría superficie.
- **`max_tokens` 512** (alternativa: dejar 1024) → con la salida acotada por schema, 1024 es el
  doble de margen del necesario; 512 mantiene margen amplio y evita colas largas anómalas.
- **Los componentes de caché se pliegan en `inputTokens`** (alternativa: campos nuevos en AiUsage)
  → evita cambio de schema; el desglose fino no tiene consumidor en la UI actual.
