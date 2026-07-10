# SPEC-025 — Objetivos destacados y evaluación de cumplimiento post-grabación

> Requisito origen: petición directa del humano (2026-07-10). Evoluciona el comportamiento de
> RF-GUION-004 (objetivos generados), RF-GUION-005 (edición) y RF-ASIS-005 (seguimiento en vivo).
> Relacionadas: SPEC-014 (guión + objetivos; deroga su AC de visualización de objetivos),
> SPEC-016 (asistencia en vivo; deroga sus ACs de "Objetivos en vivo"), SPEC-015 (flujo de parada
> de grabación), SPEC-021 (medición de coste de IA), SPEC-017 (patrón de generación post-llamada).

## Descripción

Los objetivos de la entrevista pasan a tener su propia sección "Objetivos", visible arriba del
todo del detalle de entrevista — entre la cabecera y la sección "Grabación" — para que durante la
llamada y después de ella el estado de los objetivos sea lo primero que ve el entrevistador. Al
finalizar la grabación, la app evalúa con el LLM qué objetivos se cumplieron: los cumplidos
cambian su icono a verde y todos (cumplidos o no) muestran debajo un motivo corto generado por IA
(máximo 50 palabras) explicando por qué se cumplieron o por qué no.

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
- En este proyecto no hay Supabase: "schema" significa el tipo de dominio del JSON store local
  (`db.json`). El nuevo campo de la entidad Interview se detalla en "Notas técnicas".

## Criterios de aceptación

### Sección Objetivos (ubicación y estados base)

- GIVEN una entrevista con objetivos WHEN se muestra el detalle de la entrevista THEN la sección "Objetivos" aparece entre la cabecera (título, Badge de estado y fila de referencias) y la sección "Grabación", con un objetivo por línea (icono Target muted + texto).
- GIVEN una entrevista sin objetivos WHEN se muestra el detalle THEN la sección "Objetivos" muestra el empty state "Sin objetivos" con el texto secundario "Se generan con el guión o se añaden editándolo".
- GIVEN una entrevista con guión WHEN se muestra la sección Guión en modo lectura THEN presenta únicamente el texto del guión, sin bloque de objetivos.
- GIVEN el modo edición del Guión WHEN el usuario edita los objetivos y guarda THEN la sección "Objetivos" superior refleja la lista actualizada sin recargar la página.

> Derogación — el AC de SPEC-014 ("Visualización": "GIVEN una entrevista con guión WHEN se muestra
> el detalle THEN la sección Guión presenta el texto del guión conservando sus saltos de línea y
> estructura, y debajo la sección 'Objetivos' con la lista de objetivos") queda obsoleto y debe
> entenderse derogado en su segunda parte: el guión se sigue mostrando igual, pero los objetivos ya
> no se renderizan dentro de la sección Guión — los sustituyen los ACs de esta sección. La edición
> de objetivos dentro del modo edición del Guión (SPEC-014) NO cambia.

### Seguimiento en vivo durante la grabación

- GIVEN una entrevista con objetivos y el asistente activo WHEN un análisis del asistente marca objetivos como cubiertos THEN la sección "Objetivos" superior muestra esos objetivos con icono CheckCircle2 verde, mientras los pendientes conservan el icono Target muted.
- GIVEN la grabación en curso WHEN se muestra el panel del asistente THEN ya no se renderiza ningún panel de objetivos bajo el panel del asistente (el seguimiento vive solo en la sección superior).

> Derogación — los dos ACs de SPEC-016 bajo "### Objetivos en vivo" ("GIVEN una entrevista con
> objetivos generados WHEN la grabación está en curso THEN el panel muestra la lista de objetivos
> con su estado (pendiente/cubierto) actualizado por el asistente en cada análisis" y "GIVEN una
> entrevista sin objetivos WHEN se graba THEN el panel de objetivos no se muestra (sin error)")
> quedan obsoletos y deben entenderse derogados: los sustituyen los ACs de esta sección y el empty
> state de la sección superior. La lógica de seguimiento acumulativo de `objectivesMet` en main
> (SPEC-016) NO cambia — solo cambia dónde se pinta.

### Evaluación al finalizar la grabación

- GIVEN una entrevista con objetivos, transcripción con líneas finales y clave de Anthropic configurada WHEN el usuario detiene la grabación THEN la grabación se guarda de inmediato (WAV, transcript y asociación como hasta ahora) sin esperar a la evaluación.
- GIVEN la evaluación de objetivos lanzada tras la parada WHEN está en curso THEN la sección "Objetivos" muestra el indicador "Evaluando objetivos…" (Loader2 girando, inline en la cabecera de la sección).
- GIVEN la evaluación completada WHEN se muestra la sección THEN cada objetivo cumplido muestra icono CheckCircle2 verde y cada objetivo no cumplido conserva el icono Target en su color original (muted).
- GIVEN la evaluación completada WHEN se muestra la sección THEN debajo de cada objetivo (cumplido o no) aparece un texto corto muted con el motivo generado por el LLM (máximo 50 palabras).
- GIVEN una evaluación completada WHEN el usuario sale del detalle y vuelve a entrar THEN el resultado (estados e motivos) se muestra desde lo persistido, sin lanzar una nueva evaluación.
- GIVEN objetivos marcados como cubiertos en vivo por el asistente WHEN la evaluación final concluye que alguno no se cumplió THEN prevalece la evaluación final (el icono vuelve a Target muted y el motivo explica por qué no se cumplió).
- GIVEN una entrevista sin clave de Anthropic configurada WHEN se detiene la grabación THEN no se realiza ninguna llamada al LLM y los objetivos quedan sin evaluar, sin error visible.
- GIVEN una entrevista sin objetivos WHEN se detiene la grabación THEN no se lanza evaluación.
- GIVEN una sesión cuya transcripción no produjo ninguna línea final WHEN se detiene la grabación THEN no se lanza evaluación y la sección queda en estado neutro.
- GIVEN el límite de coste de IA de la entrevista ya superado (SPEC-021) WHEN se detiene la grabación THEN la evaluación no se lanza.
- GIVEN la llamada de evaluación falla (error de red o de la API) WHEN termina THEN el guardado de la grabación no se ve afectado, la sección vuelve al estado neutro y aparece el Toast de error "No se pudieron evaluar los objetivos".
- GIVEN una evaluación completada WHEN se consulta el coste de la entrevista THEN el uso de la llamada de evaluación está acumulado en el aiUsage de la entrevista (mecanismo SPEC-021).

### Evaluación manual

- GIVEN una entrevista con objetivos, con transcript asociado y sin evaluación persistida WHEN se muestra la sección "Objetivos" THEN aparece el botón "Evaluar objetivos" (variant outline, icono Sparkles) en la cabecera de la sección.
- GIVEN el botón "Evaluar objetivos" habilitado WHEN el usuario lo pulsa THEN pasa al estado "Evaluando objetivos…" (Loader2, disabled) y al terminar con éxito se muestran los resultados y el Toast "Objetivos evaluados".
- GIVEN una entrevista sin clave de Anthropic configurada WHEN se muestra el botón "Evaluar objetivos" THEN está deshabilitado con Tooltip "Configura tu clave de Anthropic en Ajustes para evaluar los objetivos".
- GIVEN una entrevista con evaluación ya persistida WHEN se muestra la sección THEN el botón "Evaluar objetivos" no se muestra.
- GIVEN una entrevista sin transcript asociado WHEN se muestra la sección THEN el botón "Evaluar objetivos" no se muestra.

### Invalidación por edición y regeneración

- GIVEN una entrevista con evaluación persistida WHEN el usuario edita la lista de objetivos (cambia el texto, el orden, añade o elimina alguno) y guarda THEN la evaluación se descarta y la sección vuelve al estado neutro (con el botón "Evaluar objetivos" disponible si hay transcript).
- GIVEN una entrevista con evaluación persistida WHEN el usuario guarda una edición donde solo cambió el texto del guión THEN la evaluación se conserva intacta.
- GIVEN una entrevista con evaluación persistida WHEN el usuario confirma "Regenerar" el guión THEN los objetivos se sobrescriben y la evaluación previa se descarta.

## UX Design

### Wireframe textual

**Detalle de entrevista** (Layout 2 — Página de detalle; la página no cambia de layout, solo se
inserta una sección y se retira contenido de otras dos):

1. **Cabecera** (sin cambios): back button "Volver", h1 título + Badge estado, fila muted de
   referencias (empresa · contacto · template · coste IA).
2. **Sección "Objetivos"** (NUEVA, inmediatamente después de la cabecera y antes de "Grabación"):
   - Fila de cabecera: heading `h3` "Objetivos" a la izquierda; a la derecha, según estado:
     - Botón "Evaluar objetivos" (Button variant `outline`, icono Sparkles) — solo si hay
       objetivos, hay transcript y no hay evaluación persistida. Deshabilitado + Tooltip si falta
       la clave de Anthropic.
     - Indicador "Evaluando objetivos…" (Button variant `outline` disabled con Loader2
       `animate-spin`) mientras hay una evaluación en curso (automática o manual).
     - Nada, si no aplica ninguno de los anteriores.
   - Cuerpo: lista `ul` con un `li` por objetivo:
     - Icono a la izquierda del texto: `Target` muted (pendiente / no cumplido) o `CheckCircle2`
       verde `text-green-600` (cumplido — en vivo por el asistente o por la evaluación final).
       Sin tachado del texto en ningún estado.
     - Texto del objetivo en `text-sm`.
     - Debajo del texto (alineado con él, no con el icono), solo tras evaluación: motivo en
       `text-sm text-muted-foreground` (≤50 palabras).
   - Empty state (sin objetivos): centrado en la sección, icono Target muted 24px, "Sin objetivos"
     y texto secundario "Se generan con el guión o se añaden editándolo".
3. **Sección "Grabación"** (sin cambios estructurales, salvo que el panel de objetivos bajo el
   panel del asistente desaparece — el seguimiento en vivo se pinta en la sección 2).
4. **Sección "Nota"** (sin cambios).
5. **Sección "Guión"** (modo lectura: solo el texto del guión, sin bloque "Objetivos"; modo
   edición: sin cambios — conserva Textarea + lista editable de objetivos + sticky bottom bar).

### Componentes shadcn utilizados

Componentes: Button, Tooltip, Badge, Skeleton (los ya presentes en la página), Toast (sonner, ya
global). Iconos Lucide: Target, CheckCircle2, Sparkles, Loader2.
Sin componentes adicionales no instalados.

### data-testid

- `objectives-section` — el contenedor de la nueva sección "Objetivos".
- `objectives-evaluate-button` — el botón "Evaluar objetivos".
- `objective-item` — cada `li` de objetivo; lleva además el atributo `data-state` con valor
  `pending` (sin evaluar), `met` (cumplido) o `unmet` (evaluado y no cumplido), para que los tests
  asserten el estado sin depender del icono.
- `objective-reason` — el texto de motivo bajo cada objetivo evaluado.

El resto de elementos (headings, empty state, Toasts, Tooltip) son localizables por role/text.

### Patrón de interacción

- **Ubicación de la sección:** los objetivos son estado de identidad de la entrevista y su
  indicador de progreso principal; van en la zona superior, siempre visibles y nunca en tab o
  colapsable (design system §8.3 — zona superior para datos de identidad/estado).
- **Icono como indicador de estado:** el cumplido cambia de forma (Target → CheckCircle2) además
  de color (verde), porque el color nunca puede ser el único indicador (design system §11.4).
  Se elimina el tachado que usaba el panel de SPEC-016: con el motivo debajo, el texto tachado
  perjudica la lectura del par objetivo+motivo.
- **Evaluación en segundo plano:** la parada de la grabación nunca espera al LLM — mismo principio
  de degradabilidad que la transcripción respecto al WAV. La espera se comunica con Loader2 inline
  (spinner de acción, no Skeleton: es una acción, no una carga de layout conocido — §6.4).
- **Feedback:** Toast en éxito de la evaluación manual ("Objetivos evaluados") y Toast de error si
  la evaluación falla ("No se pudieron evaluar los objetivos") — §6.1. La evaluación automática
  tras parar no muestra Toast de éxito propio (ya existe "Grabación guardada"; dos Toasts
  encadenados abruman): el resultado en la sección es el feedback.
- **Botón deshabilitado con Tooltip explicativo** cuando falta la clave (§5.4), mismo patrón que
  "Generar guión" (SPEC-014).
- Decisión no cubierta por el design system: color verde de estado "cumplido" (`text-green-600`).
  Se resuelve manteniendo el verde ya introducido por SPEC-016 para objetivos cubiertos, por
  consistencia interna.

### Comportamiento responsive

- **Mobile (< md):** misma estructura vertical; los motivos hacen wrap bajo su objetivo; el botón
  "Evaluar objetivos" permanece visible en la cabecera de la sección (nunca se oculta la acción —
  §9.2), pasando bajo el heading si no cabe en la fila.
- **Tablet (md-lg):** interpolado entre mobile y desktop.
- **Desktop (lg+):** layout completo del wireframe.

## Notas técnicas

- **Nuevo campo de dominio** en `Interview`: `objectiveResults?: Array<{ met: boolean; reason: string }> | null`,
  alineado por índice con `objectives`. Opcional y sin bump de `schemaVersion` (mismo patrón que
  `aiUsage` en SPEC-021: ausente = sin evaluación). Solo lo escribe main; no es escribible por el
  patch genérico del renderer. Invariante del repositorio: cualquier mutación que cambie la lista
  `objectives` (edición con cambios en los objetivos, regeneración de guión) descarta
  `objectiveResults`.
- **La evaluación corre íntegra en main** (invariante de seguridad de claves), disparada tras
  completarse `recording:stop` (con el transcript ya persistido) o por el canal de evaluación
  manual. Input: objetivos numerados + líneas finales de la conversación etiquetadas por
  fuente/hablante (mismo etiquetado que el asistente, SPEC-016) + los índices `objectivesMet` del
  seguimiento en vivo como pista explícitamente no vinculante.
- **Llamada única a Claude**: `claude-opus-4-8`, structured outputs con schema
  `{ evaluations: Array<{ met: boolean, reason: string }> }` (una entrada por objetivo, en el mismo
  orden; `reason` en español, instruida en prompt a 30-50 palabras máximo) y
  `additionalProperties: false`. **Nunca** enviar `temperature`/`top_p`/`top_k`/`budget_tokens`
  (400 en este modelo). Si el array devuelto no casa en longitud con los objetivos, la evaluación
  se trata como fallida (no se persiste un resultado desalineado).
- **Coste**: el uso de la llamada se acumula en `aiUsage` vía el mecanismo de SPEC-021
  (`recordInterviewUsage`), y el límite configurado actúa como guard previo al lanzamiento.
- **Refresco del renderer**: al terminar la evaluación, main persiste y notifica (evento tipado por
  IPC, patrón `assistant:update`, o refetch equivalente) para que la sección se actualice aunque la
  evaluación se lanzara automáticamente; si el usuario navegó fuera, el resultado queda persistido
  y se muestra al volver.

## Decisiones asumidas

- La edición de objetivos se mantiene en el modo edición del Guión (SPEC-014) → asumido no mover la
  edición a la nueva sección (alternativa: sección Objetivos con su propio "Editar"). Criterio:
  guión y objetivos se generan, regeneran y descartan juntos; separar la edición duplicaría flujos
  de dirty-check y AlertDialogs sin pedirlo el requisito.
- El panel de objetivos en vivo de SPEC-016 se elimina y la sección superior asume el seguimiento
  en vivo → asumido (alternativa: mantener ambos). Criterio: dos listas de objetivos simultáneas en
  la misma pantalla durante la grabación son redundantes y contradicen "feedback del tamaño justo".
- Motivo también para los objetivos cumplidos → asumido según el literal del requisito ("porqué se
  ha cumplido el objetivo o porqué no").
- Con evaluación ya persistida no hay botón "Reevaluar" → asumido (alternativa: permitir
  reevaluar). Criterio: control de coste; para forzar una reevaluación basta editar los objetivos
  (descarta el resultado) o grabar de nuevo.
- La evaluación final prevalece sobre el seguimiento en vivo → asumido (alternativa: unión de
  ambos). Criterio: la evaluación ve la conversación completa; el seguimiento en vivo es parcial
  por ventanas.
- Límite de coste superado → la evaluación no se lanza (silencioso, sin Toast) → asumido, coherente
  con la pausa del asistente de SPEC-021 (alternativa: lanzarla igualmente por ser una única
  llamada).
