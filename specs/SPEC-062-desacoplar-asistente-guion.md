# SPEC-062 — Desacoplar asistente y guión a ventanas independientes

> Origen: GitHub issue #38 «Desacoplar asistente y guión» (enhancement, 2026-07-29), petición humana directa; diseño acotado por el humano en la revisión de la spec (2026-07-29): un botón por componente y una ventana por componente. No proviene del checklist (precedente SPEC-049/050/055/058: nada que marcar `[x]`). Traza a **RF-ASIS-002, RF-ASIS-003, RF-ASIS-004, RF-ASIS-006** (asistencia en vivo glanceable) y **RF-GUION-002, RF-GUION-005** (seguir el guión durante la llamada). Relación con SPEC-054 (modo compacto always-on-top, EN ESPERA, no implementada): resuelven necesidades distintas — SPEC-054 superpone un panel flotante sobre la videollamada; esta spec añade ventanas normales para organizar la pantalla en mosaico (p. ej. videollamada a la izquierda; a la derecha, asistente arriba y guión abajo). Ninguna deroga a la otra.

## Descripción

Durante la grabación de una entrevista, el usuario puede desacoplar el asistente y el guión a sendas ventanas propias: un botón junto al panel del asistente abre una ventana solo-asistente, y un botón junto a la sección Guión abre una ventana solo-guión. Cada ventana se posiciona y redimensiona con independencia de la principal, que conserva ambos componentes: las ventanas son espejos, y cualquier cambio en el asistente o en el guión se refleja a la vez en la página principal y en su ventana desacoplada. Al terminar la grabación, las ventanas desacopladas se cierran solas.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura.
- Esta spec **sí** toca main y preload: creación de hasta dos `BrowserWindow` secundarias, canales nuevos de la familia `window:*` (precedente `window:set-theme`) y difusión de los eventos del asistente a todas las ventanas. No hay cambios de persistencia (`db.json` no se toca): las ventanas desacopladas son efímeras por sesión de grabación.

## Criterios de aceptación

### Botones de desacople

- GIVEN una grabación en curso en el detalle de entrevista WHEN se renderiza la sección del asistente THEN su cabecera muestra un botón icon-only «Abrir asistente en ventana».
- GIVEN una grabación en curso en el detalle de entrevista WHEN se renderiza la sección Guión THEN su cabecera muestra un botón icon-only «Abrir guión en ventana» junto a los controles existentes.
- GIVEN una grabación en curso en el detalle de captura WHEN se renderizan la sección del asistente y la sección Guión THEN ambos botones de desacople aparecen igual que en el detalle de entrevista.
- GIVEN una entrevista sin grabación en curso WHEN se renderiza la sección Guión THEN el botón «Abrir guión en ventana» no se muestra.
- GIVEN una grabación en curso con el asistente en estado `no-key` WHEN se renderiza la sección del asistente THEN el botón «Abrir asistente en ventana» aparece deshabilitado con un Tooltip que indica que requiere configurar la clave de Anthropic en Ajustes.
- GIVEN una grabación en curso WHEN el usuario pulsa «Abrir asistente en ventana» THEN se solicita a main la apertura de la ventana del asistente para esa entrevista.
- GIVEN una grabación en curso WHEN el usuario pulsa «Abrir guión en ventana» THEN se solicita a main la apertura de la ventana del guión para esa entrevista.

### Ventana del asistente

- GIVEN la ventana del asistente abierta WHEN se renderiza su contenido THEN muestra exclusivamente el panel del asistente a ventana completa con scroll vertical, sin sidebar, top bar, cabecera de entrevista, Objetivos, Nota, Guión ni sección de grabación.
- GIVEN la ventana del asistente abierta a mitad de sesión con preguntas en la cola WHEN termina de cargar THEN la cola actual (pendientes y ancladas) se muestra de inmediato, sin esperar al siguiente análisis.
- GIVEN la ventana del asistente abierta WHEN se renderiza la cola no vacía THEN cada ítem muestra badge de acción, chips de alarma, pregunta, porqué y acciones inline exactamente igual que el panel de la página principal.
- GIVEN la ventana del asistente abierta WHEN el asistente añade una nueva pregunta a la cola THEN la pregunta aparece en la ventana del asistente y en la página principal sin interacción del usuario.
- GIVEN la ventana del asistente abierta WHEN el usuario marca una pregunta como respondida, la descarta o la ancla/desancla desde esa ventana THEN la acción tiene el mismo efecto que en la página principal y ambas superficies muestran la cola resultante.
- GIVEN la ventana del asistente abierta WHEN el usuario resuelve o ancla una pregunta desde la página principal THEN la ventana del asistente refleja la cola resultante sin interacción adicional.
- GIVEN la ventana del asistente abierta con la cola vacía WHEN se renderiza el panel THEN se muestra el mensaje «El asistente te sugerirá la siguiente pregunta en cuanto haya conversación.».
- GIVEN la ventana del asistente abierta WHEN el asistente entra en pausa por límite de coste THEN el panel muestra el aviso de pausa con «Reanudar asistente», y reanudar desde esa ventana reactiva el asistente en ambas superficies.
- GIVEN la ventana del asistente abierta WHEN una llamada del asistente falla THEN el panel muestra la línea discreta «No se pudo analizar (se reintentará): …» sin ocultar la cola.

### Ventana del guión

- GIVEN una entrevista con guión WHEN se abre la ventana del guión THEN muestra exclusivamente el guión renderizado como markdown de solo lectura a ventana completa con scroll vertical (sin editor, sin botones de guardado ni regeneración).
- GIVEN una entrevista sin guión WHEN se abre la ventana del guión THEN muestra el empty state «Esta entrevista no tiene guión.» sin CTA.
- GIVEN la ventana del guión abierta WHEN el guión se regenera o se guarda desde la página principal durante la grabación THEN la ventana del guión muestra la versión actualizada sin necesidad de cerrarla y reabrirla.
- GIVEN la ventana del guión abierta WHEN la carga del guión falla (envelope de error) THEN muestra un error state con botón «Reintentar».

### Independencia y ciclo de vida

- GIVEN una grabación en curso WHEN el usuario abre las dos ventanas desacopladas THEN ambas coexisten a la vez con la principal, cada una con su contenido.
- GIVEN una ventana desacoplada abierta WHEN el usuario la cierra manualmente THEN la grabación, la transcripción, la página principal y la otra ventana desacoplada no se ven afectadas, y su botón de desacople permite reabrirla.
- GIVEN una o ambas ventanas desacopladas abiertas WHEN la grabación termina por cualquier vía (Detener, auto-stop, cierre confirmado de la principal) THEN las ventanas desacopladas se cierran automáticamente.
- GIVEN una o ambas ventanas desacopladas abiertas WHEN el usuario intenta cerrar la ventana principal THEN aplica el close-guard existente sin cambios (el AlertDialog «Detener captura» aparece en la ventana principal).

### Ventanas nativas (verificación manual)

- GIVEN la petición de apertura de una ventana desacoplada WHEN main la crea THEN es una ventana normal (sin always-on-top), redimensionable, de 420×640 por defecto con mínimos 360×480, con título «Asistente — {título de la entrevista}» o «Guión — {título de la entrevista}» según el componente.
- GIVEN una ventana desacoplada ya abierta WHEN el usuario vuelve a pulsar su botón de desacople THEN no se crea una segunda ventana de ese componente: main enfoca la existente.
- GIVEN las ventanas desacopladas abiertas WHEN el usuario las mueve o redimensiona THEN cada una conserva su posición y tamaño con independencia de la principal y de la otra mientras dura la sesión.

## UX Design

Decisión no cubierta por el design system: el design system no contempla apps multiventana (sus layouts asumen una sola ventana con sidebar + top bar). Se resuelve con dos vistas dedicadas sin navegación (una por componente), porque su único propósito es ser consultadas de reojo durante la llamada (RF-ASIS-004: tamaño justo) y cualquier chrome de navegación restaría espacio al contenido. Las vistas reutilizan los componentes ya existentes (panel del asistente, render de markdown) sin variantes nuevas.

### Wireframe textual

**Botón de desacople del asistente** (sección del asistente de ambas páginas de detalle, solo durante la grabación): fila de cabecera de la sección con el botón alineado a la derecha, encima del Card del panel — Button variant ghost, size icon-sm, icono PictureInPicture2 (Lucide), aria-label «Abrir asistente en ventana», con Tooltip «Asistente en una ventana aparte». Deshabilitado (con Tooltip explicativo, regla §5.4) cuando el asistente está en `no-key`.

**Botón de desacople del guión** (cabecera de la sección Guión de ambas páginas de detalle, solo durante la grabación): Button variant ghost, size icon-sm, icono PictureInPicture2, aria-label «Abrir guión en ventana», con Tooltip «Guión en una ventana aparte», situado en la fila del heading «Guión» a la derecha de los controles existentes (contador y «Regenerar»).

**Ventana del asistente** (vista dedicada, ocupa toda la ventana secundaria; layout ad-hoc sin sidebar ni top bar): contenedor con padding `p-4` y scroll vertical, con el panel del asistente existente tal cual — Card con la cola de pendientes (badge de acción «Profundiza»/«Continúa», chips de alarma «Cumplido»/«Genérico»/«Hipotético», pregunta, porqué, acciones inline «Marcar respondida»/«Descartar pregunta»/«Anclar pregunta»), sección «Ancladas» si hay ≥1, mensaje de cola vacía, Alert de pausa por coste con «Reanudar asistente», línea de error y línea de uso de IA.

**Ventana del guión** (vista dedicada, misma plantilla): contenedor con padding `p-4` y scroll vertical, con el guión renderizado como markdown de solo lectura. Empty state centrado con texto «Esta entrevista no tiene guión.» (sin CTA). Error state centrado con mensaje y Button variant outline «Reintentar». Mientras carga, Skeleton de párrafos en el lugar del contenido.

### Componentes shadcn utilizados

Componentes: Button, Badge, Card, Tooltip, Alert, Skeleton (todos ya instalados y en uso). Sin componentes adicionales.

### data-testid

- `detach-assistant-button` — el botón «Abrir asistente en ventana» de la sección del asistente.
- `detach-script-button` — el botón «Abrir guión en ventana» de la cabecera de la sección Guión.
- `assistant-window-root` — el contenedor raíz de la vista de la ventana del asistente.
- `script-window-root` — el contenedor raíz de la vista de la ventana del guión.
- `script-window-empty` — el empty state de la ventana del guión.
- `script-window-error` — el error state de la ventana del guión.
- El panel del asistente conserva sus testids existentes (`assistant-queue`, `assistant-queue-item`, `assistant-pinned-section`, `assistant-pinned-item`, `assistant-paused-alert`, `assistant-usage-line`, `assistant-item-answered`, `assistant-item-discard`).

### Patrón de interacción

- Un botón de desacople por componente, situado en la cabecera del propio componente: el desacople es una acción sobre ese componente concreto, y su botón junto al contenido es más descubrible que un control global en la top bar. Icon-only con `aria-label` y Tooltip (regla §10: acción secundaria que no debe competir con el contenido glanceable).
- Las ventanas desacopladas son espejos, no traslados: el asistente y el guión siguen presentes en la página principal (la issue pide que «se muestren también» en ventanas nuevas). Así cerrar una ventana desacoplada nunca deja a la página sin contenido.
- Acciones de la cola idénticas en la página y en la ventana del asistente, sin estado optimista: main es la única fuente de verdad y re-emite la cola a todas las ventanas (mismo patrón que el panel actual), lo que garantiza la sincronía sin resolver conflictos en el cliente.
- Guión en solo lectura en su ventana desacoplada: la edición vive únicamente en la página principal (RF-GUION-005). Editar en dos superficies a la vez crearía conflictos de guardado sin caso de uso durante la llamada, donde el guión se consulta, no se redacta; todo cambio guardado en la principal se refleja en la ventana.
- Botón deshabilitado siempre con Tooltip explicativo (regla §5.4): el del asistente en `no-key` (una ventana solo-asistente sin clave solo mostraría el aviso de clave).
- Estados no-solo-color (regla §11.4): los chips de alarma y badges de acción ya combinan texto y color; los empty/error states usan texto real.
- Error de carga del guión con «Reintentar» (patrón §7.5 de error states); éxito de acciones de cola sin Toast (acciones atómicas reversibles en directo, criterio ya establecido por el panel del asistente).
- Sin persistencia de las ventanas desacopladas (posición, tamaño, apertura): son un modo de sesión de grabación; reabrir la app con ventanas desacopladas huérfanas sería un estado sin sentido (mismo criterio que SPEC-054).

### Comportamiento responsive

- Las vistas de las ventanas desacopladas no se gobiernan por breakpoints de viewport de la app principal: su ancho (360–~500px habitual, por debajo de `md`) fuerza por diseño una sola columna, que es exactamente el layout definido (los chips y acciones de los ítems del asistente ya hacen wrap con `flex-wrap`).
- Cada ventana es redimensionable entre los mínimos (360×480) y cualquier tamaño mayor; el contenido scrollea verticalmente y nunca aparece scroll horizontal.
- **Ventana principal:** sin cambios de layout respecto al comportamiento actual en ningún breakpoint (solo gana los dos botones icon-only en las cabeceras de sus secciones durante la grabación).

## Notas técnicas

- **La captura no se mueve de ventana.** Toda la captura de audio (mic + sistema, AudioWorklet, tee a Deepgram) vive en el renderer de la página de detalle de la ventana principal: las ventanas desacopladas son `BrowserWindow` espejo que no participan en la grabación. Cerrarlas no puede afectar a la captura; no llevan close-guard.
- Las ventanas desacopladas las crea main a petición del renderer mediante un canal nuevo de la familia `window:*` (fire-and-forget, precedente `window:set-theme`) que identifica el componente (asistente o guión) y la entrevista. Cada ventana carga el mismo renderer con el mismo preload sobre una ruta dedicada del `HashRouter` fuera del `Layout` (las rutas actuales cuelgan todas de `Layout`; estas no deben hacerlo) con el `interviewId` como parámetro. Main es responsable de la deduplicación por componente (enfocar si ya existe), del cierre automático de ambas al terminar la grabación (`recording:stop` y el flujo de cierre confirmado de la principal) y del título nativo de cada ventana.
- **Los eventos del asistente hoy no llegan a una segunda ventana**: `assistant:update` se envía solo al `webContents` que inició la sesión (`assistantService`). Hay que difundirlos a todas las ventanas (precedente: `llm:script-generation` en `scriptAutoGenerationService` ya emite a `BrowserWindow.getAllWindows()`). Las acciones de la cola (`assistant:set-pinned`, `assistant:resolve-item`, `assistant:resume`) ya operan sobre la sesión singleton de main con independencia del sender, por lo que funcionan desde cualquier ventana sin cambios.
- **Snapshot inicial**: la ventana del asistente abre a mitad de sesión, por lo que necesita el estado actual del asistente sin esperar al siguiente evento (main re-emite el último estado cuando la ventana está lista, o expone una consulta puntual; a elección del plan).
- **Sincronía del guión**: la generación/regeneración ya emite `llm:script-generation` a todas las ventanas; el guardado manual desde la página principal necesita una señal equivalente hacia la ventana del guión para cumplir el AC de actualización sin reabrir (a elección del plan; el guión persiste en `db.json` y la ventana lo lee por el canal `db` existente).
- El render de markdown de solo lectura ya existe en el proyecto (`MarkdownView`, sin consumidores de producción desde SPEC-029): la ventana del guión es su consumidor natural, sin obligación de usarlo si el plan prefiere otra vía.
- Los ACs de la sección «Ventanas nativas (verificación manual)» son comportamiento nativo de macOS/Electron no automatizable en este proyecto (sin e2e): quedarán como `MANUAL` en `tests/spec-test-map.json` (precedente SPEC-054/057). El resto de ACs son automatizables con Vitest (jsdom + mock de `window.api`); el cierre automático y la deduplicación viven en main y se verifican por sus funciones puras/registro de canales donde sea razonable, o quedan `MANUAL` con el mismo precedente.

## Decisiones asumidas

- [¿Guión editable en su ventana desacoplada?] → asumido solo lectura (alternativa: editor completo espejo). Criterio: RF-GUION-005 sitúa la edición antes de la llamada; durante la llamada el guión se consulta, y un doble editor crearía conflictos de guardado sin caso de uso. El requisito humano («un cambio en el guión se refleja en ambos componentes») se cumple: todo cambio se hace en la principal y la ventana lo refleja.
- [¿Disponibilidad de los botones fuera de la grabación?] → asumido solo durante la grabación, con cierre automático de ambas ventanas al terminar (alternativa: guión desacoplable en todo momento). Criterio: la issue acota la necesidad a «durante la entrevista»; fuera de la grabación la página principal cubre la consulta sin competencia de pantalla, y el ciclo de vida único (muere con la sesión) evita ventanas huérfanas apuntando a entrevistas que el usuario ya abandonó.
- [¿Botón del asistente con `no-key`?] → asumido deshabilitado con Tooltip (alternativa: habilitado). Criterio: una ventana solo-asistente sin clave solo mostraría el aviso de clave sin configurar (regla §5.4: deshabilitado con explicación; mismo criterio que SPEC-054).
- [¿Always-on-top?] → asumidas ventanas normales sin always-on-top (alternativa: always-on-top opcional). Criterio: el caso de uso de la issue es organizar la pantalla en mosaico, sin solapamiento; la superposición flotante es el territorio de SPEC-054, que queda intacta como propuesta aparte.
- [¿Objetivos desacoplables?] → asumido que no (alternativa: tercer botón y tercera ventana con los objetivos). Criterio: la propuesta humana enumera exactamente asistente y guión; los objetivos siguen visibles en la página principal.
- [Tamaño de las ventanas] → asumido 420×640 por defecto con mínimos 360×480 para ambas (alternativa: recordar tamaño/posición entre sesiones, descartada junto con toda persistencia). Criterio: proporción vertical acorde al ejemplo de la issue (columna lateral repartida entre las dos), ancho mínimo que evita el wrap agresivo de los chips del panel (criterio de SPEC-054).
- [Deduplicación] → asumida una ventana como máximo por componente y entrevista, con foco a la existente al repetir el clic (alternativa: permitir múltiples copias). Criterio: varias copias del mismo espejo no aportan y complican el cierre automático.
