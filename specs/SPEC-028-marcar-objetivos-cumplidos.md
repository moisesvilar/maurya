# SPEC-028 — Marcar y desmarcar objetivos como cumplidos con comentario

> Requisito origen: petición directa del humano (2026-07-11), sección «Marcar y desmarcar
> objetivos como cumplidos» de `docs/drafts/improvements-20260711.md` (checklist H9, ítem 1).
> Evoluciona RF-GUION-004 (objetivos generados) y RF-ASIS-005 (seguimiento de objetivos).
> Relacionadas: SPEC-025 (sección Objetivos + evaluación post-grabación, base directa de esta
> spec), SPEC-021 (medición de coste de IA), SPEC-014 (edición de objetivos en el Guión).

## Descripción

El entrevistador puede corregir a mano el veredicto de cumplimiento de cada objetivo: marcarlo
como cumplido o como no cumplido aportando un comentario propio. La explicación previa generada
por la evaluación LLM se conserva visible pero tachada y, debajo, aparece una explicación nueva
reescrita por el LLM a partir del comentario del humano y de la evidencia previa. Así el humano
tiene la última palabra sobre el estado de los objetivos sin perder el rastro de lo que la IA
había concluido.

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

### Apertura del diálogo de cumplimiento

- GIVEN una entrevista con objetivos WHEN se muestra la sección "Objetivos" THEN cada objetivo presenta a la derecha un botón icon-only (lápiz, aria-label "Editar cumplimiento del objetivo") que abre el diálogo de cumplimiento.
- GIVEN un objetivo sin marca manual previa WHEN el usuario abre el diálogo THEN el RadioGroup "Cumplido / No cumplido" aparece preseleccionado con el estado contrario al que el objetivo muestra en ese momento y el Textarea "Comentario" vacío.
- GIVEN un objetivo con marca manual previa WHEN el usuario abre el diálogo THEN el RadioGroup refleja el estado manual vigente y el Textarea contiene el comentario guardado.

### Marcado con comentario (happy path)

- GIVEN el diálogo abierto con "Cumplido" seleccionado y un comentario no vacío WHEN el usuario pulsa "Guardar" THEN el botón pasa a estado de carga (Loader2, disabled), el LLM reescribe la explicación y al terminar el diálogo se cierra, el objetivo muestra icono CheckCircle2 verde y aparece el Toast "Objetivo actualizado".
- GIVEN un objetivo con evaluación LLM previa y marca manual guardada WHEN se muestra la sección THEN la explicación de la evaluación previa aparece tachada (line-through) y debajo aparece la explicación reescrita por el LLM sin tachar.
- GIVEN el diálogo abierto con "No cumplido" seleccionado y un comentario no vacío WHEN el usuario pulsa "Guardar" THEN el objetivo queda con icono Target muted y debajo la explicación previa tachada más la explicación reescrita.
- GIVEN una marca manual guardada WHEN el usuario sale del detalle y vuelve a entrar THEN el estado manual, la explicación tachada y la explicación reescrita se muestran desde lo persistido, sin llamadas nuevas al LLM.

### Precedencia del estado manual

- GIVEN un objetivo marcado manualmente como cumplido WHEN una evaluación previa lo daba por no cumplido THEN el icono mostrado es CheckCircle2 verde (la marca manual prevalece sobre la evaluación).
- GIVEN un objetivo marcado manualmente como no cumplido y el asistente en vivo marcándolo como cubierto WHEN se muestra la sección durante la grabación THEN el icono mostrado es Target muted (la marca manual prevalece sobre el seguimiento en vivo).

### Marcado sin evaluación previa

- GIVEN una entrevista con objetivos sin evaluación LLM persistida WHEN el usuario marca un objetivo manualmente con comentario THEN la marca se guarda y se muestra la explicación reescrita, sin ninguna explicación tachada (no había explicación previa).

### Validación

- GIVEN el diálogo abierto con el Textarea vacío WHEN el usuario pulsa "Guardar" THEN aparece el error inline "El comentario es obligatorio" bajo el Textarea y no se realiza ninguna llamada ni persistencia.
- GIVEN el diálogo con error inline visible WHEN el usuario escribe un comentario y vuelve a pulsar "Guardar" THEN el error desaparece y el flujo continúa con normalidad.

### Cancelación y errores

- GIVEN el diálogo abierto con cambios WHEN el usuario pulsa "Cancelar" (o Escape) THEN el diálogo se cierra sin persistir nada y el objetivo conserva su estado anterior.
- GIVEN la llamada de reescritura falla (error de red o de la API) WHEN termina THEN el diálogo permanece abierto conservando la selección y el comentario, y aparece el Toast de error "No se pudo actualizar el objetivo".
- GIVEN una entrevista sin clave de Anthropic configurada WHEN el usuario guarda una marca manual con comentario THEN la marca se persiste sin llamada al LLM y como explicación nueva se muestra el comentario literal del usuario.

### Coste e invalidación

- GIVEN una reescritura completada WHEN se consulta el coste de la entrevista THEN el uso de la llamada está acumulado en el aiUsage de la entrevista (mecanismo SPEC-021).
- GIVEN objetivos con marcas manuales WHEN el usuario edita la lista de objetivos (texto, orden, altas o bajas) y guarda THEN las marcas manuales se descartan junto con la evaluación (invariante SPEC-025).
- GIVEN objetivos con marcas manuales WHEN el usuario confirma "Regenerar" el guión THEN las marcas manuales se descartan junto con la evaluación previa.

## UX Design

### Wireframe textual

**Sección "Objetivos" del detalle de entrevista** (Layout 2 — Página de detalle; la sección de
SPEC-025 gana una acción por objetivo y dos líneas de explicación; nada más cambia de sitio):

1. Cabecera de la sección (sin cambios): heading `h3` "Objetivos" + botón "Evaluar objetivos" /
   indicador "Evaluando objetivos…" según SPEC-025.
2. Lista `ul` con un `li` por objetivo:
   - Icono de estado a la izquierda (sin cambios de forma/color): `CheckCircle2` verde
     `text-green-600` (cumplido) o `Target` muted (pendiente / no cumplido). El estado mostrado
     resuelve con precedencia: **marca manual > evaluación final > seguimiento en vivo**.
   - Texto del objetivo en `text-sm`, ocupando el ancho disponible.
   - A la derecha de la fila: Button icon-only (variant `ghost`, size `icon`, icono `Pencil`
     16px, `aria-label` "Editar cumplimiento del objetivo").
   - Debajo del texto (alineado con él), en este orden y solo las líneas que apliquen:
     - Explicación de la evaluación LLM previa en `text-sm text-muted-foreground`; **con
       `line-through` únicamente si existe marca manual**.
     - Explicación reescrita (o comentario literal si no hay clave) en
       `text-sm text-muted-foreground`, sin tachar.
3. **Diálogo de cumplimiento** (Dialog — 2 campos, interacción < 30 s, no necesita ver la página
   detrás):
   - Título: "Cumplimiento del objetivo". Descripción: el texto del objetivo en muted.
   - RadioGroup vertical con 2 opciones: "Cumplido" / "No cumplido".
   - Label "Comentario" + Textarea (placeholder "¿Por qué? Aporta la evidencia u observación que
     justifica el cambio", 3-4 filas). Campo obligatorio; error inline "El comentario es
     obligatorio" debajo si se envía vacío.
   - Pie: Button "Cancelar" (variant `outline`) a la izquierda del Button "Guardar" (variant
     `default`; con Loader2 `animate-spin` y disabled mientras se reescribe).

### Componentes shadcn utilizados

Componentes: Button, Dialog, Textarea, Label, RadioGroup, Tooltip, Toast (sonner, ya global).
Componente adicional necesario: RadioGroup (verificar instalación; añadir si no está en el
scaffold). Iconos Lucide: Pencil, CheckCircle2, Target, Loader2.

### data-testid

- `objective-override-button` — el botón lápiz de cada objetivo.
- `objective-override-dialog` — el Dialog de cumplimiento.
- `objective-override-comment` — el Textarea del comentario.
- `objective-override-text` — la explicación reescrita (o comentario literal) bajo el objetivo.
- `objective-reason` — (ya existe, SPEC-025) la explicación de la evaluación previa; cuando hay
  marca manual lleva además el atributo `data-overridden="true"` para assertar el tachado sin
  depender de clases CSS.
- `objective-item` — (ya existe) conserva `data-state` (`pending` | `met` | `unmet`), que ahora
  refleja la precedencia con la marca manual incluida.

El resto de elementos (radios, botones del pie, Toasts) son localizables por role/label/text.

### Patrón de interacción

- **Dialog y no Sheet ni página**: 2 campos y < 30 s de interacción (design system §4.1); no hay
  necesidad de ver la página detrás.
- **RadioGroup y no Select ni Switch**: opción binaria con las dos opciones visibles (§4.4;
  anti-patrón: Select para 2 opciones). Se preselecciona el estado contrario al vigente porque la
  intención dominante al abrir es cambiarlo; el usuario puede reafirmar el estado actual si solo
  quiere corregir el comentario.
- **Acción inline por item**: una única acción frecuente por objetivo → inline button icon-only
  ghost (§7.4), con `aria-label` obligatorio (§11.3).
- **Validación**: obligatoriedad on submit con error inline bajo el campo (§5.1); el botón
  "Guardar" nunca se deshabilita por validación incompleta.
- **Feedback**: Toast en éxito ("Objetivo actualizado") y Toast destructive en fallo de la
  reescritura ("No se pudo actualizar el objetivo") — §6.1. El diálogo no se cierra en el fallo
  para no perder el comentario escrito.
- **Cancelar sin AlertDialog**: descartar el contenido del diálogo no es destructivo sobre datos
  persistidos (solo se pierde un comentario a medio escribir); Escape/Cancelar cierran sin
  confirmación (§6.3 aplica a acciones irreversibles, no a este caso).
- **Tachado como historial**: el texto tachado nunca es el único indicador del override — coexiste
  con la explicación nueva debajo y el atributo `data-overridden` (§11.4, el estilo visual no es
  el único canal).
- Decisión no cubierta por el design system: mantener visible la explicación LLM previa tachada en
  vez de sustituirla. Se resuelve conservándola (requisito literal del humano: rastro de lo que la
  IA concluyó frente a la corrección humana).

### Comportamiento responsive

- **Mobile (< md):** misma estructura vertical; el botón lápiz permanece visible a la derecha de
  cada objetivo (nunca se oculta la acción, §9.2); las explicaciones hacen wrap bajo su objetivo;
  el Dialog ocupa el ancho disponible con margen estándar de shadcn.
- **Tablet (md-lg):** interpolado entre mobile y desktop.
- **Desktop (lg+):** layout completo del wireframe.

## Notas técnicas

- **Nuevo campo de dominio** en `Interview`:
  `objectiveOverrides?: Array<{ met: boolean; comment: string; text: string } | null> | null`,
  alineado por índice con `objectives` (entrada `null` = objetivo sin marca manual). Opcional y
  sin bump de `schemaVersion` (patrón `aiUsage`/`objectiveResults`). `comment` es el literal del
  humano; `text` la explicación reescrita por el LLM (o el comentario literal si no hay clave).
  Solo lo escribe main; no es escribible por el patch genérico del renderer. Invariante del
  repositorio: cualquier mutación que cambie la lista `objectives` descarta `objectiveOverrides`
  igual que ya descarta `objectiveResults`.
- **La reescritura corre íntegra en main** (invariante de seguridad de claves), por un canal IPC
  nuevo de la familia `llm:*` (envelope `LlmResult`) que recibe `interviewId`, índice del
  objetivo, `met` y `comment`, y devuelve la entrevista actualizada. Persistir solo tras parseo
  válido de la respuesta.
- **Llamada única a Claude**: `claude-opus-4-8`, structured outputs con schema
  `{ text: string }` (`additionalProperties: false`; `text` en español, instruido en prompt a
  30-50 palabras máximo, mismo estilo que los motivos de SPEC-025). Input: texto del objetivo,
  estado manual (`met`), comentario del humano y, si existe, la explicación de la evaluación
  previa como evidencia a integrar (el ejemplo del requisito combina ambas: cifra de gasto de la
  evaluación + estructura de decisión del comentario). **Nunca** enviar
  `temperature`/`top_p`/`top_k`/`budget_tokens` (400 en este modelo).
- **Sin clave de Anthropic**: no se llama al LLM; se persiste `text = comment` (feature degradable
  pero operativa, mismo principio que el asistente inerte sin clave).
- **Coste**: el uso de la llamada se acumula en `aiUsage` vía `recordInterviewUsage` (SPEC-021).
  Sin guard de límite: es una acción manual explícita (patrón "Evaluar objetivos" manual de
  SPEC-025).
- **Precedencia en el renderer**: el estado visual por objetivo resuelve
  `objectiveOverrides[i] ?? objectiveResults[i] ?? liveMet` (manual > evaluación final > vivo).
  Una evaluación LLM posterior (botón "Evaluar objetivos" tras editar… no aplica: la edición
  descarta ambos campos; no existe reevaluación con overrides vigentes porque el botón solo
  aparece sin evaluación persistida — si hay overrides sin evaluación y el usuario evalúa, los
  overrides prevalecen visualmente y se conservan).

## Decisiones asumidas

- Punto de entrada del marcado → asumido botón lápiz icon-only por objetivo que abre un Dialog
  (alternativa: toggle directo sobre el icono de estado sin diálogo). Regla: el comentario es
  obligatorio en el requisito, luego siempre hay formulario; Dialog de 2 campos (§4.1) y acción
  inline única por item (§7.4).
- Estado preseleccionado al abrir sin marca previa → asumido el contrario al mostrado (la
  intención de quien abre es corregir). Alternativa: preseleccionar el estado actual.
- El diálogo permite tanto marcar como desmarcar y también re-editar una marca existente (mismo
  formulario, RadioGroup) → asumido para cubrir "marcar o desmarcar" con un solo flujo.
  Alternativa: acción de un solo sentido según el estado.
- Comentario obligatorio (Textarea requerido) → asumido según el literal "junto con un comentario".
  Alternativa: comentario opcional con reescritura solo si existe.
- Sin clave de Anthropic la marca funciona y persiste el comentario literal como explicación →
  asumido por el principio transversal de degradabilidad (asistente inerte, transcripción
  degradable). Alternativa: deshabilitar el lápiz con Tooltip pidiendo la clave.
- Sin guard de límite de coste en la reescritura → asumido por ser acción manual explícita, patrón
  del botón "Evaluar objetivos" (SPEC-025) y "Reanudar" (SPEC-021). Alternativa: bloquear al
  superar el límite.
- La marca manual prevalece sobre cualquier evaluación (final o en vivo) y se conserva si llega
  una evaluación posterior → asumido: la palabra del humano es el override de mayor rango
  (RF-GUION-005, control humano). Alternativa: una evaluación nueva limpia las marcas.
- Fallo de la reescritura → nada se persiste (ni la marca) y el diálogo queda abierto → asumido
  para mantener marca+explicación como unidad atómica. Alternativa: persistir la marca con el
  comentario literal y reintentar la reescritura después.
