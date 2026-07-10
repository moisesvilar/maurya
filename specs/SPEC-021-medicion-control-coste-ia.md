# SPEC-021 — Medición y control del coste de IA por entrevista

> Traza: NFR §4.5 (gestión de coste/tokens), Riesgo #5 del PRD ("Coste de IA por entrevista se
> dispara — control de frecuencia, límites configurables; medir coste por entrevista"). Ítem H7 del
> checklist "Medición y control de coste de IA por entrevista". El control de frecuencia del
> asistente ya existe (SPEC-016: 3 líneas/20 s/45 s); esta spec añade la MEDICIÓN del coste real y
> el LÍMITE configurable por entrevista. Aplica igual a entrevistas de empresa y a capturas sin
> empresa (SPEC-020).

## Descripción

Cada entrevista consume IA en tres frentes: el guión, el asistente en vivo y la nota de resumen.
Hoy ese gasto es invisible. Esta spec lo hace medible y controlable: la app registra los tokens de
cada llamada al LLM, muestra el coste estimado acumulado (en vivo durante la grabación y en el
detalle de la entrevista) y permite fijar un límite de coste por entrevista que, al alcanzarse,
pausa el asistente proactivo — nunca la grabación ni la transcripción.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes,
  páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests
  unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega.
  Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya
  commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador
  entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica
  explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura. En este
  proyecto no hay Supabase: el cambio afecta al JSON store local (campo opcional `aiUsage` en
  Interview y singleton de ajustes de coste; sin bump de schemaVersion — detalle en Notas técnicas).
- El control de frecuencia del asistente (SPEC-016) **no se modifica**: esta spec añade medición y
  un límite adicional por coste, no cambia los disparadores existentes.

## Criterios de aceptación

### Medición por llamada y acumulado por entrevista

- GIVEN una generación de guión completada con éxito WHEN el LLM responde THEN los tokens de entrada y salida de la respuesta se registran y el acumulado `aiUsage` de la entrevista (llamadas, tokens in/out, coste estimado en USD) se actualiza y persiste.
- GIVEN una generación de nota completada con éxito WHEN el LLM responde THEN su uso se suma al acumulado `aiUsage` de la entrevista igual que el guión.
- GIVEN una sesión de grabación con asistente activo WHEN el asistente completa análisis THEN el uso de cada análisis se acumula en memoria durante la sesión y, al detener la grabación, el total de la sesión se suma al `aiUsage` persistido de la entrevista y queda también registrado en el bloque `assistant` de `transcript.json`.
- GIVEN una llamada al LLM que falla WHEN se produce el error THEN el acumulado no cambia (solo se mide lo respondido con éxito).
- GIVEN una entrevista anterior a esta spec (sin campo `aiUsage`) WHEN se consulta su detalle THEN se muestra "Sin datos de coste" sin errores.

### Visualización

- GIVEN una grabación en curso con asistente activo WHEN el asistente lleva N análisis THEN el panel del asistente muestra una línea discreta de sesión "IA: {llamadas} llamadas · ~${coste}" actualizada tras cada análisis.
- GIVEN el detalle de una entrevista o captura con `aiUsage` WHEN se renderiza la cabecera THEN la fila muted de referencias incluye "IA ~${coste}" con Tooltip que desglosa llamadas y tokens (entrada/salida).
- GIVEN una entrevista con `aiUsage` nulo o a cero WHEN se renderiza el detalle THEN no se muestra importe alguno (sin "~$0.00" ruidoso).

### Límite configurable y control

- GIVEN la pantalla de Ajustes WHEN se renderiza THEN existe una card "Coste de IA" con un Input numérico "Límite por entrevista (USD)" (vacío = sin límite) y botón "Guardar" que persiste el ajuste y muestra Toast "Ajustes guardados".
- GIVEN un valor no numérico o negativo en el límite WHEN se pulsa "Guardar" THEN error inline "Introduce un importe positivo o deja el campo vacío" y no se persiste nada.
- GIVEN un límite configurado y una grabación en curso WHEN el coste acumulado de la entrevista (persistido + sesión) alcanza el límite THEN el asistente se pausa: no hace más llamadas al LLM y su panel muestra el aviso "Límite de coste alcanzado (${límite}). El asistente está en pausa; la grabación y la transcripción continúan." con un botón "Reanudar asistente".
- GIVEN el asistente pausado por límite WHEN se pulsa "Reanudar asistente" THEN el asistente vuelve a analizar con normalidad durante el resto de la sesión (el límite no vuelve a pausarlo en esa grabación) y el aviso desaparece.
- GIVEN el asistente pausado por límite WHEN sigue llegando transcripción THEN la grabación, la transcripción en vivo y el guión visible no se ven afectados en absoluto.
- GIVEN un límite alcanzado antes de iniciar una generación manual (guión o nota) WHEN el usuario la lanza THEN la generación se ejecuta igualmente (el límite solo pausa el asistente automático; las acciones manuales son decisión explícita del usuario).
- GIVEN sin límite configurado WHEN transcurre una sesión THEN el asistente nunca se pausa por coste y la medición funciona igual.

### Errores y edge cases

- GIVEN una respuesta del LLM sin bloque de uso (caso anómalo del SDK) WHEN se registra la llamada THEN se contabiliza la llamada con 0 tokens sin romper la generación ni la persistencia.
- GIVEN un fallo al persistir el acumulado tras una generación exitosa WHEN ocurre THEN el resultado de la generación NO se pierde (la escritura del guión/nota prevalece; el fallo de medición se registra en consola y no interrumpe al usuario).
- GIVEN el ajuste de límite corrupto o ilegible WHEN arranca la app THEN se comporta como "sin límite" sin crashear.

## UX Design

### Wireframe textual

**Pantalla 1 — Card "Coste de IA" en Ajustes (`/settings`) — se añade a la página existente (Layout 4)**

- Card (mismo patrón visual que las cards de API keys de SPEC-007): título "Coste de IA", descripción muted "Límite de gasto estimado por entrevista para el asistente en vivo. El guión y la nota no se bloquean."
- Cuerpo: label "Límite por entrevista (USD)" + Input numérico (placeholder "Sin límite", `inputmode="decimal"`) en una fila con Button (variant default) "Guardar" a la derecha.
- Bajo el input, texto muted permanente: "Coste estimado según la tarifa del modelo configurado en la app; orientativo, no factura real."
- Error inline bajo el Input cuando el valor no valida.

**Pantalla 2 — Línea de coste de sesión en el panel del asistente (durante la grabación)**

- En el pie del panel del asistente (AssistantPanel, junto a la zona de estado existente), texto muted tamaño xs: "IA: 4 llamadas · ~$0.12". Solo visible cuando hay ≥1 análisis completado en la sesión.
- Estado pausado por límite: sustituye la sugerencia por un Alert (variant default, icono PauseCircle) con el copy del AC y Button (variant outline, tamaño sm) "Reanudar asistente" dentro del Alert.

**Pantalla 3 — Coste en la cabecera del detalle (InterviewDetailPage y CaptureDetailPage)**

- En la fila muted de referencias existente se añade un segmento final "· IA ~$0.34" envuelto en Tooltip: "6 llamadas · 12.3k tokens entrada · 2.1k tokens salida". Sin `aiUsage` o a cero: el segmento no se renderiza.

### Componentes shadcn utilizados

Componentes: Card, Input, Button, Tooltip, Alert, Toast (sonner ya integrado).
Todos instalados en el proyecto; sin componentes adicionales.

### data-testid

- `ai-cost-settings-card` — la card "Coste de IA" en Ajustes
- `ai-cost-limit-input` — el input del límite
- `assistant-usage-line` — la línea "IA: N llamadas · ~$X" del panel del asistente
- `assistant-paused-alert` — el Alert de pausa por límite (contiene el botón "Reanudar asistente")
- `interview-ai-cost` — el segmento de coste de la cabecera del detalle

### Patrón de interacción

- **Card + Input + Guardar en Ajustes** (1 campo → sin Dialog/Sheet; mismo patrón que las cards de SPEC-007). Validación inline on submit; Toast en éxito (regla 5.1/6.1).
- **Alert para la pausa por límite**, no Toast: es información persistente que requiere una acción ("Reanudar") — regla 6.1 (Toast no sirve para confirmaciones que requieren acción). No es AlertDialog: no es destructivo ni bloqueante, y no debe interrumpir la grabación.
- **Tooltip para el desglose** de tokens: dato secundario corto on hover (regla 8.2).
- La línea de uso en el panel es glanceable y no compite con la sugerencia (coherente con RF-ASIS-004: feedback del tamaño justo).
- Decisión no cubierta por el design system: formato monetario. Se resuelve con USD, prefijo "~$" y 2 decimales (redondeo hacia arriba en el límite para pausar antes de excederlo), por ser la moneda de facturación de Anthropic.

### Comportamiento responsive

- **Mobile (< md):** la card de Ajustes apila label/input/botón en columna; la línea de uso del panel y el segmento de coste de cabecera no cambian (texto corto).
- **Tablet (md-lg):** interpolado entre mobile y desktop.
- **Desktop (lg+):** layout completo de los wireframes.

## Notas técnicas

- **Origen de los datos:** el SDK de Anthropic devuelve `usage: { input_tokens, output_tokens }` en cada respuesta de Messages. Los tres servicios de main (`llmService`, `noteService`, `assistantService`) deben extraerlo tras cada llamada exitosa. Prohibido tocar los parámetros de las llamadas (regla del modelo: nunca temperature/top_p/top_k/budget_tokens).
- **Tarifas:** tabla de precios por MTok de `claude-opus-4-8` como constantes en main (un solo módulo, p. ej. `src/main/aiCost.ts`, con el cálculo `coste = in/1e6·precioIn + out/1e6·precioOut`). No configurables por el usuario en esta spec.
- **Persistencia:** `Interview.aiUsage?: { calls: number; inputTokens: number; outputTokens: number; estimatedCostUsd: number } | null` — campo **opcional**, sin bump de `schemaVersion` ni migración (ausente = sin datos). El límite se persiste como singleton de ajustes en `db.json` (p. ej. campo opcional `aiCostSettings: { limitUsd: number | null }` a nivel raíz, tolerado por el chequeo estructural existente) con canales `db:*` envelope nuevos (get/set) + preload + tipos, siguiendo el patrón IPC de CLAUDE.md.
- **Acumulación del asistente:** en memoria durante la sesión (en `assistantService`), volcada a `Interview.aiUsage` y al bloque `assistant` de `transcript.json` al detener la grabación (evita una escritura de db.json por análisis). La comprobación del límite usa `aiUsage` persistido + acumulado de sesión, y se evalúa ANTES de lanzar cada análisis; "Reanudar" desactiva la comprobación solo para la sesión en curso.
- **Deepgram queda fuera**: NFR §4.5 y Riesgo #5 apuntan al LLM (análisis continuo); el coste STT no se mide en esta spec.
- Dependencias: SPEC-014 (guión), SPEC-016 (asistente y su resumen de sesión), SPEC-017 (nota), SPEC-020 (CaptureDetailPage comparte la cabecera con coste).

## Decisiones asumidas

- **Moneda y formato** → USD con "~$" y 2 decimales (alternativa: EUR con conversión). Regla: es la moneda de facturación de Anthropic; una conversión añadiría un tipo de cambio que no poseemos.
- **El límite solo pausa el asistente automático** (alternativa: bloquear también guión/nota) → las generaciones manuales son decisión explícita del usuario y puntuales; el riesgo #5 del PRD apunta al "análisis continuo". El copy de Ajustes lo deja claro.
- **"Reanudar" desactiva el límite para el resto de la sesión** (alternativa: re-pausar en cada múltiplo del límite) → evita el ciclo pausa/reanuda repetido en la misma llamada; el usuario ya tomó la decisión informada.
- **Tarifas como constantes en código, no configurables** (alternativa: inputs de precio en Ajustes) → menos superficie de error para un dato que cambia poco; si el precio cambia, se actualiza en una release.
- **Coste STT (Deepgram) excluido** (alternativa: estimarlo por minutos de audio) → el requisito traza al control del LLM; añadir STT mezclaría dos modelos de tarificación en el mismo indicador.
- **Sin histórico por llamada** (alternativa: log detallado de cada llamada) → el requisito pide medir y controlar por entrevista; el desglose por llamada es observabilidad que el PRD no pide.
- **`aiUsage` opcional sin migración** (alternativa: bump a schemaVersion 3 con backfill a cero) → un campo ausente ya expresa "sin datos"; una migración no aportaría información.
