# SPEC-060 — Onboarding de la app: primeros pasos guiados

> Origen: issue GitHub #35 «Onboarding de la app» (enhancement, petición humana directa). No traza a una fila del checklist (precedente SPEC-049/050/055/058: nada que marcar `[x]`). Cubre de forma natural RF-APP-005 (navegación/orientación) y apoya la puesta en marcha de RF-CFG-001 (claves y prompts), sin introducir requisitos nuevos de producto: los 8 pasos son los del issue.

## Descripción

Un usuario que instala Maurya por primera vez aterriza en una app vacía y no sabe por dónde empezar: sin claves de IA nada genera, sin plantillas los guiones y notas salen genéricos, y sin empresa/discovery/grupo no puede crear su primera entrevista real. Esta spec añade un banner de «Primeros pasos» en la página de inicio (Capturas) que guía al usuario por los 8 pasos del issue #35 —claves de IA, prompts, plantillas, primera empresa, primer contacto, primer discovery, primer grupo y primera entrevista— con un paso actual derivado del estado real de la app y una única acción primaria por paso que le lleva al lugar exacto donde completarlo. El banner guía, no bloquea: la app entera sigue usable en cualquier orden, y el banner avanza o retrocede solo según los datos.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura.
- En este proyecto no hay Supabase: la persistencia es el almacén JSON local (`db.json`). Los dos campos nuevos de esta spec se añaden como singleton opcional **sin bump de `schemaVersion`** (patrón `aiCostSettings`/`assistantSettings`), como indica "Notas técnicas".

## Modelo de pasos (referencia normativa para los ACs)

El banner muestra los 8 pasos del issue, en este orden y con estas etiquetas literales. «Completado» se **deriva** del estado real en cada carga; nunca se persiste el paso (patrón SPEC-058). El **paso actual** es el primero no completado en este orden; los pasos completados fuera de orden se muestran con check aunque vayan después del actual.

| # | Etiqueta literal | Condición de completado (derivada) | Destino del CTA |
| --- | --- | --- | --- |
| 1 | Configura las claves de IA | Clave Anthropic **y** clave Deepgram configuradas (`configured` en ambas) | `/settings?tab=api-keys` |
| 2 | Revisa los prompts personalizados | Marca persistida `promptsReviewedAt` no nula | `/settings?tab=custom-prompts` |
| 3 | Crea las plantillas de preguntas y notas | Existe ≥1 plantilla de preguntas **y** ≥1 plantilla de notas | `/settings?tab=interview-templates` si faltan de preguntas; si no, `/settings?tab=note-templates` |
| 4 | Crea la primera empresa | Existe ≥1 empresa | `/companies` |
| 5 | Añade el primer contacto | Existe ≥1 contacto en cualquier empresa | `/companies/:companyId` de la primera empresa del listado |
| 6 | Crea el primer discovery | Existe ≥1 discovery | `/discoveries` |
| 7 | Crea el primer grupo de entrevistas | Existe ≥1 grupo de entrevistas en cualquier discovery | `/discoveries/:discoveryId` del primer discovery del listado |
| 8 | Crea la primera entrevista | Existe ≥1 entrevista con grupo asignado (`interviewGroupId` no nulo) | `/discoveries/:discoveryId/groups/:groupId` del primer grupo existente |

El paso 2 es el único no derivable de los datos (los prompts tienen defaults y «revisar» no deja huella): pulsar su CTA navega **y** persiste `promptsReviewedAt` en el mismo gesto. El paso 8 exige entrevista **con grupo**: una captura (sin grupo) no lo completa, porque el objetivo del onboarding es recorrer el modelo completo.

Textos de apoyo del paso actual (una línea bajo la etiqueta, literales): 1 «Maurya necesita la clave de Claude para generar y la de Deepgram para transcribir.» · 2 «Los prompts definen cómo se comporta la IA; puedes personalizarlos o dejar los de serie.» · 3 «Las plantillas de preguntas alimentan el guión y las de notas dan forma al resumen.» · 4 «Las entrevistas se organizan por la empresa a la que entrevistas.» · 5 «Los contactos son las personas de la empresa que participan en las entrevistas.» · 6 «Un discovery agrupa todo el trabajo de descubrimiento de un problema.» · 7 «Los grupos organizan las entrevistas de un discovery y fijan sus plantillas.» · 8 «Crea la entrevista desde el grupo: hereda su plantilla y sus objetivos.»

Etiquetas literales de los CTA por paso: 1 «Ir a Ajustes» · 2 «Revisar prompts» · 3 «Crear plantillas» · 4 «Crear empresa» · 5 «Añadir contacto» · 6 «Crear discovery» · 7 «Crear grupo» · 8 «Crear entrevista».

## Criterios de aceptación

### Visibilidad y derivación

- GIVEN una instalación nueva (sin claves, sin datos, sin marcas persistidas) WHEN se carga `/captures` THEN el banner de primeros pasos se muestra con el paso 1 como actual y el contador «0 de 8».
- GIVEN el estado de derivación aún no resuelto WHEN se carga `/captures` THEN el banner no se renderiza (ni skeleton ni placeholder) y aparece solo cuando el estado está resuelto.
- GIVEN `hiddenAt` persistido no nulo WHEN se carga `/captures` THEN el banner no se renderiza.
- GIVEN la lectura del estado de derivación falla (envelope de error) WHEN se carga `/captures` THEN el banner no se renderiza y el resto de la página funciona con normalidad.
- GIVEN las 8 condiciones completadas y `hiddenAt` nulo WHEN se carga `/captures` THEN el banner muestra el estado final «¡Todo listo!» con los 8 pasos con check y el botón «Ocultar».
- GIVEN una empresa creada pero sin claves configuradas WHEN se carga `/captures` THEN el paso 4 se muestra completado y el paso actual sigue siendo el 1.

### Paso 1 — Claves de IA

- GIVEN el paso 1 como actual WHEN el usuario pulsa «Ir a Ajustes» THEN la app navega a `/settings?tab=api-keys`.
- GIVEN solo una de las dos claves configurada (Anthropic o Deepgram) WHEN se carga `/captures` THEN el paso 1 sigue sin completar y es el paso actual.
- GIVEN ambas claves configuradas WHEN se carga `/captures` THEN el paso 1 se muestra completado y el paso actual es el 2.

### Paso 2 — Prompts personalizados

- GIVEN el paso 2 como actual WHEN el usuario pulsa «Revisar prompts» THEN la app navega a `/settings?tab=custom-prompts` y persiste `promptsReviewedAt`.
- GIVEN `promptsReviewedAt` persistido WHEN se recarga `/captures` THEN el paso 2 se muestra completado sin volver a pedir revisión.

### Paso 3 — Plantillas

- GIVEN sin plantillas de preguntas ni de notas y el paso 3 como actual WHEN el usuario pulsa «Crear plantillas» THEN la app navega a `/settings?tab=interview-templates`.
- GIVEN ≥1 plantilla de preguntas y 0 de notas WHEN se carga `/captures` THEN el paso 3 sigue sin completar y su CTA navega a `/settings?tab=note-templates`.
- GIVEN ≥1 plantilla de preguntas y ≥1 de notas WHEN se carga `/captures` THEN el paso 3 se muestra completado.

### Pasos 4 a 8 — Primeras entidades

- GIVEN el paso 4 como actual WHEN el usuario pulsa «Crear empresa» THEN la app navega a `/companies`.
- GIVEN ≥1 empresa sin contactos y el paso 5 como actual WHEN el usuario pulsa «Añadir contacto» THEN la app navega al detalle de la primera empresa del listado.
- GIVEN ≥1 contacto en cualquier empresa WHEN se carga `/captures` THEN el paso 5 se muestra completado.
- GIVEN el paso 6 como actual WHEN el usuario pulsa «Crear discovery» THEN la app navega a `/discoveries`.
- GIVEN ≥1 discovery sin grupos y el paso 7 como actual WHEN el usuario pulsa «Crear grupo» THEN la app navega al detalle del primer discovery del listado.
- GIVEN ≥1 grupo de entrevistas y el paso 8 como actual WHEN el usuario pulsa «Crear entrevista» THEN la app navega al detalle del primer grupo existente.
- GIVEN una captura creada (entrevista sin grupo) y ninguna entrevista con grupo WHEN se carga `/captures` THEN el paso 8 sigue sin completar.
- GIVEN ≥1 entrevista con grupo asignado WHEN se carga `/captures` THEN el paso 8 se muestra completado.

### Retroceso derivado

- GIVEN los pasos 4 y 5 completados WHEN se elimina la última empresa (sus contactos caen en cascada) y se vuelve a `/captures` THEN el banner muestra el paso 4 como actual con los pasos 4 y 5 sin check.

### Ocultar

- GIVEN el banner visible en cualquier paso WHEN el usuario pulsa «Ocultar» THEN el banner desaparece y persiste `hiddenAt`.
- GIVEN `hiddenAt` persistido tras ocultar WHEN se recarga la app y se vuelve a `/captures` THEN el banner no reaparece.

## UX Design

### Wireframe textual

**Página: `/captures` (Layout 1 — Estándar, sin cambios de layout).** El banner es un Card que se inserta **entre la cabecera de la página (título «Capturas» + botón de crear) y el listado de capturas**, a todo el ancho del contenido. No hay página nueva ni wizard: cada CTA navega a superficies existentes de la app.

Estructura interna del Card (de arriba abajo):

- **Fila de cabecera del Card**: título «Primeros pasos con Maurya» (heading, icono Sparkles 20px a la izquierda) + contador «N de 8» (texto muted) alineados a la izquierda; a la derecha, botón «Ocultar» (Button variant ghost, icono X 16px, con texto visible «Ocultar»).
- **Lista vertical de los 8 pasos**, cada fila con: icono de estado a la izquierda (CheckCircle2 verde si completado; Circle muted si pendiente; CircleDot primary si actual) + etiqueta literal del paso (tabla del Modelo de pasos). Pasos completados y pendientes: solo icono + etiqueta en una línea (etiqueta muted en pendientes, normal en completados). Sin acciones en filas no actuales.
- **Paso actual expandido**: su fila añade, debajo de la etiqueta (en negrita), el texto de apoyo de una línea (muted) y el botón de acción (Button variant default, único primary del Card) con la etiqueta literal del CTA.
- **Estado final (8 de 8)**: la lista muestra los 8 checks y, en lugar de paso expandido, una línea «¡Todo listo! Ya tienes Maurya configurado y tu primera entrevista creada.» (texto normal, icono PartyPopper 20px). El botón «Ocultar» de la cabecera sigue siendo la única acción.

### Componentes shadcn utilizados

Componentes: Card, Button, Toast (solo el sistema ya global; este banner no dispara toasts propios). Iconos Lucide: Sparkles, CheckCircle2, Circle, CircleDot, X, PartyPopper. Sin componentes adicionales no instalados.

### data-testid

- `app-onboarding-banner` — el Card completo del banner.
- `app-onboarding-step-N` (N = 1..8) — la fila de cada paso, con atributo `data-state` = `done` | `current` | `pending` (precedente SPEC-055-iter-2).
- `app-onboarding-action` — el botón de acción del paso actual.
- `app-onboarding-hide` — el botón «Ocultar».

El resto de elementos (etiquetas, contador, textos de apoyo) son localizables por texto literal.

### Patrón de interacción

- **Checklist derivada en vez de wizard.** Decisión no cubierta por el design system: su regla 5.2 prescribe wizard para onboarding, pero aplica a formularios largos propios; aquí los 8 pasos se completan en páginas reales de la app (Ajustes, Empresas, Discoveries) y un wizard duplicaría todos esos formularios. Se resuelve con un banner-checklist de paso derivado, el patrón ya establecido por SPEC-058 en el detalle de entrevista (paso derivado del estado real, nunca persistido, una única acción primary por paso).
- **Una sola acción primary por paso** (precedente SPEC-058): el CTA del paso actual es el único Button variant default del Card; «Ocultar» es ghost.
- **El CTA navega, no ejecuta.** Cada paso se completa en su superficie nativa (con sus formularios, validaciones y toasts ya especificados en las specs de origen); el banner nunca abre diálogos remotos ni duplica formularios. Única excepción: el CTA del paso 2 además persiste la marca de revisión, porque navegar a los prompts ES el gesto de revisión.
- **Derivación al montar la página**: el banner se recalcula cada vez que se entra en `/captures` (volver de Ajustes o de otra sección re-monta la página y refresca los checks). No hay suscripción en vivo entre páginas.
- **Sin skeleton**: la derivación es local y resuelve en milisegundos; mostrar skeleton produciría flash (<100 ms, regla 6.4 del design system).
- **Feedback**: ocultar el banner no muestra Toast (no es una mutación de datos del dominio que el usuario deba confirmar; el propio banner desapareciendo es el feedback). No hay AlertDialog: ocultar no es destructivo ni irreversible en términos de datos (solo deja de mostrarse una guía).

### Comportamiento responsive

- **Mobile (< md):** misma estructura apilada; la fila de cabecera del Card pasa a dos líneas si no cabe (título+contador arriba, «Ocultar» a la derecha); el botón de acción del paso actual ocupa el ancho completo del área expandida.
- **Tablet (md-lg):** interpolado entre mobile y desktop.
- **Desktop (lg+):** layout completo del wireframe; el Card ocupa el ancho del contenido de `/captures`.

## Notas técnicas

- **Persistencia**: singleton `onboardingSettings` en `db.json` con `{ promptsReviewedAt: string | null, hiddenAt: string | null }` (ISO 8601), opcional y **sin bump de `schemaVersion`** (patrón `aiCostSettings`/`assistantSettings`: ausente = ambos null; normalización defensiva en lectura). Escritura solo desde main vía canales `db:*` dedicados con envelope `DbResult` (patrón de registro `handleDb`), nunca por patch genérico.
- **Derivación**: las condiciones 3-8 se computan en main sobre el snapshot del almacén; se sugiere un único canal agregado de solo lectura (p. ej. `db:onboarding-status:get`) que devuelva los booleanos derivados, los ids de destino necesarios para los CTA (primera empresa, primer discovery, primer grupo con su discovery) y el singleton, en una sola llamada — evita N llamadas de listado desde el renderer y la carrera entre ellas. La condición 1 (claves) se lee del canal existente `secrets:get-status` (`configured` de `anthropic` y `deepgram`; jamás cruza la clave en claro, invariante transversal).
- **«Primera» empresa / discovery / grupo** = la primera en el orden que ya devuelve el listado correspondiente del repositorio (no se define un orden nuevo).
- **Paso 8**: la condición es sobre `Interview.interviewGroupId` no nulo (modelo v3, SPEC-043); las capturas (sin grupo) no cuentan.
- **Relación con SPEC-058**: este onboarding es de nivel app y termina al crear la primera entrevista; el banner de SPEC-058 (dentro del detalle de entrevista) toma el relevo a partir de ahí. No comparten estado ni componentes.

## Decisiones asumidas

- [Forma del onboarding] → asumido banner-checklist con paso derivado en la home, no wizard ni tour modal (alternativa: wizard de página completa). Regla: precedente de la casa SPEC-058 + los pasos viven en páginas reales que un wizard duplicaría.
- [Ubicación] → asumido solo en `/captures` (la página de inicio de la app), entre cabecera y listado (alternativa: visible en todas las páginas). Regla: design system §8 — la guía es contenido de orientación, no navegación global; en las demás páginas sería ruido.
- [Paso 2 no derivable] → asumido que pulsar «Revisar prompts» navega y persiste la marca en el mismo gesto (alternativa: botón separado «Marcar como revisado», patrón «Objetivos revisados» de SPEC-058). Regla: una sola acción primary por paso; el banner guía, no audita.
- [«Ocultar» disponible en todo momento] → asumido visible en cualquier paso (alternativa: solo en el estado final, como SPEC-058). Regla: design system §6 — un banner de nivel app no descartable para un usuario que no quiere la guía es un anti-patrón de feedback persistente; SPEC-058 era per-entrevista y de vida corta.
- [Usuarios existentes con datos] → asumido que verán una única vez el estado final «¡Todo listo!» con «Ocultar» (alternativa: auto-ocultarse sin interacción si todo está completo al primer render). Regla: derivación pura sin heurísticas de primera ejecución; un click único es coste asumible y el comportamiento es predecible.
- [Ambas claves requeridas en el paso 1] → asumido Anthropic **y** Deepgram (alternativa: cualquiera de las dos). Regla: el issue las nombra juntas y el flujo completo (guión+asistente+nota y transcripción) necesita ambas.
- [Paso 3 con las dos familias de plantillas] → asumido ≥1 de preguntas **y** ≥1 de notas, con CTA que apunta a la pestaña de la familia que falte, preguntas primero (alternativa: dos pasos separados). Regla: el issue lo enuncia como un único paso «Plantillas de preguntas y notas».
- [Condición del paso 8] → asumido entrevista con grupo (`interviewGroupId` no nulo); las capturas no completan el paso (alternativa: cualquier entrevista/captura). Regla: el onboarding recorre el modelo completo empresa→discovery→grupo→entrevista y el paso 8 del issue sigue al 7 (grupo).
- [Fallo de derivación] → asumido que el banner simplemente no se renderiza (alternativa: error state con «Reintentar»). Regla: design system §7.5 aplica a contenido principal; una guía opcional no debe añadir ruido de error a la home.
