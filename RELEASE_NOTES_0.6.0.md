# Maurya 0.6.0

Build de macOS (Apple Silicon, arm64) de Maurya 0.6.0.

Release incremental sobre [0.5.0](https://github.com/moisesvilar/maurya/releases/tag/v0.5.0): hace visibles sin scroll los permisos de captura no concedidos, permite mover y eliminar entrevistas desde el listado de un grupo, y unifica la gestión y la terminología de plantillas dentro de Ajustes. Incluye también un nuevo FAQ para usuarios finales.

## Descarga

- **`Maurya-0.6.0.dmg`** — instalador, la opción recomendada.
- **`Maurya-0.6.0-arm64-mac.zip`** — mismo build en ZIP, lo usa el autoupdater.

Los `.blockmap` y `latest-mac.yml` acompañan a los binarios para las actualizaciones diferenciales; no hace falta descargarlos a mano.

## Requisitos

- macOS 14.2 o superior (el backend CATap de captura del audio del sistema lo exige).
- Mac con Apple Silicon. No hay build para Intel.

## Primer arranque

La app va firmada **ad-hoc**, sin Developer ID ni notarización, así que Gatekeeper la bloquea la primera vez. Para abrirla: clic derecho sobre Maurya.app → *Abrir* → *Abrir* en el diálogo. Ver el README para el detalle y para colocar la API key en el userData de la app empaquetada.

¿Dudas al instalar, conceder permisos o configurar las claves? Consulta las [preguntas frecuentes (FAQ)](FAQ.md).

---

## Novedades desde 0.5.0

### Permisos de captura no concedidos, visibles sin scroll (#16)

Cuando el micrófono o el audio del sistema no están concedidos, la acción correctiva y el error ahora se ven sin hacer scroll:

- **Botón «Abrir Ajustes del Sistema»** junto a los badges de permisos —en la top bar de la captura y en el bloque de Preparación del detalle de entrevista— que lleva directo al primer permiso pendiente (micrófono con prioridad).
- **Alert de error de permiso bajo la cabecera** (antes de Objetivos) cuando falla el inicio de grabación, tanto en el detalle de captura como en el de entrevista, en lugar de quedar escondido al final de la sección de Grabación.

### Mover una entrevista a otro grupo (#17)

Hasta ahora una entrevista solo podía asignarse a un grupo al crearla. Cada fila del listado de un grupo estrena un menú «⋯» con **«Mover a otro grupo»**: un diálogo con el resto de grupos del mismo discovery. La persistencia revalida la invariante existente —el grupo destino debe pertenecer al mismo discovery—, así que un destino inválido se rechaza sin escribir nada.

### Eliminar entrevistas desde el listado de un grupo (#19)

El mismo menú «⋯» de cada fila incorpora **«Eliminar»**, con diálogo de confirmación. Antes solo se podían borrar entrevistas desde Capturas. Es un borrado permanente (la app no tiene papelera) con cascada a las notas, coherente con el comportamiento de Capturas.

### Gestión de plantillas unificada en Ajustes (#20)

La gestión de **plantillas de preguntas** se traslada a una nueva pestaña dentro de **Ajustes** («Plantillas de entrevistas»), junto a las plantillas de notas, retirando la antigua página `/templates`. Conserva editar, duplicar y eliminar, el badge de fase y el resumen de bloques y preguntas. Los enlaces antiguos siguen funcionando (redirección automática) y desaparece la entrada «Plantillas» del menú lateral.

### Terminología de plantillas unificada (#21)

Toda la app pasa a hablar de **«Plantilla(s) de preguntas»** y **«Plantilla(s) de notas»**, con **«Sin plantilla»** para la ausencia, en lugar de las seis variantes que convivían antes («Template de preguntas», «Sin template», «Note-template»…). Es un cambio solo de textos, sin tocar funcionalidad ni flujo.

### FAQ para usuarios finales (#18)

Nuevo **`FAQ.md`** con las preguntas frecuentes verificadas contra el código: requisitos, primer arranque con Gatekeeper, cómo conceder permisos de micrófono y audio del sistema, el arreglo de quitar/añadir con `−`/`+` cuando un permiso queda corrupto, configuración de claves (Deepgram/Anthropic), privacidad de los datos locales y control de coste de IA. Enlazado desde el README y las notas de release.

---

## En preparación (solo documentación, sin implementar aún)

Dos specs quedan versionadas a la espera de más feedback de usuario antes de entrar al pipeline; **no cambian la app en esta versión**:

- **Modo compacto always-on-top durante la grabación (#22)** — panel flotante con la salida del asistente y la salud de captura, para ver la cara del entrevistado mientras usas la app.
- **Soporte multilenguaje por función (#23)** — idioma independiente para interfaz, guión, transcripción, asistente y notas (`es`/`en`).

---

## Cambios incluidos

- #23 — Spec y plan de soporte multilenguaje por función (en espera)
- #22 — Spec y plan de modo compacto always-on-top (en espera)
- #21 — Unifica la terminología de plantillas en toda la app
- #20 — Unifica la gestión de plantillas en Ajustes
- #19 — Eliminar entrevistas desde el listado de un grupo
- #18 — FAQ.md + guardrail de saltos de línea espurios en Markdown
- #17 — Mover una entrevista a otro grupo de entrevistas
- #16 — Permisos de captura no concedidos, visibles sin scroll

**Changelog completo:** https://github.com/moisesvilar/maurya/compare/v0.5.0...v0.6.0
