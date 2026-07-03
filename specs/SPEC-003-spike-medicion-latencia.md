# SPEC-003 — Spike: medición de latencia extremo a extremo audio→texto

> Requisito origen: NFR §4.1 (latencia < 3-5 s) y Riesgo #3 · Hito H0 ítem 4 · Checklist: "Medir latencia extremo a extremo audio→texto y validar que es utilizable en directo"
> Relacionados: SPEC-002 (instrumentación por resultado final ya existente: `receivedAtMs − endMs`), último ítem de H0 (go/no-go, consumidor de estas métricas)
> Naturaleza: **SPIKE** que extiende el harness. La *validación* ("¿es utilizable en directo?") es juicio humano sobre una sesión real; esta spec entrega los números que ese juicio necesita.

## Descripción

Al terminar una sesión de captura con transcripción, el harness calcula y muestra las estadísticas de latencia de la transcripción (mediana, p95, máximo y nº de resultados) a partir de los deltas ya instrumentados en SPEC-002, y las persiste como metadatos del archivo de transcripción. Con una advertencia visual cuando el p95 supera el objetivo del PRD (5 s), el humano puede decidir el go/no-go de latencia con datos en vez de sensaciones.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya pusheado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura. **Sin Supabase** (harness Electron local).
- **Matiz de spike:** no hay UI de métricas en vivo; solo el resumen al detener. La sesión real de validación la ejecuta el humano.

## Criterios de aceptación

### Cálculo y visualización (happy path)

- GIVEN una sesión con transcripción y al menos un resultado final WHEN el usuario pulsa "Detener" THEN la sección Resultado muestra una fila "Latencia STT" con mediana, p95 y máximo en segundos (1 decimal) y el nº de resultados, p. ej. "Latencia STT: mediana 1,2 s · p95 2,8 s · máx 3,1 s · 14 resultados".
- GIVEN las estadísticas calculadas WHEN el p95 es menor o igual a 5 s THEN la fila se muestra con un Badge verde "OK".
- GIVEN las estadísticas calculadas WHEN el p95 supera los 5 s THEN la fila se muestra con un Badge rojo "Lenta" (además del color, el texto identifica el estado).

### Persistencia

- GIVEN una sesión con resultados finales WHEN se persiste el archivo de transcripción THEN el JSON incluye un objeto `latency` con `count`, `p50Ms`, `p95Ms` y `maxMs` coherentes con lo mostrado en pantalla.

### Empty state

- GIVEN una sesión sin ningún resultado final (sin transcripción o sin habla) WHEN el usuario pulsa "Detener" THEN la sección Resultado no muestra la fila "Latencia STT".

### Edge cases

- GIVEN una sesión donde hubo pérdida de conexión y reintento (SPEC-002) WHEN se calculan las estadísticas THEN se agregan los resultados de toda la sesión (ambos tramos de conexión).
- GIVEN una sesión con un único resultado final WHEN se calculan las estadísticas THEN mediana, p95 y máximo son ese único valor y `count` es 1.

## UX Design

### Wireframe textual

**Pantalla única — Harness (extensión de la sección Resultado)**

Sin secciones nuevas. En la **sección Resultado** (SPEC-001 §5, ampliada por SPEC-002), debajo de la fila de la transcripción:

- Fila "Latencia STT" (visible solo si hubo ≥1 resultado final): label `muted` "Latencia STT" + texto con las métricas ("mediana 1,2 s · p95 2,8 s · máx 3,1 s · 14 resultados") + Badge a la derecha: verde "OK" (p95 ≤ 5 s) o rojo "Lenta" (p95 > 5 s).

### Componentes shadcn utilizados

Ya instalados y suficientes: `Badge`. Sin componentes nuevos.

### Patrón de interacción

- **Métricas solo al detener, no en vivo**: mostrar latencia por resultado durante la llamada sería ruido sin decisión asociada (el juicio go/no-go es post-sesión); coherente con RF-ASIS-004 ("tamaño justo") del PRD. Decisión no cubierta por el design system, documentada aquí.
- **Estado no-solo-color** (regla 11.4): el Badge lleva texto "OK"/"Lenta" además del color.
- **Umbral 5 s**: extremo superior del objetivo orientativo del NFR §4.1 (3-5 s).

### Comportamiento responsive

- Desktop only (excepción documentada en SPEC-001; ventana Electron ≥720×640).

## Notas técnicas

- **Fuente de datos:** los deltas `receivedAtMs − endMs` por resultado final que `transcriptionService` (main) ya acumula/loguea desde SPEC-002. El cálculo (p50/p95/max por método del percentil más cercano sobre la lista ordenada) vive en main, junto a la acumulación; el renderer solo recibe el resumen.
- **Contrato:** `StopResult` se amplía con `latency: { count: number; p50Ms: number; p95Ms: number; maxMs: number } | null` (null si no hubo finales). El JSON persistido pasa de array plano a `{ lines: [...], latency: {...} }` — **cambio de forma del transcript.json**: actualizar el writer y cualquier consumidor (hoy ninguno externo; los tests de QA se adaptarán en su fase).
- **Formato UI:** segundos con 1 decimal y coma decimal (es-ES).
- **Redondeo del umbral:** la comparación es sobre `p95Ms > 5000`, no sobre el valor redondeado mostrado.
- **Divergencia de stack:** igual que SPEC-001/002 (Electron local; e2e no aplica).
- **Fuera de alcance:** métricas en vivo, histogramas, latencia de parciales (solo finales), y el propio veredicto de usabilidad (humano, con sesión real).
