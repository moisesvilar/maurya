# SPEC-054 — Modo compacto always-on-top durante la entrevista

> Origen: feedback de usuario (2026-07-24): «Necesito tener la app funcionando pero a la vez ver lo que tengo detrás (por ejemplo, la pantalla con el vídeo de la cámara del entrevistado, para verle la cara)». La propuesta original (slider de transparencia del background) se descartó tras el análisis (limitación de `transparent` en creación de `BrowserWindow`, legibilidad de texto sobre vídeo, transparencia inútil sin always-on-top); se acordó en su lugar un modo compacto always-on-top solo con la salida del asistente, sin transcripción. No proviene del checklist (precedente SPEC-049). Traza a **RF-ASIS-002, RF-ASIS-003, RF-ASIS-004 y RF-ASIS-006** (asistencia en vivo del tamaño justo). **Spec en espera**: no entra al pipeline hasta validar con más usuarios; queda versionada junto a su plan (`docs/plans/SPEC-054-plan.md`).

## Descripción

Durante la grabación de una entrevista, el usuario puede reducir Maurya a un panel compacto flotante que se mantiene siempre visible por encima de la app de videollamada. El panel muestra únicamente la salida del asistente (preguntas sugeridas con su porqué, badges de acción y alarmas Mom Test) y la salud de la captura (cronómetro y estado de la transcripción), de modo que el usuario ve la cara del entrevistado en la ventana de detrás sin perder las sugerencias en vivo. Al salir del modo compacto, la ventana recupera su tamaño y contenido completos.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura.
- Esta spec **sí** toca main y preload: añade canales `window:*` fire-and-forget (precedente `window:set-theme`) para reconfigurar la ventana. No hay cambios de persistencia (`db.json` no se toca): el modo compacto es efímero por sesión de grabación.

## Criterios de aceptación

### Entrada al modo compacto

- GIVEN una grabación de entrevista en curso con el asistente operativo WHEN se muestran los controles de grabación de la top bar THEN aparece un botón icon-only «Modo compacto» junto al botón «Detener».
- GIVEN una grabación de entrevista en curso con el asistente en estado `no-key` WHEN se muestran los controles de grabación de la top bar THEN el botón «Modo compacto» aparece deshabilitado con un Tooltip que indica que requiere configurar la clave de Anthropic en Ajustes.
- GIVEN la página de captura (`/capture`, sin `interviewId` y por tanto sin asistente) con una grabación en curso WHEN se muestran los controles de grabación THEN el botón «Modo compacto» no se muestra.
- GIVEN una entrevista en estado Preparación (sin grabación en curso) WHEN se muestran los controles de la top bar THEN el botón «Modo compacto» no se muestra.
- GIVEN una grabación de entrevista en curso WHEN el usuario pulsa «Modo compacto» THEN la página pasa a la vista compacta y se solicita a main la reconfiguración de la ventana (tamaño compacto + always-on-top).

### Vista compacta

- GIVEN el modo compacto activo WHEN se renderiza la vista THEN el layout completo de la página (sidebar, top bar, cabecera, Objetivos, Nota, Guión, sección Grabación y transcripción) no está presente.
- GIVEN el modo compacto activo WHEN se renderiza la franja de salud THEN muestra el cronómetro de grabación en formato MM:SS.
- GIVEN el modo compacto activo WHEN se renderiza la franja de salud THEN muestra el badge de estado de la transcripción con el mismo texto y color que en el modo completo.
- GIVEN el modo compacto activo con preguntas pendientes o ancladas en la cola WHEN se renderiza el panel del asistente THEN cada ítem muestra badge de acción, chips de alarma, pregunta y acciones inline igual que en el modo completo.
- GIVEN el modo compacto activo con la cola vacía WHEN se renderiza el panel del asistente THEN se muestra el mensaje «El asistente te sugerirá la siguiente pregunta en cuanto haya conversación.» (la última sugerencia nunca se oculta sola: solo desaparece al resolverse).
- GIVEN el modo compacto activo WHEN el asistente añade una nueva pregunta a la cola THEN la pregunta aparece en el panel compacto sin interacción del usuario.
- GIVEN el modo compacto activo WHEN el usuario marca una pregunta como respondida, la descarta o la ancla/desancla THEN la acción tiene exactamente el mismo efecto que en el modo completo.

### Salud de captura y estados degradados

- GIVEN el modo compacto activo WHEN la transcripción pasa a estado `disconnected` THEN el badge de la franja de salud pasa a «Desconectado» (variante destructive).
- GIVEN el modo compacto activo WHEN el asistente entra en pausa por límite de coste THEN el panel muestra el aviso de pausa con el botón «Reanudar asistente», igual que en el modo completo.
- GIVEN el modo compacto activo WHEN una llamada del asistente falla THEN se muestra la línea discreta «No se pudo analizar (se reintentará): …» sin ocultar la cola.

### Salida del modo compacto

- GIVEN el modo compacto activo WHEN el usuario pulsa «Salir del modo compacto» THEN la página vuelve a la vista completa y se solicita a main restaurar la ventana (bounds y mínimos previos, sin always-on-top).
- GIVEN el modo compacto activo WHEN el usuario pulsa «Detener» THEN la app sale primero del modo compacto (ventana restaurada) y continúa el flujo normal de detención, incluido el diálogo de motivos de descarte si hay preguntas descartadas.
- GIVEN el modo compacto activo WHEN el usuario intenta cerrar la ventana THEN aplica el close-guard existente (la app vuelve al modo completo y muestra el AlertDialog «Detener captura»).
- GIVEN el modo compacto activo WHEN la grabación termina por cualquier vía THEN el modo compacto se desactiva y la ventana se restaura.

### Ventana nativa (verificación manual)

- GIVEN la entrada al modo compacto WHEN main reconfigura la ventana THEN la ventana adopta el tamaño compacto por defecto (380×560, redimensionable con mínimos 320×400) conservando su posición actual como origen.
- GIVEN el modo compacto activo WHEN otras apps tienen el foco THEN la ventana de Maurya permanece visible por encima de ellas.
- GIVEN el modo compacto activo y la app de videollamada a pantalla completa en su propio Space de macOS WHEN el usuario está en ese Space THEN el panel compacto sigue visible por encima.
- GIVEN la salida del modo compacto WHEN main restaura la ventana THEN recupera exactamente los bounds previos a la entrada, los mínimos originales (720×640) y deja de estar always-on-top.

## UX Design

Decisión no cubierta por el design system: el design system no contempla ventanas flotantes compactas always-on-top (sus layouts asumen sidebar + top bar). Se resuelve con una quinta variante de layout ad-hoc («vista compacta», sin navegación) porque en un panel de ~380px la navegación es inútil y el objetivo es maximizar el espacio para la salida del asistente. La vista reutiliza los componentes ya existentes (`AssistantPanel`, badge de transcripción) sin variantes nuevas.

### Wireframe textual

**Vista compacta** (sustituye a todo el contenido de la ventana mientras está activa):

- **Franja de salud** (fila superior, sticky top, `border-b`, padding compacto): a la izquierda, cronómetro de grabación (texto `tabular-nums`, mismo formato MM:SS de la top bar) seguido del Badge de estado de transcripción («Transcribiendo» verde / «Desconectado» destructive / «Sin key» ámbar). A la derecha, dos botones icon-only: «Salir del modo compacto» (Button variant ghost, size icon-sm, icono Maximize2, con Tooltip) y «Detener» (Button variant destructive, size icon-sm, icono Square, con Tooltip).
- **Cuerpo** (área scrolleable vertical, `p-4`): el `AssistantPanel` existente tal cual — Card con la cola de pendientes (badge de acción «Profundiza»/«Continúa», chips de alarma «Cumplido»/«Genérico»/«Hipotético», pregunta, porqué, acciones inline), sección «Ancladas» si hay ≥1, mensaje de cola vacía, Alert de pausa por coste, línea de error y línea de uso de IA.

**Botón de entrada** (top bar del detalle de entrevista, solo durante la grabación): Button variant ghost, size icon-sm, icono PictureInPicture2, aria-label «Modo compacto», con Tooltip «Modo compacto: panel flotante con las sugerencias», situado inmediatamente a la derecha del botón «Detener» en `topbar-recording-controls`. Deshabilitado (con Tooltip explicativo, regla §5.4) cuando el asistente está en `no-key`.

### Componentes shadcn utilizados

Componentes: Button, Badge, Card, Tooltip, Alert (todos ya instalados y en uso por el panel del asistente). Sin componentes adicionales.

### data-testid

- `compact-mode-toggle` — el botón «Modo compacto» de la top bar.
- `compact-view` — el contenedor raíz de la vista compacta.
- `compact-health-strip` — la franja de salud (cronómetro + badge).
- `compact-exit` — el botón «Salir del modo compacto».
- `compact-stop` — el botón «Detener» de la vista compacta.
- El panel del asistente conserva sus testids existentes (`assistant-queue`, `assistant-queue-item`, `assistant-pinned-section`, `assistant-pinned-item`, `assistant-paused-alert`, `assistant-usage-line`, `assistant-item-answered`, `assistant-item-discard`).

### Patrón de interacción

- Entrada/salida como toggle explícito con botones dedicados, no como atajo oculto: la reconfiguración de la ventana es un cambio de contexto fuerte y debe ser siempre intencional y reversible con un clic.
- Botones icon-only con `aria-label` y Tooltip (regla §10: solo para acciones obvias, y el espacio en la franja compacta es crítico); «Detener» en variant destructive por ser la acción que finaliza la sesión.
- Estados no-solo-color (regla §11.4): el badge de transcripción ya cambia texto además de color; el cronómetro avanza como señal de vida de la grabación.
- Botón deshabilitado siempre con Tooltip explicativo (regla §5.4, estados).
- Detener desde el modo compacto restaura primero la ventana completa: los diálogos del flujo de cierre (motivos de descarte, consentimiento) necesitan el espacio y el contexto del modo completo; mostrar un AlertDialog dentro de un panel de 380px violaría la legibilidad sin aportar nada.
- Sin persistencia del estado compacto: es un modo de sesión en vivo; reabrir la app en modo compacto sin grabación activa sería un estado sin sentido.

### Comportamiento responsive

- La app es Electron de escritorio; los breakpoints de viewport no gobiernan la vista compacta: su ancho (~380px, por debajo de `md`) fuerza por diseño el layout de una sola columna, que es exactamente lo que la vista define (los chips y acciones de los ítems del asistente ya hacen wrap con `flex-wrap`).
- **Modo completo (ventana ≥720px):** sin cambios respecto al comportamiento actual.
- La vista compacta es redimensionable entre los mínimos (320×400) y cualquier tamaño mayor; el cuerpo scrollea verticalmente y nunca aparece scroll horizontal.

## Notas técnicas

- **El modo compacto es estado de layout de la página de detalle de entrevista, no una ruta.** Toda la captura (mic + sistema, AudioWorklet, tee a Deepgram) vive en el renderer de esa página: navegar o desmontar el `RecordingController` mataría la grabación. La vista compacta y la completa se renderizan condicionalmente bajo el mismo montaje del controller.
- Nuevos canales IPC fire-and-forget de la familia `window:*` (precedente `window:set-theme`, sin envelope): `window:enter-compact` y `window:exit-compact`. Main guarda bounds y tamaño mínimo previos, aplica tamaño/mínimos compactos, `setAlwaysOnTop` con nivel elevado y visibilidad en todos los workspaces con `visibleOnFullScreen`, y lo restaura todo al salir. La restauración también debe dispararse desde el propio flujo de detención y desde el close-guard.
- Riesgo a validar el primer día de implementación (manual): visibilidad sobre apps a pantalla completa en Spaces de macOS (Zoom/Meet). Si el nivel de ventana elegido no basta, se ajusta en main sin cambiar el contrato de esta spec.
- Los ACs de la sección «Ventana nativa (verificación manual)» son comportamiento nativo de macOS no automatizable en este proyecto (sin e2e): quedarán como `MANUAL` en `tests/spec-test-map.json`. El resto de ACs son automatizables con Vitest (jsdom + mock de `window.api`).

## Decisiones asumidas

- [Ubicación del control de entrada] → asumido botón icon-only en `topbar-recording-controls`, junto a «Detener» (alternativa: botón en la sección Grabación, descartado por estar al final de la página, fuera del viewport durante la grabación). Regla: densidad §8.3, lo más usado arriba.
- [Tamaño compacto] → asumido 380×560 por defecto con mínimos 320×400 (alternativa: tamaño recordado entre sesiones; se descarta junto con toda persistencia del modo). Criterio: ancho mínimo que evita el wrap agresivo de los chips del panel.
- [Contenido del panel] → asumido salida íntegra del asistente (cola + ancladas + alarmas + pausa + error + línea de uso) y salud de captura; transcripción y objetivos excluidos (alternativa: incluir última línea de transcripción como señal de salud; se cubre con el badge de estado, que es más glanceable). Regla: RF-ASIS-004, feedback del tamaño justo.
- [Detener en compacto] → asumido restaurar primero la ventana y continuar el flujo normal (alternativa: flujo de cierre dentro del panel compacto, descartado por legibilidad de los diálogos).
- [Disponibilidad] → asumido solo en el detalle de entrevista con grabación activa (alternativa: también en `/capture`; descartado porque sin `interviewId` el asistente es inerte y el panel quedaría vacío por diseño).
