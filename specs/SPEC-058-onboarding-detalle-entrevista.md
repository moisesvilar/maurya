# SPEC-058 — Onboarding guiado en el detalle de entrevista

## Descripción

Las páginas de detalle de entrevista no le dicen al usuario qué toca hacer en cada momento, aunque el flujo es lineal (plantilla → guión → objetivos → grabación → nota → evaluación). Se añade un banner de guía bajo la cabecera que muestra siempre un único paso con una única acción, calculado a partir del estado real de la entrevista, en las dos páginas de detalle: la de una entrevista dentro de un discovery (`InterviewDetailPage`) y la de la sección «Capturas» (`CaptureDetailPage`). Origen: petición humana directa (precedente SPEC-049/050/051/055: no está en `docs/checklist.md` → nada que marcar `[x]`); los pasos guían funcionalidad ya implementada de RF-GUION (guión y objetivos), RF-AUDIO (grabación) y RF-NOTE (nota) — esta spec no añade capacidades de IA nuevas.

## Diseño / mockups

Diseño acordado con el humano (mockups M0–M7 + M5b, criterio de estilo, decisiones con descartes): https://claude.ai/code/artifact/c0c7219a-421d-4327-9e2f-e1c85d5f5ab3

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura.
- Los dos campos nuevos de `Interview` (`objectivesConfirmedAt`, `onboardingHiddenAt`) son opcionales y NO llevan bump de `schemaVersion` ni migración (patrón `aiUsage`/`objectiveResults`); ver Notas técnicas.

## Criterios de aceptación

### Derivación del paso

GIVEN una entrevista sin plantilla (`templateId === null`) y sin guión WHEN se carga el detalle THEN el banner muestra el paso 1 «Asigna una plantilla de preguntas» con el eyebrow «Paso 1 de 7» y el botón «Asignar plantilla».

GIVEN una entrevista con plantilla asignada y sin guión (`scriptMarkdown === null`) WHEN se carga el detalle THEN el banner muestra el paso 2 «Genera el guión antes de la entrevista» con el botón «Generar guión».

GIVEN una entrevista con guión, sin grabación asociada y sin `objectivesConfirmedAt` WHEN se carga el detalle THEN el banner muestra el paso 3 «Revisa los objetivos» con el botón «Objetivos revisados».

GIVEN una entrevista con guión, `objectivesConfirmedAt` presente y sin grabación asociada WHEN se carga el detalle THEN el banner muestra el paso 4 «¡Todo listo para la entrevista!» con el botón «Iniciar grabación».

GIVEN una entrevista con grabación asociada, con transcript (`transcriptPath` no nulo), sin nota y sin estado `summarized` WHEN se carga el detalle THEN el banner muestra el paso 5 «Genera la nota de la entrevista» con el botón «Generar nota».

GIVEN una entrevista con grabación asociada pero sin transcript (`transcriptPath === null`) y sin nota WHEN se carga el detalle THEN el banner muestra el paso 5 degradado con el título «La grabación no tiene transcripción», la descripción indicando que la nota no se puede generar con IA y el botón «Escribir nota».

GIVEN una entrevista con nota (existe nota asociada o estado `summarized`) y sin `objectiveResults` WHEN se carga el detalle THEN el banner muestra el paso 6 «Evalúa los objetivos» con el botón «Evaluar objetivos».

GIVEN una entrevista con nota y con `objectiveResults` presentes WHEN se carga el detalle THEN el banner muestra el paso 7 «¡Entrevista finalizada!» con check verde y el botón «Ocultar».

GIVEN una entrevista con guión generado a la que después se le desasigna la plantilla WHEN se carga el detalle THEN el banner NO muestra el paso 1 sino el paso que corresponda al resto de datos.

GIVEN una entrevista con grabación, `objectiveResults` ya presentes (evaluación previa a la nota) y sin nota WHEN se genera la nota THEN el banner pasa directamente al paso 7 sin pasar por el 6.

GIVEN el banner en el paso N WHEN se renderiza THEN el indicador de progreso muestra 7 segmentos con los N−1 primeros en estado hecho, el segmento N en estado actual y los restantes en estado pendiente.

GIVEN una grabación en curso en la página WHEN el controller está capturando THEN el banner no se muestra.

GIVEN una entrevista con `onboardingHiddenAt` presente WHEN se carga el detalle THEN el banner no se muestra.

### Acciones por paso

GIVEN el banner en el paso 1 WHEN se pulsa «Asignar plantilla» THEN se abre el diálogo de edición de la entrevista con el select «Plantilla de preguntas» (`EditInterviewDialog` en el detalle de entrevista, `EditCaptureDialog` en el detalle de captura).

GIVEN el diálogo de edición abierto desde el paso 1 WHEN se guarda con una plantilla seleccionada THEN el banner pasa al paso 2 sin recargar la página.

GIVEN el banner en el paso 2 WHEN se pulsa «Generar guión» THEN se dispara la misma generación que el botón de la sección Guión y ambos botones muestran el estado «Generando guión…» deshabilitado hasta terminar.

GIVEN que no hay clave de Anthropic configurada WHEN el banner está en el paso 2 THEN su botón está deshabilitado con un Tooltip con el mismo motivo que muestra la sección Guión.

GIVEN el banner en el paso 3 WHEN se pulsa «Objetivos revisados» THEN se persiste `objectivesConfirmedAt` y el banner pasa al paso 4 sin recargar.

GIVEN el banner en el paso 4 WHEN se pulsa «Iniciar grabación» THEN se inicia la misma grabación que el control de la top bar (mismo controller: aviso de consentimiento y flujo de permisos intactos).

GIVEN una denegación dura de permisos (criterio `permsBlocked` de SPEC-055-iter-2) WHEN el banner está en el paso 4 THEN su botón «Iniciar grabación» está deshabilitado con Tooltip explicativo, igual que el de la top bar.

GIVEN el banner en el paso 5 WHEN se pulsa «Generar nota» THEN se dispara la misma generación que el botón de la sección Nota y ambos muestran su estado «Generando nota…» hasta terminar.

GIVEN el banner en el paso 5 degradado WHEN se pulsa «Escribir nota» THEN la vista hace scroll a la sección Nota y el editor recibe el foco.

GIVEN el banner en el paso 6 WHEN se pulsa «Evaluar objetivos» THEN se dispara la misma evaluación que el botón de la sección Objetivos y ambos muestran su estado «Evaluando objetivos…» hasta terminar.

GIVEN el banner en el paso 7 WHEN se pulsa «Ocultar» THEN se persiste `onboardingHiddenAt` y el banner desaparece de inmediato.

GIVEN el banner en cualquier paso del 1 al 6 WHEN se renderiza THEN no existe el botón «Ocultar».

GIVEN un fallo del canal al persistir `objectivesConfirmedAt` u `onboardingHiddenAt` WHEN la mutación devuelve error THEN se muestra un Toast de error y el banner permanece en su paso actual.

### Ubicación y alcance

GIVEN la página de detalle de entrevista de un discovery WHEN se renderiza el estado ready THEN el banner aparece entre `RecordingSurface` y la sección Objetivos.

GIVEN la página de detalle de una captura WHEN se renderiza el estado ready THEN el banner aparece en la misma posición, entre `RecordingSurface` y la sección Objetivos.

GIVEN cualquiera de las dos páginas WHEN el banner muestra la acción del paso actual THEN ese botón es el único con variante primary (`default`) del contenido de la página; los botones de las secciones Guión/Nota/Objetivos conservan su variante actual y siguen funcionando.

## UX Design

### Wireframe textual

Layout 2 — Página de detalle (sin cambios de layout global). El banner es una card horizontal a ancho completo del contenido, insertada tras `RecordingSurface` y antes del heading «Objetivos», en ambas páginas de detalle.

Estructura interna del banner (fila flex, `items-center`, gap generoso):

- Columna izquierda (flexible): fila superior con eyebrow «Paso N de 7» (texto xs, uppercase, muted) seguido del indicador de progreso (7 segmentos horizontales pequeños: hecho = sólido color foreground, actual = foreground al 40 %, pendiente = color border); debajo, título del paso (texto sm-base, semibold) con icono Lucide a la izquierda; debajo, descripción de una línea (texto sm, muted-foreground).
- Columna derecha (fija): el botón de acción del paso (Button variant `default`), o el botón «Ocultar» (variant `ghost`) solo en el paso 7.

Copys literales por paso (título · descripción · acción):

- Paso 1: «Asigna una plantilla de preguntas» · «El guión se genera a partir de una plantilla. Elige la que encaje con esta entrevista; puedes cambiarla mientras no haya guión.» · «Asignar plantilla» (icono LayoutTemplate).
- Paso 2: «Genera el guión antes de la entrevista» · «Con la plantilla y el contexto de la empresa, la IA prepara el guión y propone los objetivos de la entrevista.» · «Generar guión» (icono Sparkles).
- Paso 3: «Revisa los objetivos» · «El guión propuso estos objetivos. Añade o elimina los que quieras antes de la entrevista; cuando estén a tu gusto, confírmalo aquí.» · «Objetivos revisados» (icono Target).
- Paso 4: «¡Todo listo para la entrevista!» · «Cuando empiece la entrevista, inicia la grabación. Al terminar podrás generar la nota y evaluar los objetivos.» · «Iniciar grabación» (icono Mic).
- Paso 5: «Genera la nota de la entrevista» · «La transcripción ya está disponible. Genera la nota de resumen a partir de ella.» · «Generar nota» (icono FileText).
- Paso 5 degradado: «La grabación no tiene transcripción» · «La transcripción falló durante la grabación, así que la nota no se puede generar con IA. Puedes escribirla a mano en la sección Nota.» · «Escribir nota» (icono FileText).
- Paso 6: «Evalúa los objetivos» · «La IA marca cada objetivo como cumplido o no según la transcripción; después puedes corregir cualquier marca a mano.» · «Evaluar objetivos» (icono ClipboardCheck).
- Paso 7: «¡Entrevista finalizada!» · «Nota generada y objetivos evaluados. Puedes exportar la nota o revisar la evaluación cuando quieras.» · «Ocultar» (ghost); icono del título CheckCircle2 en verde y borde de la card con tinte verde sutil.

### Componentes shadcn utilizados

Componentes: Button, Tooltip, Toast (sonner, ya integrado). El contenedor usa los tokens de card (`bg-card`, `border`, `rounded-lg`) como div estilizado, sin el componente Card. Iconos Lucide: LayoutTemplate, Sparkles, Target, Mic, FileText, ClipboardCheck, CheckCircle2. Sin componentes adicionales no instalados.

### data-testid

- `interview-onboarding-banner` — contenedor del banner; expone `data-step` con el número de paso actual (`1`–`7`) y `data-degraded="true"` en el paso 5 sin transcripción.
- `onboarding-step-action` — el botón de acción del paso actual (en todos los pasos 1–6 y en el degradado).
- `onboarding-hide-button` — el botón «Ocultar» del paso 7.

El resto de elementos (títulos, descripciones, eyebrow) son localizables por texto literal.

### Patrón de interacción

- Una única acción primaria visible por paso: el botón del banner es el único variant `default` del contenido; refuerza la jerarquía «esto es lo siguiente». Decisión no cubierta por el design system: componente «banner de guía por pasos» — se resuelve con una card estándar + Button primary + indicador de segmentos, coherente con §4 (composición) y §5.4 (estados), porque el design system no cataloga steppers de onboarding.
- Las acciones asíncronas reutilizan el estado de las secciones (spinner inline + disabled, §5.4): «Generando guión…», «Generando nota…», «Evaluando objetivos…» aparecen a la vez en el banner y en el botón de la sección correspondiente.
- Botones deshabilitados siempre con Tooltip explicativo (§5.4): sin clave de Anthropic (pasos 2/5/6, mismo motivo que las secciones) y permisos bloqueados (paso 4).
- Confirmaciones: «Objetivos revisados» y «Ocultar» son irreversibles solo en el sentido débil (no hay des-ocultar en UI) pero no destructivas → sin AlertDialog (§6.3 aplica a acciones destructivas); feedback de error vía Toast si el canal falla.
- El banner no bloquea nada: todas las secciones siguen operativas en cualquier paso (guía, no wizard).

### Comportamiento responsive

- Mobile (< md): el banner apila en columna (`flex-col items-start`); el botón de acción queda bajo el texto, alineado a la izquierda.
- Tablet (md-lg): interpolado entre mobile y desktop.
- Desktop (lg+): fila horizontal según el wireframe.

## Notas técnicas

- Campos nuevos en `Interview` (ambos `string | null` ISO date, opcionales, ausente = null): `objectivesConfirmedAt` y `onboardingHiddenAt`. Patrón `aiUsage`/`objectiveResults`: sin bump de `schemaVersion`, NO escribibles por el patch genérico de `updateInterview`; cada uno se escribe con su mutación dedicada del repositorio y su canal `db:*` (envelope `DbResult`, helper `handleDb`), expuesta en el bridge y tipada en `types/`.
- A diferencia de `objectiveResults`/`objectiveOverrides`, editar `objectives` NO descarta `objectivesConfirmedAt` (el banner guía, no bloquea; ver Decisiones asumidas).
- La derivación del paso debe vivir en un helper puro (p. ej. `lib/onboardingStep.ts`) que reciba la entrevista + existencia de nota + flag de captura en curso y devuelva el paso (o `null` si oculto), para que sea testeable sin montar páginas.
- Existencia de nota: resolver con `window.api.db.getNoteByInterview` (patrón NoteSection/SPEC-047), tolerante a error (error ⇒ sin nota). La condición de nota del paso 6 es «existe nota o `status === 'summarized'`» para cubrir la nota escrita a mano del paso degradado.
- «Grabación asociada» = `status` `recorded`/`summarized` o `wavPath` no nulo (consistente con el Badge de estado existente).
- El botón del paso 4 usa el `useRecordingController` que ya reciben `InterviewDetailContent`/`CaptureDetailContent` (SPEC-041/055); no se crea un segundo controller ni se toca la top bar.
- Los diálogos de edición ya existen con el select de plantilla (`EditInterviewDialog`, `EditCaptureDialog`) pero hoy solo están montados en páginas de listado; esta spec los monta en sus páginas de detalle respectivas, cableados con `onInterviewUpdated`.
- Las acciones de generación/evaluación se comparten con las secciones mediante extracción (hook o callback), sin duplicar lógica LLM ni crear canales nuevos para ellas.

## Decisiones asumidas

- Banner oculto mientras hay grabación en curso → asumido ocultarlo (`capturing` del controller); la UI en vivo (panel del asistente, top bar) manda durante la grabación y el paso 4 quedaría contradictorio (alternativa: mostrar un estado «Grabando…» pasivo). Criterio: §8.3 (lo no accionable no ocupa la zona superior).
- Editar objetivos tras confirmar NO resetea `objectivesConfirmedAt` → asumido no descartar (alternativa: descartar como `objectiveResults`); el paso 3 es una confirmación de revisión humana, no un dato derivado del contenido, y el banner no debe retroceder por refinar objetivos.
- Nota manual (paso degradado) → asumido detectar nota vía `getNoteByInterview` además del status `summarized` (alternativa: solo status, que dejaría el banner clavado en 5b tras escribir la nota a mano).
- Persistencia de las dos marcas con canales dedicados → asumido canal `db:*` propio por marca, patrón main-only de `aiUsage` (alternativa: hacerlas escribibles por `updateInterview`, descartada por romper el patrón de campos solo-main).
- «Ocultar» sin des-ocultar en UI → asumido sin vía de reversión visible (alternativa: ajuste global o por entrevista para reactivarlo); registrado como posible mejora futura, decidido con el humano en el artifact.
- Sin AlertDialog en «Objetivos revisados»/«Ocultar» → asumido acción directa + Toast de error si falla (no son destructivas, §6.3).
