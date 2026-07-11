# Marcar y desmarcar objetivos como cumplidos

Poder marcar o desmarcar un objetivo como cumplido junto con un comentario que también sea visible debajo del objetivo.

Por ejemplo:

Objetivo marcado como **no** cumplido junto con su explicación generada debajo:

> Entender la estructura de gasto actual en software y cómo se toman las decisiones de compra dentro del negocio (quién decide y con qué criterio).
>
> *Solo se obtiene la cifra de gasto (150€/año en ClinicGS). No hay evidencia sobre quién toma las decisiones de compra ni con qué criterio dentro del negocio; falta la estructura de decisión.*

Poder marcarlo como sí que está cumplido junto con un comentario en un textarea y poner algo como "La decisión de compra la toma la propia Lucía porque es autónoma y trabaja ella sola en el negocio".

De tal manera que el objetivo queda como cumplido y así:

> Entender la estructura de gasto actual en software y cómo se toman las decisiones de compra dentro del negocio (quién decide y con qué criterio).
>
> *- Solo se obtiene la cifra de gasto (150€/año en ClinicGS). No hay evidencia sobre quién toma las decisiones de compra ni con qué criterio dentro del negocio; falta la estructura de decisión.-* 
>
> Gasta 150€/año en ClinicGS y es la propia Lucía la que toma las decisiones de compra porque es autónoma y trabaja ella sola en el negocio

Donde la parte del texto encuadrada en guiones ("-Solo se obtiene... de decisión-") aparecerá tachada. La segunda parte ("Gasta 150€/año...") será generada a través la API del LLM en función del comentario introducido en el textarea.

# Edición markdown por defecto

Ahora mismo, para poder editar el markdown de una "Nota" es necesario pulsar el botón "Editar" para entrar en el modo edición.

Quiero que ya directamente la "Nota" se muestre en el modo edición, pudiendo verlo directamente y editarlo directamente si se quiere. Si se hace algún cambio con respecto al contenido original, aparecen los botones "Guardar" y "Descartar" tal y como ocurre ahora. Los botones Exportar, Ver Transcripción y Regenerar nota, estarán siempre visibles.

Lo mismo quiero que pase a la hora de editar un "Guión". Unificarás el comportamiento mostrando los botones "Guardar" y "Descartar" (ahora mismo se muestran los botones "Cancelar" y "Guardar"). El botón Regenerar siempre estará visible. Unificarás diseño entre este botón "Regenerar" del Guión con el botón "Regenerar" de la "Nota".

# Mover sección Grabación al final

La sección "Grabación" dentro de una entrevista se mostrará al final de la página. Me refiero a esta sección:

```
Grabación

Latencia STT mediana 0,1 s · p95 1,8 s · máx 2,2 s · 197 resultados | OK

/Users/moisesvidal32701233v/Library/Application Support/Maurya/recordings/spike-2026-07-07T11-04-19-137Z.wav

/Users/moisesvidal32701233v/Library/Application Support/Maurya/recordings/spike-2026-07-07T11-04-19-137Z.transcript.json

Mostrar en Finder | Nueva grabación
```

# Cambios en la edición de prompts personalizados

En `Ajustes > Prompts personalizados`, cada prompt estará dentro de un componente acordeón, todos colapsados de inicio. Cuando pulse en el botón de edición (con el icono del lápiz), de uno de los prompts, éste se expanderá y mostrará el textarea con edición wysiwyg markdown. No se mostrará en un side panel. No se mostrará la sección de ***Reglas fijas (no editables)*.** El expandir-colapsar prompts no es solidario, es decir, puede haber uno o varios prompts expandidos al mismo tiempo (expandir uno no colapsa el resto).

A la hora de aplicar prompts personalizados en la inferencia de guión, notas o en el asistente en vivo, implementa mecanismos para evitar *prompt injection* estilo "Olvida todas tus instrucciones anteriores" o prompts que no tengan nada que ver el objetivo final de esta aplicación. Si eso ocurre, ignorarás esta parte del prompt.

# Mejoras en las capturas

- Si el nombre está vacío, dejar como nombre "Captura dd-mmmm-yyyy hh:mm" con la fecha y la hora de inicio de la captura.
- El guión empezará a generarse automáticamente tras la creación de la captura, sin necesidad de pulsar el botón "Generar guión"

Las opciones en la página de Captura:

```
Grabación

Micrófono Concedido

Audio del sistema Concedido

Micrófono
[OPCIONES DE MICRÓFONO]
```

Aparecerán en la top bar (donde el botón "Buscar"), en pequeño y en horizontal.

El botón "Iniciar grabación" (en estilo primary) aparecerá al lado del botón "asignar empresa" (en estilo secondary)

El mensaje:

```
Nota
Graba la entrevista para poder generar la nota.
```

Quítalo, no aporta nada.

Elimina el componente donde aparece la transcripción en tiempo real.

En el componente de siguiente pregunta sugerida:

- Elimina los iconos de thumbs up y thumbs down cuando aparezca una pregunta.
- Actualmente, se genera una nueva pregunta sugerida cada pocos segundos. Si el contacto está hablando mientras y no se ha podido realizar la pregunta, al generar la siguiente, la anterior pregunta se pierde. Es más, muchas veces la pregunta nueva generada es muy similar o casi idéntica a la anterior, que desaparece para dejar paso a la nueva. Quiero evitar este comportamiento, porque no da tiempo a ir planteando las preguntas a medida que aparecen.

## Enfoque acordado: cola persistente + supresión por similitud (2026-07-11)

En lugar de anclar preguntas a mano (obliga a operar la UI justo cuando la atención debe estar en la conversación), el componente mantiene una **cola de preguntas pendientes que persisten hasta que se resuelven** — no se sobrescriben al generar la siguiente. Es un pequeño backlog estable, no una sugerencia que parpadea.

- **Tamaño de cola configurable en `Ajustes`**, con **valor por defecto de 3**. Es el número máximo de preguntas pendientes que se muestran a la vez.
- **Supresión por similitud contra toda la cola** (no solo contra una pregunta anterior): al generar una candidata nueva, si es muy similar a alguna ya presente en la cola, se descarta y no se muestra. Esto ataca la causa raíz (preguntas casi idénticas que se pisan).
- **Resolución automática**: cuando la transcripción detecta que el tema de una pregunta ya se cubrió (o se supera un umbral de turnos), esa pregunta se marca como atendida y sale de la cola, dejando sitio a una nueva.
- El **anclado manual** (chincheta) queda como red de seguridad **opcional**, no como mecanismo principal: sirve para retener una pregunta que el usuario no quiere perder aunque el sistema crea que ya se cubrió. Una pregunta anclada no cuenta contra el tamaño de la cola ni se resuelve automáticamente. Si no hay ninguna anclada, su sección no se muestra.
- Sin cambios en la frecuencia de inferencia ni en el control de coste/latencia existentes (líneas nuevas + intervalo, prompt caching); solo cambia la **gestión de estado** de las sugerencias.