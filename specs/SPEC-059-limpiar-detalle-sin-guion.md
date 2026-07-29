# SPEC-059 — Limpiar el detalle de entrevista cuando todavía no hay guión

Origen: [issue #40](https://github.com/moisesvilar/maurya/issues/40). Traza a RF-GUION-002 (generar guión), RF-GUION-004 (generar objetivos) y RF-GUION-005 (editar guión y objetivos). Afecta a las dos páginas de detalle: entrevista de discovery (`InterviewDetailPage`) y captura (`CaptureDetailPage`).

## Descripción

Cuando una entrevista todavía no tiene guión generado, su página de detalle muestra elementos que compiten con la única acción que importa en ese momento: generar el guión desde el banner de onboarding (SPEC-058). Esta spec limpia ese estado: la sección «Objetivos» (vacía, porque los objetivos los propone el guión) deja de mostrarse, y los botones «Generar guión» de la sección «Guión» — duplicados de la acción del paso 2 del banner — desaparecen. El banner queda como el único punto de generación del guión, y la pantalla guía el foco del usuario a la siguiente acción sin distracciones.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura. En este proyecto no aplica Supabase: no hay cambios de persistencia, IPC ni main process — el cambio es íntegramente de renderer.

## Criterios de aceptación

### Pantalla sin guión (estado limpio)

- GIVEN una entrevista de discovery sin guión y sin objetivos WHEN se abre su página de detalle THEN la sección «Objetivos» no se muestra.
- GIVEN una captura sin guión y sin objetivos WHEN se abre su página de detalle THEN la sección «Objetivos» no se muestra.
- GIVEN una entrevista sin guión con el banner de onboarding visible WHEN se abre su página de detalle THEN la cabecera de la sección «Guión» no muestra el botón «Generar guión».
- GIVEN una entrevista sin guión con el banner de onboarding visible WHEN se abre su página de detalle THEN el empty state «Aún no hay guión» se muestra sin botón de acción.
- GIVEN una entrevista sin guión y sin clave de Anthropic configurada WHEN se abre su página de detalle THEN el Alert «Configura tu clave de Anthropic en Ajustes para generar el guión» sigue mostrándose en la sección «Guión».

### Generación desde el banner

- GIVEN una entrevista sin guión con plantilla asignada y clave configurada WHEN el usuario pulsa «Generar guión» en el banner THEN el guión generado aparece en la sección «Guión».
- GIVEN una generación de guión disparada desde el banner WHEN termina con éxito THEN la sección «Objetivos» aparece con los objetivos propuestos por el guión.
- GIVEN una generación de guión en curso (manual desde el banner o autogeneración al crear la captura, SPEC-033) WHEN la sección «Guión» está en empty state THEN el empty state muestra el indicador «Generando guión…» (botón deshabilitado con spinner).
- GIVEN una generación de guión que falla WHEN llega el error THEN se muestra un Toast de error y la sección «Objetivos» permanece oculta.

### Con guión (comportamiento intacto)

- GIVEN una entrevista con guión WHEN se abre su página de detalle THEN la sección «Objetivos» se muestra.
- GIVEN una entrevista con guión WHEN se abre su página de detalle THEN la cabecera de la sección «Guión» muestra el botón «Regenerar» con su comportamiento actual (confirmación con AlertDialog incluida).

### Edge cases y fallbacks

- GIVEN una entrevista sin guión pero con objetivos ya existentes (añadidos a mano) WHEN se abre su página de detalle THEN la sección «Objetivos» sí se muestra.
- GIVEN una entrevista sin guión con el banner de onboarding no visible (oculto por el usuario o grabación en curso) y con los prerrequisitos de generación cumplidos WHEN la sección «Guión» está en empty state THEN el empty state muestra el botón «Generar guión» como CTA de respaldo.
- GIVEN una entrevista sin guión con el banner de onboarding no visible y con algún prerrequisito incompleto (sin plantilla o sin clave) WHEN la sección «Guión» está en empty state THEN el empty state no muestra CTA (comportamiento actual del empty state, sin cambios).

## UX Design

### Wireframe textual

Ambas páginas usan Layout 2 — Página de detalle, sin cambios estructurales. Solo cambia qué secciones se pintan en el estado «sin guión».

**Detalle (entrevista de discovery o captura) — sin guión, banner visible:**

- Top bar (portal): controles de grabación (SPEC-055), sin cambios.
- Back button «Volver» (variant ghost, icono ArrowLeft), sin cambios.
- Cabecera: h1 con título + Badge de estado + fila muted de referencias, sin cambios.
- Superficie de grabación (RecordingSurface) y Alert de permisos, sin cambios.
- Banner de onboarding (SPEC-058) en paso 1 «Asignar plantilla» o paso 2 «Generar guión» — su botón es el único primary de acción del contenido de la página.
- ~~Sección «Objetivos»~~ — **no se renderiza** (salvo edge case de objetivos manuales ya existentes).
- Sección «Guión»: heading h3 «Guión» **sin botón a la derecha**; debajo, si falta la clave, el Alert con link a Ajustes; debajo, empty state centrado: icono FileText + texto muted «Aún no hay guión», **sin CTA**. Durante una generación en curso, el empty state muestra el botón deshabilitado con Loader2 girando y texto «Generando guión…».
- Sección «Nota»: reglas de SPEC-027/SPEC-035 sin cambios (solo se muestra con nota o transcripción).

**Detalle — sin guión, banner no visible (oculto o grabando):**

- Igual que el anterior, pero el empty state de «Guión» recupera el CTA «Generar guión» (Button variant default, icono Sparkles) cuando los prerrequisitos se cumplen — es la única superficie de generación restante.

**Detalle — con guión:**

- Sin cambios respecto al comportamiento actual: sección «Objetivos» visible tras el banner, sección «Guión» con editor y botón «Regenerar» (variant outline, icono RefreshCw) en la cabecera.

### Componentes shadcn utilizados

Componentes: Button, Badge, Alert, Tooltip, AlertDialog, Skeleton, Toast (sonner). Todos ya instalados y en uso en las superficies afectadas; no se necesita ningún componente adicional. El cambio elimina instancias, no añade.

### data-testid

Sin data-testid adicionales: los asserts de presencia/ausencia se cubren con los existentes y con locators semánticos — `objectives-section` (contenedor de la sección Objetivos, ya existente), `interview-onboarding-banner` + `onboarding-step-action` (banner, ya existentes), el heading «Guión», el texto «Aún no hay guión» y el role button con nombre «Generar guión» / «Generando guión…» / «Regenerar».

### Patrón de interacción

- **Un solo primary por pantalla:** el banner de onboarding (SPEC-058) ya establece que su botón es el único primary del contenido. Los botones «Generar guión» de la sección Guión (cabecera y CTA del empty state) violaban ese criterio duplicando la acción del paso 2; esta spec los retira cuando el banner está visible.
- **Empty state sin CTA — excepción justificada al design system (§7.5, «empty state sin botón de acción» es anti-patrón):** la acción no desaparece de la pantalla, vive en el banner inmediatamente encima con el mismo literal «Generar guión». Duplicar el CTA a unos píxeles de distancia es la distracción que el issue elimina. Cuando el banner no está visible, el anti-patrón vuelve a aplicar y por eso el CTA de respaldo reaparece.
- **Ocultar secciones vacías, nunca datos:** la sección «Objetivos» solo se oculta cuando no aporta nada (sin guión y sin objetivos). Si hay objetivos —manuales o propuestos—, se muestra siempre: ocultar contenido creado por el usuario no es limpiar, es esconder.
- **Feedback de generación:** sin cambios de patrón — spinner inline en botón durante la acción (regla 5.4), Toast de error en fallo, y el guión apareciendo como feedback de éxito (criterio SPEC-025, sin Toast en la autogeneración).

### Comportamiento responsive

- **Mobile (< md):** sin cambios específicos — las secciones ocultas lo están en todos los breakpoints; el banner y la sección Guión conservan su responsive actual (SPEC-058).
- **Tablet (md-lg):** interpolado entre mobile y desktop, sin cambios.
- **Desktop (lg+):** layout del wireframe; la página sin guión queda más corta (menos scroll), sin otros efectos.

## Notas técnicas

- La sección «Guión» debe **seguir montada** aunque no pinte botones: el banner espeja su acción de generación vía el puente de onboarding (SPEC-058-iter-1) y la sección sigue siendo la dueña única del estado de generación (manual y automática, SPEC-033). Retirar los botones no puede retirar el registro de la acción en el puente.
- La condición «banner visible» ya existe derivada en `lib/onboardingStep` (`deriveOnboardingStep` devuelve null con onboarding oculto o grabación en curso); el CTA de respaldo del empty state debe usar ese mismo criterio, no uno paralelo.
- Esta spec ajusta el comportamiento de SPEC-025 (la sección Objetivos deja de ser incondicional: solo se muestra con guión u objetivos) y de SPEC-014/SPEC-033 (los botones de generación de la sección Guión quedan condicionados a la visibilidad del banner). No deroga ningún AC de forma retroactiva: los tests existentes que asuman la visibilidad incondicional deberán ajustarse en el paso de QA de esta spec.
- Sin cambios de persistencia, IPC, main process ni dependencias.

## Decisiones asumidas

- «El botón de Generar guión que está fuera del wizard» (issue #40) → se interpretan **ambos** botones de la sección Guión (el de la cabecera y el CTA del empty state): ambos están fuera del banner y duplican su acción (alternativa: retirar solo el de la cabecera). Criterio: el objetivo del issue es un único punto de foco.
- Sección Objetivos con objetivos manuales pre-guión → **se muestra** aunque no haya guión (alternativa: ocultarla incondicionalmente como dice el literal del issue). Criterio: nunca ocultar datos creados por el usuario; el caso típico del issue (entrevista recién creada) queda igualmente limpio.
- Banner no visible (oculto en paso 7 sin guión, o grabación en curso) → el empty state de Guión **recupera el CTA** como respaldo (alternativa: eliminar toda vía de generación fuera del banner). Criterio: la limpieza no debe eliminar capacidad funcional cuando el banner no está para ofrecerla.
- La sección Guión sin guión **se mantiene visible** con su empty state y el Alert de clave (alternativa: ocultar la sección entera). Criterio: el issue solo pide retirar el botón; el empty state comunica dónde aparecerá el guión y el Alert de clave sigue siendo el aviso accionable del prerrequisito.
