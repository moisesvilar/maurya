# SPEC-014 — Guión personalizado y objetivos con IA (Claude)

> Requisitos origen: RF-GUION-002 (Must) + RF-GUION-003 (Must) + RF-GUION-004 (Must) + RF-GUION-005 (Should) · Hito H3 ítems 2-5 · Checklist: "Generar guión personalizado con LLM" + "Inyectar contexto histórico" + "Generar objetivos/metas" + "Editar guión y objetivos"
> Relacionados: SPEC-013 (detalle de entrevista con hueco del guión — su empty state se deroga parcialmente), SPEC-012 (template como base), SPEC-011 (datos de empresa/contacto), SPEC-007 (clave de Anthropic ya gestionable en Ajustes), SPEC-006 (Interview.scriptMarkdown/objectives/status; transcriptPath para el contexto histórico), Riesgo #6 del PRD (edición humana como salvaguarda)
> Naturaleza: feature de producto con UI. **Cierra H3.**

## Descripción

Desde el detalle de una entrevista en borrador, el usuario genera con Claude un guión personalizado: la IA parte del template asignado (bloques, preguntas y guías), lo adapta a la empresa y al contacto concretos y, si existen entrevistas anteriores de la misma empresa con transcripción o notas, incorpora ese contexto para no repetir lo ya validado. Junto al guión se generan los objetivos de la entrevista. El resultado es editable (Riesgo #6: control humano) y la entrevista pasa a estado "Preparada".

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya pusheado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura. **Sin Supabase**; la persistencia del guión usa la entidad Interview de SPEC-006 (campos ya existentes).
- **Matiz:** el consumo del guión durante la llamada (asistencia en vivo) es H5; la transcripción que alimenta el contexto histórico la producirá H4 (hoy el camino de código existe y se ejercita con datos de fixtures). **No hay clave de Anthropic en la máquina de desarrollo**: la verificación contra la API real queda pendiente de que el humano la configure (patrón SPEC-002).

## Criterios de aceptación

### Generación

- GIVEN una entrevista con template asignado y la clave de Anthropic configurada WHEN el usuario pulsa "Generar guión" THEN el botón pasa a estado de carga con el texto "Generando guión…" y, al terminar, se muestran el guión y los objetivos, la entrevista pasa al Badge "Preparada" y aparece el Toast "Guión generado".
- GIVEN una entrevista sin template asignado WHEN se muestra la sección Guión THEN el botón "Generar guión" está deshabilitado con el Tooltip "Asigna un template para generar el guión".
- GIVEN sin clave de Anthropic configurada (ni en Ajustes ni en el entorno) WHEN se muestra la sección Guión THEN aparece un Alert informativo con el texto "Configura tu clave de Anthropic en Ajustes para generar el guión" que enlaza a Ajustes, y el botón queda deshabilitado.
- GIVEN entrevistas anteriores de la misma empresa con transcripción o nota WHEN se genera el guión THEN el contexto enviado a la IA incluye ese material (comportamiento del servicio, verificable con fixtures).
- GIVEN una entrevista que ya tiene guión WHEN el usuario pulsa "Regenerar" THEN AlertDialog "Regenerar guión" ("Se sobrescribirán el guión y los objetivos actuales."); confirmar lanza una nueva generación.
- GIVEN un error de la API durante la generación (clave inválida, límite de uso, conexión) WHEN falla THEN aparece un Toast de error con la causa y la entrevista no cambia (ni guión ni estado).

### Visualización

- GIVEN una entrevista con guión WHEN se muestra el detalle THEN la sección Guión presenta el texto del guión conservando sus saltos de línea y estructura, y debajo la sección "Objetivos" con la lista de objetivos.
- GIVEN una entrevista sin guión y con los requisitos cumplidos WHEN se muestra la sección Guión THEN el empty state presenta "Aún no hay guión" con el botón "Generar guión" (deroga el secundario "La generación con IA llegará en la siguiente fase" de SPEC-013).

### Edición

- GIVEN una entrevista con guión WHEN el usuario pulsa "Editar" THEN el guión pasa a un Textarea editable y los objetivos a una lista editable (Input por objetivo, botones añadir/quitar con aria-labels "Añadir objetivo"/"Eliminar objetivo"), con botones Guardar/Cancelar.
- GIVEN el modo edición con cambios válidos WHEN el usuario pulsa "Guardar" THEN se persiste, aparece el Toast "Cambios guardados" y se vuelve al modo lectura.
- GIVEN el modo edición con cambios sin guardar WHEN el usuario pulsa "Cancelar" THEN AlertDialog "Descartar cambios"; sin cambios, vuelve directo al modo lectura.
- GIVEN objetivos con texto vacío al guardar WHEN se persiste THEN los objetivos vacíos se descartan silenciosamente (no son error).

## UX Design

### Wireframe textual

**Detalle de entrevista** (extiende SPEC-013, sección Guión):

1. **Cabecera de la sección** (heading `h3` "Guión") con las acciones a la derecha según estado:
   - Sin guión: Button (default, icono Sparkles) "Generar guión" (deshabilitado con Tooltip si falta template o clave; spinner inline + "Generando guión…" durante la generación).
   - Con guión (lectura): Button ghost (icono Pencil) "Editar" + Button outline (icono RefreshCw) "Regenerar".
2. **Alert informativo de clave** (variant default) cuando falta la clave: texto del AC con Link "Ajustes" → `/settings`.
3. **Cuerpo en lectura**: el guión como texto con `whitespace-pre-wrap` en un contenedor con borde suave y padding (sin renderizador de markdown — decisión documentada abajo); debajo, heading `h4` "Objetivos" + lista `ul` con un objetivo por línea (icono Target `muted` + texto).
4. **Cuerpo en edición**: Textarea (~14 filas, mono opcional) con el markdown; heading `h4` "Objetivos" + fila por objetivo (Input + Button ghost icon Trash2 aria-label "Eliminar objetivo") + Button outline (Plus) "Añadir objetivo"; sticky bottom bar local a la sección con Cancelar (outline) / Guardar (default).
5. **Empty state** (sin guión, requisitos OK): icono FileText, "Aún no hay guión", Button "Generar guión".

### Componentes shadcn utilizados

Ya instalados todos: `Button`, `Textarea`, `Input`, `Tooltip`, `Alert`, `AlertDialog`, `Badge`, `Toast/sonner`, `Skeleton`. Sin instalaciones nuevas de UI.

### Patrón de interacción

- **Generación como acción larga**: spinner inline en el botón + texto "Generando guión…" (regla 5.4, loading de acción; puede tardar >10 s → el propio texto evita el "loading indefinido"). El resto del detalle sigue usable.
- **Deshabilitados con Tooltip** (regla 5.4) para los dos prerequisitos (template, clave).
- **AlertDialog antes de regenerar** (sobrescribe trabajo — regla 6.3) y antes de descartar edición.
- **Sin renderizador de markdown**: el guión se muestra como texto pre-wrap. Decisión no cubierta por el design system: un renderer añade dependencia y superficie de estilo; el guión es para leerse en la llamada, el formato plano con saltos de línea es suficiente en el MVP (H7 puede mejorar).
- **Toast literal por acción** ("Guión generado", "Cambios guardados"); errores de API → Toast destructive con causa legible.
- **Estado "Preparada"** (Badge) al generar: el estado ya existe en el dominio; el Badge usa STATUS_LABELS de SPEC-013.

### Comportamiento responsive

- **Desktop (lg+):** completo. **Tablet/Mobile:** no aplican (excepción SPEC-001).

## Notas técnicas

- **Dependencia npm nueva autorizada:** `@anthropic-ai/sdk` (SDK oficial; estándar del proyecto para llamar a Claude — no usar fetch crudo). Vive SOLO en main.
- **Modelo y parámetros** (constantes en main): `claude-opus-4-8`, `thinking: { type: 'adaptive' }`, `max_tokens: 16000` (no streaming), **structured outputs** vía `output_config: { format: { type: 'json_schema', schema } }` con schema `{ scriptMarkdown: string, objectives: string[] }` (objetivos: 3-7, en español) y `additionalProperties: false`. Parsear `response.content` (bloque text) con JSON.parse tras filtrar bloques thinking. NUNCA enviar `temperature/top_p/top_k` ni `budget_tokens` (400 en este modelo).
- **Resolución de la clave en main** (patrón SPEC-007): 1º secrets cifrados (`getDecryptedSecret('anthropic')`) → 2º `process.env.ANTHROPIC_API_KEY` (.env.local) → 3º sin clave (estado UI). La clave jamás viaja al renderer.
- **llmService en main**: `generateInterviewScript(interviewId)` — carga del store la entrevista, empresa, contacto, template, y las entrevistas anteriores de la misma empresa (con su `transcriptPath` leído de disco si existe —campo `lines` del transcript.json— y su nota); construye el prompt (sistema: rol de preparador de entrevistas de discovery anclado a The Mom Test/Running Lean con la fase del template si existe; usuario: template completo con bloques/preguntas/guías + datos de empresa/contacto + contexto histórico truncado a un máximo razonable por transcript, p. ej. últimos ~8000 caracteres cada uno); llama a Claude; persiste `scriptMarkdown`, `objectives` y `status: 'prepared'` en la entrevista vía el repositorio; devuelve la Interview actualizada.
- **Errores tipados** (envelope estilo DbResult): `kind: 'no-key' | 'no-template' | 'auth' | 'rate-limit' | 'connection' | 'format'` — mapear desde las excepciones tipadas del SDK (`AuthenticationError`, `RateLimitError`, `APIConnectionError`, resto → connection/format). El renderer los mapea a Toasts.
- **Bridge:** `api.llm.getStatus(): Promise<{ hasAnthropicKey: boolean }>` y `api.llm.generateScript(interviewId): Promise<LlmResult<Interview>>`. La edición usa `api.db.updateInterview(id, { scriptMarkdown, objectives })` (patch existente de SPEC-006; el patch de SPEC-013 en el dialog NO cambia).
- **Regresión presupuestada en tests:** SPEC-013 AC-12 (empty state del guión con el secundario derogado) → QA remapea.
- **Verificación pendiente de humano:** generación real contra la API de Anthropic (configurar la clave en Ajustes) — el resto se testea con el SDK mockeado a nivel de servicio.
