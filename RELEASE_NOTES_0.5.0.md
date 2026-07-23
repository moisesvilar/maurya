# Maurya 0.5.0

Build de macOS (Apple Silicon, arm64) de Maurya 0.5.0.

Release incremental sobre [0.4.0](https://github.com/moisesvilar/maurya/releases/tag/v0.4.0): recorta drásticamente el coste de IA por entrevista, sube la sesión de grabación a la top bar para que esté siempre a la vista, muestra los objetivos también en el detalle de captura, y corrige dos fallos del asistente y del guión.

## Descarga

- **`Maurya-0.5.0.dmg`** — instalador, la opción recomendada.
- **`Maurya-0.5.0-arm64-mac.zip`** — mismo build en ZIP, lo usa el autoupdater.

Los `.blockmap` y `latest-mac.yml` acompañan a los binarios para las actualizaciones diferenciales; no hace falta descargarlos a mano.

## Requisitos

- macOS 14.2 o superior (el backend CATap de captura del audio del sistema lo exige).
- Mac con Apple Silicon. No hay build para Intel.

## Primer arranque

La app va firmada **ad-hoc**, sin Developer ID ni notarización, así que Gatekeeper la bloquea la primera vez. Para abrirla: clic derecho sobre Maurya.app → *Abrir* → *Abrir* en el diálogo. Ver el README para el detalle y para colocar la API key en el userData de la app empaquetada.

---

## Novedades desde 0.4.0

### Coste de IA: hasta ~60% más barato por entrevista (#14)

Una entrevista de 1 h se iba por encima de **$3** de coste de IA (caso real: 100 llamadas, $3.12), con ~97% de las llamadas del asistente en vivo corriendo sobre Opus 4.8. Esta versión aplica la revisión de coste acordada:

- **El asistente en vivo se parte en dos llamadas** con perfiles de riesgo distintos:
  - *Interactiva* (sugerencia + alarmas + cursor del guión): por defecto **Haiku 4.5 sin thinking**. Los disparadores no cambian; con la cola de preguntas llena, se salta los disparos por líneas y solo actúa el respaldo periódico.
  - *Mantenimiento* (resolución de la cola + evaluación de objetivos, las salidas irreversibles): por defecto **Sonnet 5 con adaptive thinking**, cada 30 s, y con salto determinista cuando no hay nada que mantener (sin cola ni objetivos pendientes → cero llamadas).
- **Configuración de modelos por tarea** en Ajustes (nueva card «Modelos de IA»): 7 tareas de IA, cada una con su modelo y su modo de *thinking*, editables sin tocar código.
- **Desglose de uso auditable**: el coste se persiste por tarea con sus cuatro componentes de tokens (incluye el hit-rate de caché), sin romper los totales ni el límite de coste ya existentes.
- **Ahorro estimado: de ~$3 a ~$1.10–1.25 por entrevista de 1 h** con los valores por defecto.

### La sesión de grabación, siempre visible en la top bar (#13)

Durante la grabación de una captura, la sesión en vivo — cronómetro, botón «Detener», estado de la transcripción y medidores de nivel compactos — pasa a la **top bar**, visible mientras navegas por el guión. Antes vivía al final de la página y obligaba a hacer scroll. Al terminar, la sección de «Grabación» vuelve al final con el material de archivo, como hasta ahora.

### Objetivos también en el detalle de captura (#12)

Las capturas son entrevistas: ya generaban objetivos, hacían seguimiento en vivo y se evaluaban al terminar, pero **la sección Objetivos no se mostraba** en `/captures/:id` (sí al abrir la misma entrevista desde Discoveries). Ahora se renderiza con el mismo orden que el detalle de entrevista, así que el resultado deja de ser invisible.

### Correcciones

- **El guión ya no termina en frases amputadas (#10).** El recorte de seguridad del guión cortaba a media frase cuando el modelo se pasaba del tope de caracteres. Ahora corta en el final de la última línea o frase completa que quepa; nunca se persiste una frase a medias.
- **Fin del error aleatorio del asistente por `max_tokens` (#11).** La generación de preguntas fallaba de forma intermitente («El análisis no terminó correctamente») porque el *thinking* adaptativo consumía el tope de tokens. Se eleva el límite del asistente para alinearlo con el resto de servicios LLM, sin penalizar la latencia.

---

## Cambios incluidos

- #14 — Revisión de coste de IA: split del asistente, modelos por tarea y desglose de uso
- #13 — Mueve la sesión de grabación de la captura a la top bar
- #12 — Muestra la sección Objetivos en el detalle de captura
- #11 — Sube `max_tokens` del asistente a 4096 para dar aire al *thinking* adaptativo
- #10 — Recorte del guión en límite seguro (tope 6000 caracteres, sin frases amputadas)

**Changelog completo:** https://github.com/moisesvilar/maurya/compare/v0.4.0...v0.5.0
