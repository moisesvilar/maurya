# SPEC-053 — Soporte multilenguaje independiente por función

## Descripción

Hoy toda la app opera en español: los textos de la interfaz, los prompts de generación (guión, asistente, notas) y el parámetro de idioma de la transcripción de Deepgram están fijados en español en el código. Esta spec introduce un ajuste de idioma **independiente por función** — interfaz, generación de guión, transcripción, asistente en vivo y generación de notas — de modo que el usuario pueda, por ejemplo, usar la interfaz en inglés, entrevistar en español (transcripción y asistente en español) y recibir las notas de resumen en inglés. Idiomas soportados en esta primera versión: español e inglés, con defaults en español que preservan el comportamiento actual.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya commiteado, en un paso posterior del pipeline de QA de SOMO.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura.
- **Fuera de alcance**: idiomas distintos de español e inglés; detección automática de idioma y transcripción multilingüe (`language=multi` de Deepgram); override de idioma por entrevista o por discovery (los cinco ajustes son globales); traducción o migración de contenido ya persistido (guiones, notas, transcripciones y prompts personalizados existentes no se tocan); traducción de las plantillas de preguntas y de notas del usuario (son contenido suyo, en el idioma que él elija); renombrar identificadores de código, rutas, claves de `db.json` o data-testid (el código sigue hablando inglés técnico).

## Criterios de aceptación

### Ajustes de idioma (persistencia y pestaña)

- GIVEN un `db.json` existente sin bloque de idiomas WHEN se abre la pestaña «Idioma» de Ajustes THEN los cinco selects (Interfaz, Guión, Transcripción, Asistente, Notas) muestran «Español».
- GIVEN la pestaña «Idioma» WHEN el usuario cambia el valor de un select THEN el ajuste se persiste y aparece un Toast «Idioma actualizado».
- GIVEN un valor de idioma desconocido persistido en un campo (p. ej. `'fr'` escrito a mano) WHEN se cargan los ajustes THEN ese campo se resuelve al default español sin romper la página ni el resto de campos.
- GIVEN un fallo del envelope de persistencia al guardar WHEN el usuario cambia un select THEN se muestra un Toast destructivo con el mensaje de error y el select recupera su valor anterior.
- GIVEN los ajustes aún cargando WHEN se pinta la pestaña «Idioma» THEN se muestran Skeletons en lugar de los selects.
- GIVEN un fallo de carga de los ajustes WHEN se pinta la pestaña «Idioma» THEN se muestra un error state con botón «Reintentar» que relanza la carga.
- GIVEN idioma de transcripción distinto del idioma del asistente WHEN se pinta la pestaña «Idioma» THEN aparece un Alert informativo (no bloqueante) indicando que el asistente leerá la conversación en un idioma y sugerirá preguntas en otro.
- GIVEN los cinco ajustes en «Español» WHEN se usa cualquier función de la app THEN el comportamiento es idéntico al actual (sin regresiones).

### Interfaz

- GIVEN idioma de interfaz «English» WHEN se navega por la app THEN los textos estáticos de la interfaz (navegación, títulos, botones, labels, placeholders, empty states, tooltips, Toasts, AlertDialogs y mensajes de error visibles) se muestran en inglés.
- GIVEN idioma de interfaz «English» WHEN se pintan fechas u horas localizadas THEN usan el locale inglés en lugar del `es-ES` actual.
- GIVEN un cambio del idioma de interfaz WHEN se guarda THEN la UI visible se actualiza al idioma nuevo sin reiniciar la app.
- GIVEN una clave de texto sin traducción en el catálogo del idioma activo WHEN se pinta el elemento THEN se muestra el texto del catálogo español como fallback (nunca una clave técnica cruda).
- GIVEN idioma de interfaz «English» e idioma de notas «Español» WHEN se pinta la sección Nota de una entrevista THEN el chrome de la sección (labels, botones, tooltips) está en inglés y el contenido generado de la nota permanece en español.

### Generación de guión

- GIVEN idioma de guión «English» WHEN se genera el guión de una entrevista THEN `scriptMarkdown` y los `objectives` devueltos están redactados en inglés.
- GIVEN una plantilla de preguntas escrita en español e idioma de guión «English» WHEN se genera el guión THEN se conserva la estructura de bloques de la plantilla con títulos, preguntas y guías adaptados y traducidos al inglés.
- GIVEN idioma de guión «English» WHEN se regeneran los objetivos de una entrevista THEN los objetivos regenerados están en inglés.
- GIVEN idioma de guión «English» y el research de LinkedIn configurado WHEN se genera el informe de contexto THEN el informe está redactado en inglés.
- GIVEN la pestaña «Prompts personalizados» WHEN se muestran las reglas bloqueadas del prompt de guión THEN la línea de idioma aparece como parte dinámica con la convención de corchetes existente («[Según el idioma configurado] Escribe TODO en …») en lugar del literal fijo español.

### Transcripción

- GIVEN idioma de transcripción «English» WHEN se inicia una grabación THEN la conexión a Deepgram se abre con `language=en` y el resto de parámetros de la URL idénticos a los actuales.
- GIVEN idioma de transcripción «Español» WHEN se inicia una grabación THEN la URL de conexión es byte a byte la histórica (con `language=es`).
- GIVEN el fallback de degradación sin diarización WHEN se activa tras rechazos repetidos de Deepgram THEN la reconexión conserva el idioma de transcripción configurado.
- GIVEN una grabación en curso WHEN el usuario cambia el idioma de transcripción en Ajustes THEN la grabación en curso no se ve afectada y el idioma nuevo aplica a partir de la siguiente grabación.

### Asistente en vivo

- GIVEN idioma del asistente «English» WHEN la llamada interactiva produce una sugerencia THEN `suggestedQuestion` y `reason` están redactados en inglés y respetan los topes de caracteres vigentes.
- GIVEN idioma del asistente «English» WHEN se evalúan las señales de alarma THEN el prompt usa ejemplos de cumplidos, genéricos e hipotéticos en inglés (equivalentes a los españoles actuales).
- GIVEN idioma del asistente «English» WHEN se compara la similitud entre preguntas sugeridas THEN la deduplicación usa el conjunto de stopwords inglesas (no las españolas).
- GIVEN idioma del asistente «English» WHEN corre la llamada de mantenimiento (resolución de cola y objetivos) THEN sus salidas visibles al usuario están en inglés.
- GIVEN idioma de transcripción «Español» e idioma del asistente «English» WHEN el asistente analiza la ventana de conversación THEN opera con normalidad leyendo la transcripción española y sugiriendo en inglés.
- GIVEN la pestaña «Prompts personalizados» WHEN se muestran las reglas bloqueadas del prompt del asistente THEN la línea de idioma aparece como parte dinámica con la convención de corchetes existente.

### Generación de notas

- GIVEN idioma de notas «English» WHEN se genera la nota de resumen THEN el `contentMarkdown` de todas las secciones está redactado en inglés.
- GIVEN una plantilla de notas con títulos de sección en español e idioma de notas «English» WHEN se genera la nota THEN los `title` de las secciones generadas se traducen al inglés conservando el orden y la correspondencia una a una con la plantilla.
- GIVEN una transcripción en español e idioma de notas «English» WHEN se genera la nota THEN las citas textuales del interlocutor se conservan entre comillas en su idioma original (español) dentro de la prosa inglesa.
- GIVEN idioma de notas «English» WHEN se exporta la nota a Markdown THEN el contenido exportado refleja la nota tal como se generó (en inglés), sin retraducciones.
- GIVEN la pestaña «Prompts personalizados» WHEN se muestran las reglas bloqueadas del prompt de notas THEN la línea de idioma aparece como parte dinámica con la convención de corchetes existente.

## UX Design

### Wireframe textual

**Ajustes — pestaña nueva «Idioma»** (Layout de Ajustes existente, contenedor `max-w-[640px]`):

- La lista de pestañas pasa a: «Claves de IA», «Plantillas de notas», «Plantillas de preguntas», «Prompts personalizados», «Idioma» (nueva, última).
- Contenido de la pestaña: `<p>` descriptivo («Configura el idioma de cada función por separado: puedes entrevistar en un idioma y recibir las notas en otro») seguido de cinco campos apilados con `gap-6`.
- Cada campo: Label + línea `text-muted-foreground` explicativa + Select (opciones «Español» y «English»), en este orden con estos labels y descripciones literales: «Idioma de la interfaz» («Textos de menús, botones y pantallas»), «Idioma del guión» («Guiones, objetivos e informes de contexto generados por IA»), «Idioma de la transcripción» («Idioma en el que hablarán los participantes de la entrevista»), «Idioma del asistente» («Preguntas sugeridas y alarmas durante la entrevista»), «Idioma de las notas» («Notas de resumen generadas al finalizar»).
- Si idioma de transcripción ≠ idioma del asistente: Alert informativo (variante default, icono Info) bajo los selects afectados con el texto «El asistente leerá la conversación en un idioma y sugerirá preguntas en otro. Es intencional si tú y tu interlocutor habláis idiomas distintos.».
- Estados: loading (5 Skeletons h-10), error (icono AlertTriangle + mensaje + Button «Reintentar»).

**Resto de pantallas**: sin cambios de layout, componentes ni flujos. Con idioma de interfaz «English» cambian exclusivamente los textos (catálogo es/en); la estructura de cada pantalla es la vigente.

### Componentes shadcn utilizados

Componentes: Tabs, Select, Label, Alert, Toast, Skeleton, Button (todos ya presentes en el proyecto; no se instala ningún componente nuevo).

### data-testid

- `language-select-ui` — select del idioma de la interfaz
- `language-select-script` — select del idioma del guión
- `language-select-transcription` — select del idioma de la transcripción
- `language-select-assistant` — select del idioma del asistente
- `language-select-notes` — select del idioma de las notas
- `language-divergence-alert` — el Alert de divergencia transcripción/asistente

Se definen testids pese a existir labels porque los labels cambian con el idioma de interfaz activo: los testids dan un locator estable independiente del idioma.

### Patrón de interacción

- **Persistencia por campo, sin botón «Guardar»**: cada select es una mutación atómica e independiente (cinco ajustes sin relación de validación entre sí); Toast «Idioma actualizado» tras cada cambio, revert del select + Toast destructivo si el envelope devuelve error. Decisión no cubierta explícitamente por el design system para grupos de selects independientes: se resuelve con guardado inmediato por campo porque un formulario con Guardar añadiría un estado intermedio sin valor (no hay campos interdependientes que validar juntos).
- **Aviso de divergencia como Alert informativo, no bloqueante**: la combinación transcripción ≠ asistente es un caso de uso legítimo (entrevistador e interlocutor con idiomas distintos); bloquear o pedir confirmación castigaría el caso válido.
- **Cambio de idioma de interfaz en caliente**: la UI se re-renderiza con el catálogo nuevo sin reinicio, siguiendo el patrón del cambio de tema ya existente.

### Comportamiento responsive

- **Mobile (< md):** los cinco campos apilados a ancho completo; el Alert ocupa el ancho del contenedor.
- **Tablet (md-lg):** interpolado entre mobile y desktop.
- **Desktop (lg+):** wireframe completo dentro del contenedor `max-w-[640px]` de Ajustes; los selects con ancho contenido (`max-w-xs`), no a ancho completo.

## Notas técnicas

- **Persistencia**: bloque nuevo `languageSettings` en el store de `db.json`, siguiendo el patrón de `assistantSettings`/`aiTaskSettings` (canal `db:*` con envelope `DbResult`, getters/setters en el bridge y tipos en `types/domain.ts`). Tipo sugerido: `AppLanguage = 'es' | 'en'` (unión ampliable) y `LanguageSettings` con los cinco campos; la resolución con defaults debe tolerar bloques ausentes o valores desconocidos (retrocompatibilidad con `db.json` existentes).
- **Superficies del main afectadas**: `prompts/defaults.ts` (la línea «Escribe TODO en español» de los tres prompts pasa a ser dinámica según el ajuste; las `lockedRules` mostradas en Ajustes la representan con la convención de corchetes), `llmService.ts`, `noteService.ts`, `assistantService.ts` (prompt interactivo, ejemplos de alarmas y `QUESTION_STOPWORDS` por idioma — hace falta el set inglés y revisar que la reducción singular/plural ingenua siga siendo válida en inglés), `objectiveEvaluationService.ts`, `objectiveOverrideService.ts`, `contextService.ts` (informe LinkedIn), `deepgramService.ts` (`buildDeepgramUrl` parametrizada con el idioma) y `transcriptionService.ts` (propagación del ajuste al conectar).
- **Interfaz**: no existe infraestructura de i18n; hace falta un catálogo de mensajes es/en para el renderer (la librería concreta la decide el plan de implementación) y parametrizar los locales de fecha hardcodeados (`'es-ES'` en `NewCaptureDialog.tsx`, `LatencyRow.tsx`, `DiscoveriesPage.tsx` y cualquier otro que aparezca en el barrido). Es, con diferencia, el mayor volumen de trabajo de la spec (~100 componentes con strings inline).
- **Validación externa Deepgram**: antes de dar por buena la transcripción en inglés hay que validar manualmente que `language=en` mantiene la calidad con la combinación `multichannel + diarize + interim_results` vigente; el fallback sin diarización de la degradación elegante ya cubre el peor caso. Ampliar el enum de idiomas en el futuro exige repetir esta validación por idioma.
- **Trazabilidad**: petición humana directa (2026-07-24). El PRD excluía el multilenguaje del MVP (exclusión 6, «Por evaluar»; notas de las líneas de alcance «UI en español en el MVP»): esta spec materializa esa evaluación pendiente por decisión humana. `docs/prd.md` y `docs/checklist.md` no se modifican. **La spec no entra al pipeline ahora**: queda versionada para cuando el humano la priorice en base al feedback de más usuarios.
- **Plan por fases**: existe un plan de implementación pre-autorizado en `docs/plans/SPEC-053-plan.md` con el orden de ejecución recomendado (infraestructura → transcripción → generación → asistente → interfaz) y la posibilidad de trocear la ejecución cuando se priorice.

## Decisiones asumidas

- Idiomas soportados v1 → asumido español + inglés (alternativa: catálogo amplio de idiomas de Deepgram). Criterio: cada idioma añadido exige validación manual de calidad STT y un catálogo de UI traducido completo; se amplía el enum cuando haya demanda real.
- Ámbito de los ajustes → asumido global (los cinco en Ajustes) sin override por entrevista (alternativa: default global + override en cada entrevista). Criterio: mínima superficie para la primera versión; el override por entrevista queda como evolución natural si el feedback lo pide.
- Divergencia transcripción ≠ asistente → asumido Alert informativo no bloqueante (alternativa: bloquear o pedir confirmación). Criterio: es un caso de uso legítimo con interlocutores de idiomas distintos.
- Citas textuales en notas cuando el idioma de notas difiere del de la conversación → asumido conservarlas en el idioma original entre comillas (alternativa: traducirlas). Criterio: la cita es evidencia; traducirla rompe la fidelidad que exige el prompt de notas.
- Títulos de sección de la nota generada → asumido traducirlos al idioma de notas (alternativa: conservarlos en el idioma de la plantilla). Criterio: una nota mezclando títulos españoles y prosa inglesa es incoherente para su destinatario.
- Guardado de la pestaña «Idioma» → asumido persistencia inmediata por campo con Toast (alternativa: formulario con botón Guardar). Criterio: cinco mutaciones atómicas independientes sin validación cruzada.
- Fallback del catálogo de UI → asumido español (alternativa: mostrar la clave o el inglés). Criterio: el español es el catálogo de origen y siempre está completo.
- Granularidad de la spec → asumida spec paraguas única que cubre las cinco funciones, con ejecución por fases descrita en el plan (alternativa: cinco specs independientes). Criterio: petición humana explícita de una sola spec versionada; al priorizarse podrá trocearse en iteraciones o specs derivadas si el pipeline lo requiere.
