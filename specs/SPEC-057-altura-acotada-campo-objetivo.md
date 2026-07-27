# SPEC-057 — Altura acotada del campo Objetivo en los diálogos

> Origen: bug reportado por el usuario (2026-07-27) con capturas: al editar un grupo de entrevistas cuyo objetivo es largo, el diálogo crece hasta desbordar la ventana por arriba y por abajo a la vez y desaparecen el título, el botón de cerrar, los dos Selects de plantilla y los botones Cancelar/Guardar; no hay forma de guardar sin borrar texto. Mismo defecto en el campo «Objetivos» del discovery y —detectado en el diagnóstico, no reportado— en el diálogo de override de objetivo. No proviene del checklist (precedente SPEC-049, SPEC-054). Traza a **RF-DISC-008** (objetivos del discovery), **RF-DISC-009** (campo `objetivo` del grupo de entrevistas) y **RF-ASIS-005** (marcado manual del estado de objetivos en vivo). Diseño acordado con el humano antes de implementar: ver «Diseño / mockups».

## Diseño / mockups

Artifact de la ronda 1, con decisiones cerradas el 2026-07-27: <https://claude.ai/code/artifact/edfc0d89-d404-4acf-850c-ac2dfbec7d09>

Contiene los mockups de cada estado (objetivo corto, objetivo largo hoy vs. propuesta, ventana pequeña con un solo fix vs. con ambos, y los diálogos de discovery y override), el criterio de estilo, las inconsistencias detectadas en el código y la tabla de decisiones cerradas que esta spec implementa.

## Descripción

Cuando el usuario escribe un objetivo largo en un grupo de entrevistas o en un discovery, el campo de texto crece sin límite y arrastra consigo al diálogo, que acaba siendo más alto que la ventana: el usuario pierde de vista el resto del formulario y los botones para guardar o cancelar. Esta spec acota la altura del campo de objetivo a una fracción de la ventana y le da scroll propio, de modo que el objetivo se lee y se edita desplazándose dentro del campo mientras el resto del formulario permanece siempre visible. El comportamiento con objetivos cortos no cambia.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura.
- Esta spec **no** toca main ni preload, ni la persistencia (`db.json` intacto), ni estado de React, ni validación, ni contratos IPC, ni tipos. El cambio es exclusivamente de clases de presentación en cuatro archivos del renderer. **Fuera de alcance:** el componente base `src/renderer/src/components/ui/textarea.tsx` no se modifica (ver «Decisiones asumidas»), y `DiscardReasonsDialog` no se toca porque ya acota su contenido.

## Criterios de aceptación

### Objetivo largo en el diálogo de grupo de entrevistas

- GIVEN el diálogo «Editar grupo» abierto con un objetivo que excede la altura disponible WHEN se renderiza el diálogo THEN el título «Editar grupo» y el botón de cerrar permanecen visibles dentro de la ventana.
- GIVEN el diálogo «Editar grupo» abierto con un objetivo que excede la altura disponible WHEN se renderiza el diálogo THEN los campos «Nombre», «Plantilla de preguntas» y «Plantilla de notas» permanecen visibles dentro de la ventana.
- GIVEN el diálogo «Editar grupo» abierto con un objetivo que excede la altura disponible WHEN se renderiza el diálogo THEN los botones «Cancelar» y «Guardar» permanecen visibles dentro de la ventana.
- GIVEN el diálogo «Editar grupo» abierto con un objetivo que excede la altura disponible WHEN el usuario se desplaza dentro del campo «Objetivo» THEN el contenido del campo se desplaza y el resto del formulario no se mueve.
- GIVEN el diálogo «Editar grupo» con un objetivo largo WHEN el usuario pulsa «Guardar» THEN el objetivo se persiste íntegro, sin truncar por el hecho de no estar visible en su totalidad.

### Objetivo corto — no regresión

- GIVEN el diálogo «Editar grupo» abierto con un objetivo de una o dos líneas WHEN se renderiza el campo «Objetivo» THEN el campo conserva su altura mínima actual y no muestra barra de desplazamiento.
- GIVEN el diálogo «Nuevo grupo» abierto sin objetivo WHEN se renderiza el campo «Objetivo» THEN se muestra el placeholder «¿Qué quieres aprender con este grupo de entrevistas?» con la altura mínima actual y sin barra de desplazamiento.
- GIVEN el diálogo «Editar grupo» abierto WHEN el usuario escribe en el campo «Objetivo» hasta superar la altura máxima THEN el campo deja de crecer y aparece barra de desplazamiento, sin que el diálogo cambie de tamaño.

### Campo «Objetivos» del discovery

- GIVEN el diálogo de discovery abierto con unos objetivos que exceden la altura disponible WHEN se renderiza el diálogo THEN el campo «Nombre» y los botones «Cancelar» y «Guardar» permanecen visibles dentro de la ventana.
- GIVEN el diálogo de discovery abierto con unos objetivos que exceden la altura disponible WHEN el usuario se desplaza dentro del campo «Objetivos» THEN el contenido del campo se desplaza y el resto del formulario no se mueve.
- GIVEN el diálogo de discovery abierto sin objetivos WHEN se renderiza el campo «Objetivos» THEN conserva su altura mínima actual y no muestra barra de desplazamiento.

### Diálogo de override de objetivo

- GIVEN el diálogo de override abierto con un comentario que excede la altura disponible WHEN se renderiza el diálogo THEN el RadioGroup de estado y los botones de acción permanecen visibles dentro de la ventana.
- GIVEN el diálogo de override abierto con un comentario que excede la altura disponible WHEN el usuario se desplaza dentro del campo de comentario THEN el contenido del campo se desplaza y el resto del formulario no se mueve.

### Ventana pequeña y redimensionado

- GIVEN una ventana de la aplicación de altura reducida WHEN se abre cualquiera de los tres diálogos con contenido largo THEN el diálogo completo cabe dentro de la ventana, incluidos título y botones de acción.
- GIVEN el diálogo «Editar grupo» abierto con un objetivo largo WHEN el usuario reduce la altura de la ventana de la aplicación THEN el campo «Objetivo» cede altura proporcionalmente y los botones «Cancelar» y «Guardar» siguen visibles.
- GIVEN el diálogo «Editar grupo» abierto con un objetivo largo WHEN el usuario amplía la altura de la ventana de la aplicación THEN el campo «Objetivo» gana altura hasta su tope y muestra más texto sin recargar el diálogo.

### Edge cases

- GIVEN el diálogo «Editar grupo» abierto WHEN el usuario pega de golpe un objetivo de varios miles de caracteres THEN el diálogo no crece más allá de la ventana y el campo pasa a mostrar barra de desplazamiento.
- GIVEN el diálogo «Editar grupo» con un objetivo largo WHEN el usuario arrastra el asa de redimensionar del campo «Objetivo» hacia abajo THEN el campo no supera su altura máxima y el diálogo permanece dentro de la ventana.
- GIVEN el diálogo «Editar grupo» con el campo «Nombre» vacío y un objetivo largo WHEN el usuario pulsa «Guardar» THEN el mensaje de error inline «Campo requerido» del campo «Nombre» es visible sin necesidad de desplazar el diálogo.
- GIVEN el diálogo «Editar grupo» con un objetivo largo WHEN el diálogo se abre THEN el foco va al campo «Nombre», que está visible, y no se produce ningún desplazamiento automático del diálogo.

## UX Design

Decisión respaldada por el design system §7 (accesibilidad): «Scroll contenido dentro del modal. Body no scrollea». Se aplica un nivel más adentro: el scroll vive en el único campo de longitud libre del formulario, no en el diálogo. Si el scroll fuera del diálogo completo, el sticky bottom bar con las acciones primarias (§5.3) saldría de vista al desplazarse, que es exactamente el fallo que esta spec corrige. El tope del diálogo actúa solo como red de seguridad para ventanas pequeñas, sin scroll propio.

Los tres diálogos siguen siendo `Dialog` y no pasan a `Sheet` ni a página: mantienen 4, 2 y 2 campos respectivamente, dentro del límite de §4.1 (Dialog hasta 5 campos). El problema nunca fue el número de campos sino la altura de uno solo.

### Wireframe textual

**Layout 3 — Formulario en Dialog.** Los tres diálogos conservan su composición actual; el único cambio es la altura del campo de texto libre y el tope del contenedor.

**Diálogo «Nuevo grupo» / «Editar grupo»** (sin cambios de composición):

- **Cabecera**: `DialogTitle` con el texto «Nuevo grupo» o «Editar grupo», y botón de cerrar en la esquina superior derecha. Siempre visible.
- **Campo «Nombre»**: `Label` + `Input`, placeholder «Founders early-stage». Error inline «Campo requerido» debajo cuando procede.
- **Campo «Objetivo»**: `Label` + `Textarea`, placeholder «¿Qué quieres aprender con este grupo de entrevistas?». **Altura mínima la actual; altura máxima el 35 % de la altura de la ventana; barra de desplazamiento vertical propia cuando el contenido excede ese tope.** El asa de redimensionar se mantiene, acotada por el mismo tope.
- **Campo «Plantilla de preguntas»**: `Label` + `Select` a ancho completo, opción «Sin plantilla» más las plantillas de entrevista. Siempre visible.
- **Campo «Plantilla de notas»**: `Label` + `Select` a ancho completo, opción «Sin plantilla» más las plantillas de notas. Siempre visible.
- **Pie**: `DialogFooter` con «Cancelar» (Button variant outline) a la izquierda y «Crear»/«Guardar» (Button variant default) a la derecha. Siempre visible.

**Diálogo de discovery** (sin cambios de composición): cabecera, campo «Nombre» (`Input`), campo «Objetivos» (`Textarea`, placeholder «¿Qué quieres aprender con este discovery?») con el mismo tope del 35 % y scroll propio, y pie con «Cancelar» y «Crear»/«Guardar».

**Diálogo de override de objetivo** (sin cambios de composición): cabecera con el título y el texto del objetivo como `DialogDescription`, `RadioGroup` binario de estado, campo de comentario (`Textarea`) con el mismo tope del 35 % y scroll propio, error inline «El comentario es obligatorio» cuando procede, y pie con las acciones. El `RadioGroup` y el pie quedan siempre visibles.

**Contenedor de diálogo (los tres)**: altura máxima el 85 % de la altura de la ventana. Sin scroll propio: es un tope de seguridad para que en ventanas bajas el diálogo entero quepa, cediendo altura al campo de texto.

### Componentes shadcn utilizados

Componentes: `Dialog` (`DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`), `Input`, `Textarea`, `Select`, `RadioGroup`, `Label`, `Button`.

Sin componentes adicionales: todos están instalados y en uso hoy. No se introduce ninguna variante nueva.

### data-testid

Los diálogos ya exponen `group-form-dialog`, `objective-override-dialog`, `discovery-objectives-textarea`, `group-interview-template-select` y `group-note-template-select`; se conservan. Se añaden los dos campos de texto libre que hoy no tienen locator estable:

- `group-objective-textarea` — el `Textarea` del campo «Objetivo» del diálogo de grupo.
- `objective-override-comment-textarea` — el `Textarea` del comentario del diálogo de override.

El resto de elementos son localizables por role/label/text (`getByLabelText('Objetivos')`, `getByRole('button', { name: 'Guardar' })`) y no necesitan testid adicional.

### Patrón de interacción

- **Scroll en el campo, no en el diálogo** (§7): el contenido de longitud libre se desplaza dentro de su propio control; el andamiaje del formulario —etiquetas, Selects y sticky bottom bar (§5.3)— nunca se mueve. Scrollear el diálogo completo sacaría de vista las acciones primarias, que es el fallo a corregir.
- **Tope relativo a la ventana, no absoluto**: la aplicación es una ventana de escritorio redimensionable, así que la altura útil del campo se expresa como fracción de la altura de la ventana y sigue a sus cambios de tamaño sin recargar.
- **El tope del diálogo es red de seguridad, no mecanismo**: en ventanas altas nunca llega a aplicarse; en ventanas bajas garantiza que el diálogo cabe cediendo altura al campo.
- **Feedback sin cambios**: Toast en éxito, error inline en el campo «Nombre» al enviar vacío y `AlertDialog` de confirmación donde ya existían. Esta spec no altera ningún feedback.
- Decisión no cubierta por el design system: el design system no fija una fracción concreta para campos de texto libre dentro de un modal. Se resuelve con el 35 % de la altura de la ventana porque es el valor que en los mockups deja visibles los dos Selects y el pie sin desplazar el diálogo, validado visualmente por el humano frente a alternativas del 40 % y 45 %.

### Comportamiento responsive

- **Ventana baja (altura reducida, equivalente a mobile)**: el tope del 85 % del diálogo entra en juego y el campo de objetivo cede altura; puede quedar reducido a pocas líneas con scroll, pero título, campos y botones siguen dentro de la ventana. Ningún elemento se recorta.
- **Ventana media**: interpolado entre ventana baja y ventana alta; el campo de objetivo crece con la ventana hasta alcanzar el tope del 35 %.
- **Ventana alta (uso habitual)**: el tope del 35 % gobierna el campo de objetivo y el del 85 % nunca llega a aplicarse; el diálogo se muestra centrado con el layout completo del wireframe.
- El ancho no cambia en ningún breakpoint: el diálogo mantiene su ancho máximo actual y su margen lateral en ventanas estrechas.

## Notas técnicas

No hay cambios de schema, de persistencia (`db.json` no se toca), de canales IPC ni de tipos compartidos. No hay migración. El cambio es de presentación en cuatro archivos del renderer:

- `src/renderer/src/components/ui/dialog.tsx` — tope de altura en `DialogContent`, sin `overflow` propio.
- `src/renderer/src/components/discoveries/InterviewGroupFormDialog.tsx` — tope y scroll en el `Textarea` de «Objetivo», más el `data-testid` nuevo.
- `src/renderer/src/components/discoveries/DiscoveryNameDialog.tsx` — tope y scroll en el `Textarea` de «Objetivos».
- `src/renderer/src/components/interviews/ObjectiveOverrideDialog.tsx` — tope y scroll en el `Textarea` de comentario, más el `data-testid` nuevo.

Causa raíz, para que el implementador no la rediagnostique: el `Textarea` base combina `field-sizing-content` con `min-h-16` y sin tope de altura, de modo que crece indefinidamente con el contenido y los atributos `rows` de los formularios actúan solo como altura mínima; y `DialogContent` no tiene tope de altura y se centra con una traslación del 50 %, por lo que al superar la ventana se desborda por ambos extremos a la vez. Existe precedente de la solución en `DiscardReasonsDialog`, que acota su contenedor de textareas al 50 % de la altura de la ventana con scroll.

### Verificación

Los criterios de aceptación de esta spec son de **layout**: afirman que un elemento queda o no dentro de la ventana. Vitest sobre jsdom no calcula layout —no hay motor de composición, todas las medidas son cero—, de modo que ningún test unitario puede comprobarlos. Un test de presencia de clases CSS comprobaría que alguien escribió una cadena concreta, no que el diálogo deje de recortarse: se rompería con cualquier refactor de estilos y daría cobertura falsa, que es justo lo que prohíbe `docs/RULES.md`.

Decisión humana (2026-07-27): **todos los criterios de aceptación de esta spec se marcan `MANUAL` en `tests/spec-test-map.json`**, coherente con la política del proyecto de verificación end-to-end manual. La única excepción automatizable es la presencia de los dos `data-testid` nuevos en el árbol renderizado, que sí es un hecho estructural comprobable en jsdom y sirve de red para el QA futuro. `/somo-qa-dev` no debe fabricar tests de humo que aparenten cubrir los criterios de layout.

## Decisiones asumidas

- Ubicación del tope de altura del campo → asumido **por uso, en cada diálogo**, dejando intacto el componente base `Textarea` (alternativa: aplicarlo en `ui/textarea.tsx` para todos los usos). Razón: la primitiva la comparten editores a página completa (`NoteTemplateEditorPage`, `InterviewTemplateBlockCard`), donde crecer libremente parece intencionado, y `DiscardReasonsDialog`, que ya acota por fuera y quedaría con dos scrolls anidados. Decisión confirmada por el humano.
- Fracción de altura del campo → asumido **35 % de la ventana** (alternativas evaluadas: 40 % y 45 %). Razón: es el único valor de los tres que deja visibles ambos Selects y el pie sin desplazar el diálogo. Decisión confirmada por el humano sobre los mockups.
- Asa de redimensionar del campo → asumido **se mantiene** (alternativa: suprimirla). Razón: con el tope aplicado deja de poder sacar el diálogo de la ventana, porque la altura máxima acota también el arrastre manual. Decisión confirmada por el humano.
- Alcance del arreglo → asumido **incluir el diálogo de override de objetivo**, que no venía en el reporte original (alternativa: limitarse a los dos casos reportados). Razón: mismo defecto ya diagnosticado; excluirlo dejaría un fallo conocido abierto. Decisión confirmada por el humano.
