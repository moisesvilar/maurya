# SPEC-036 — Cola persistente de preguntas sugeridas del asistente (anti-descarte)

> Requisitos origen: RF-ASIS-002 (Must) + RF-ASIS-004 (Must) · Ítem H9.9 del checklist ·
> §«Enfoque acordado: cola persistente + supresión por similitud (2026-07-11)» de
> `docs/drafts/improvements-20260711.md`.

## Descripción

Durante una entrevista, el asistente en vivo hoy muestra UNA sola sugerencia que se pisa con cada
análisis: si el interlocutor sigue hablando, la pregunta anterior desaparece antes de poder
plantearla, y la nueva es a menudo casi idéntica. Esta spec convierte esa sugerencia única en una
**cola de preguntas pendientes que persisten hasta resolverse**: las candidatas casi duplicadas se
suprimen, las preguntas cuyo tema ya se cubrió salen solas de la cola, y el entrevistador puede
anclar (chincheta) las que no quiere perder. Los botones 👍/👎 de valoración desaparecen. El tamaño
de la cola es configurable en Ajustes (por defecto 3).

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes,
  páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests
  unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega.
  Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya
  commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador
  entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica
  explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura.
- **No se modifican** la frecuencia de inferencia ni el control de coste/latencia existentes
  (mínimo de 3 líneas nuevas, intervalo de 20 s, respaldo de 45 s, prompt caching de SPEC-023,
  pausa por límite de coste de SPEC-021): solo cambia la gestión de estado de las sugerencias.

## Derogaciones sobre specs anteriores

- El AC de SPEC-016 «GIVEN una sugerencia visible WHEN el usuario pulsa 👍 o 👎 (aria-labels
  "Sugerencia útil"/"Sugerencia no útil") THEN la valoración queda registrada (resaltado del botón
  elegido) y se persiste con la sesión» **queda obsoleto y debe entenderse derogado**: los botones
  👍/👎 se eliminan del panel.
- El AC de SPEC-016 «GIVEN la grabación detenida WHEN se persiste la transcripción THEN el registro
  de la sesión del asistente (nº de sugerencias, valoraciones 👍/👎) queda incluido en el archivo de
  transcripción» **queda obsoleto y debe entenderse derogado** en lo relativo a las valoraciones:
  el registro persistido conserva el nº de sugerencias y el uso de IA (SPEC-021), pero ya no
  contiene contadores de feedback.
- Los elementos del wireframe y del patrón de interacción de SPEC-016 relativos a los botones
  👍/👎 y a «una única sugerencia visible que se sustituye con cada análisis» **quedan obsoletos y
  deben entenderse derogados**; el «tamaño justo» (RF-ASIS-004) pasa a significar: una cola
  acotada (máx. configurable, default 3) de preguntas accionables, glanceable y sin histórico
  infinito. El resto de SPEC-016/021/023 (estados, análisis, coste, caching) sigue vigente.

## Criterios de aceptación

### Cola de pendientes (persistencia anti-descarte)

- GIVEN el asistente activo con la cola vacía WHEN un análisis devuelve una candidata nueva THEN la pregunta aparece en la cola con su badge de acción («Profundiza»/«Continúa»), sus chips de alarma, la pregunta y el porqué.
- GIVEN la cola con una pregunta pendiente WHEN un análisis posterior devuelve una candidata distinta sin marcar ninguna como resuelta THEN la cola muestra ambas preguntas (la anterior no se pierde), con la más reciente en primer lugar.
- GIVEN la cola con preguntas pendientes WHEN se lanza un nuevo análisis THEN el mensaje de usuario enviado a la API incluye las preguntas actualmente en cola (pendientes y ancladas) y los bloques de sistema de la sesión permanecen byte-idénticos a los de su arranque.
- GIVEN la cola con la pregunta «¿Cuándo fue la última vez que pasó?» WHEN un análisis devuelve una candidata equivalente que solo difiere en mayúsculas, espacios o puntuación THEN la candidata se descarta por similitud y la cola no cambia.
- GIVEN la cola con tantas pendientes como el tamaño configurado WHEN un análisis devuelve una candidata nueva sin marcar ninguna resuelta THEN la candidata se descarta y la cola conserva sus preguntas.
- GIVEN la cola con una pregunta pendiente WHEN el análisis marca esa pregunta como ya cubierta por la conversación THEN la pregunta sale de la cola automáticamente y la candidata nueva ocupa el hueco.
- GIVEN la grabación en curso WHEN se detiene y se vuelve a iniciar una grabación THEN la cola arranca vacía (la cola es estado de sesión, no se persiste entre grabaciones).

### Anclado manual (chincheta)

- GIVEN una pregunta pendiente en la cola WHEN el usuario pulsa su botón de anclar (aria-label «Anclar pregunta») THEN la pregunta pasa a la sección «Ancladas» y deja de contar contra el tamaño de la cola.
- GIVEN ninguna pregunta anclada WHEN se muestra el panel THEN la sección «Ancladas» no se renderiza.
- GIVEN una pregunta anclada WHEN el análisis marca su tema como cubierto THEN la pregunta permanece en «Ancladas» (nunca se resuelve automáticamente).
- GIVEN una pregunta anclada WHEN el usuario pulsa su botón de desanclar (aria-label «Desanclar pregunta») THEN la pregunta vuelve a la lista de pendientes.
- GIVEN la cola de pendientes llena y una pregunta anclada WHEN un análisis devuelve una candidata nueva no similar THEN la candidata entra en la cola (las ancladas no consumen hueco).

### Retirada del feedback 👍/👎

- GIVEN el panel del asistente con preguntas en cola WHEN se muestra THEN no existen los botones «Sugerencia útil» ni «Sugerencia no útil».
- GIVEN la grabación detenida WHEN se persiste la transcripción THEN el registro del asistente incluye el nº de sugerencias y el uso de IA de la sesión, sin contadores de feedback.

### Ajuste del tamaño de cola

- GIVEN la página Ajustes, pestaña «Claves de IA» WHEN carga THEN se muestra el control «Tamaño de la cola de preguntas» con el valor 3 seleccionado por defecto.
- GIVEN el control de tamaño WHEN el usuario selecciona otro valor THEN el cambio se guarda y aparece un Toast de confirmación.
- GIVEN un tamaño guardado distinto de 3 WHEN arranca una nueva sesión del asistente THEN la cola usa ese tamaño como máximo de pendientes.
- GIVEN un almacén de ajustes ilegible o sin dato WHEN arranca una sesión del asistente THEN se usa el tamaño por defecto 3 (el asistente nunca se bloquea por esto).

### Estados existentes (regresión)

- GIVEN preguntas en la cola WHEN hay un análisis en curso THEN el indicador «Analizando…» se muestra sin ocultar la cola.
- GIVEN preguntas en la cola WHEN un análisis falla THEN la cola se conserva visible y aparece la línea discreta de error existente.
- GIVEN el asistente pausado por límite de coste WHEN se muestra el panel THEN el Alert de pausa sustituye a la lista (comportamiento SPEC-021) y al pulsar «Reanudar asistente» la cola reaparece intacta.
- GIVEN el asistente activo sin conversación todavía WHEN se muestra el panel THEN aparece el mensaje «El asistente te sugerirá la siguiente pregunta en cuanto haya conversación.».
- GIVEN preguntas en la cola WHEN llegan líneas finales nuevas THEN los disparadores del análisis siguen siendo los de SPEC-016/023 (mínimo 3 líneas nuevas, intervalo 20 s, respaldo 45 s) sin llamadas adicionales por la gestión de la cola.

## UX Design

### Wireframe textual

**Panel del asistente** (Card existente `border-primary/40 bg-primary/5`, dentro de la sección de
grabación de la entrevista — Layout 2, detalle; sin cambios de ubicación):

```
┌─ Card (asistente) ────────────────────────────────────────────┐
│ [Analizando… ⟳]                              (derecha, muted) │
│                                                               │
│ ── Pendientes (sin heading; la lista ES el panel) ──          │
│ ┌─ item (más reciente primero) ────────────────────────────┐ │
│ │ [Badge Profundiza ámbar] [Badge outline Cumplido]  [📌]  │ │
│ │ ¿Cuándo fue la última vez que te pasó?   (font-medium)   │ │
│ │ Falta un caso concreto: pide el último episodio. (muted) │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ┌─ item ───────────────────────────────────────────────────┐ │
│ │ [Badge Continúa verde]                             [📌]  │ │
│ │ ¿Quién más participó en esa decisión?                    │ │
│ │ Ya hay material concreto; avanza con el guión.           │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                               │
│ ── Ancladas (solo si hay ≥1) ──                               │
│ heading xs muted: "Ancladas"                                  │
│ ┌─ item anclado ───────────────────────────────────────────┐ │
│ │ [Badge Profundiza ámbar]                          [📌✓]  │ │
│ │ ¿Cuánto pagasteis por la solución actual?                │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                               │
│ IA: 4 llamadas · $0,03            (línea de uso, sin cambios) │
└───────────────────────────────────────────────────────────────┘
```

- Cada ítem es un bloque compacto (borde sutil `border rounded-md p-2` o separador entre ítems):
  fila 1 = Badge de acción («Profundiza» ámbar / «Continúa» verde) + chips de alarma (Badge
  outline ámbar: «Cumplido», «Genérico», «Hipotético») + botón de anclar a la derecha (Button
  ghost icon-sm, icono Lucide `Pin`; en ancladas, `PinOff` para desanclar); fila 2 = pregunta
  (text-base font-medium); fila 3 = porqué (text-sm muted).
- En los ítems anclados el porqué se omite (máxima compacidad: la pregunta ya fue evaluada por el
  usuario al anclarla).
- El indicador «Analizando…» (Loader2 girando + texto muted) se mantiene arriba a la derecha del
  panel, sin desplazar la lista.
- Estados `no-key`, `paused` (Alert con «Reanudar asistente»), línea de error y línea de uso: sin
  cambios respecto a SPEC-016/021.

**Ajustes → pestaña «Claves de IA»** (Layout 4, settings; debajo de la card de coste de IA
existente):

```
┌─ Card "Asistente en vivo" ────────────────────────────────────┐
│ Título: Asistente en vivo                                     │
│ Descripción muted: Número máximo de preguntas pendientes      │
│ visibles a la vez durante la entrevista.                      │
│ Label "Tamaño de la cola de preguntas" + Select [3 ▾] (1–5)   │
└───────────────────────────────────────────────────────────────┘
```

- Select con opciones 1, 2, 3, 4, 5; al cambiar se guarda de inmediato y se muestra Toast
  «Ajustes guardados» (misma mecánica de guardado inmediato que la card de coste de IA).

### Componentes shadcn utilizados

Componentes: Card, Badge, Button, Alert, Select, Label, Toast (sonner), Tooltip.
Todos instalados ya en el proyecto; sin componentes adicionales.

### data-testid

- `assistant-queue` — contenedor de la lista de preguntas pendientes.
- `assistant-queue-item` — cada ítem de la cola (pendiente).
- `assistant-pinned-section` — sección «Ancladas» (contenedor; ausente sin ancladas).
- `assistant-pinned-item` — cada ítem anclado.
- `assistant-queue-size-select` — trigger del Select de tamaño de cola en Ajustes.
- Reutilizados sin cambios: `assistant-paused-alert`, `assistant-usage-line`.
- Botones de anclar/desanclar: localizables por aria-label («Anclar pregunta» / «Desanclar
  pregunta»); sin testid propio.

### Patrón de interacción

- **Lista (no Table/Cards):** cada ítem tiene 1 dato primario (la pregunta) + metadatos (acción,
  alarmas, porqué) — regla 4.2 del design system (List para 1-2 campos, escaneo rápido secuencial).
  Sin sorting ni selección.
- **Anclar/desanclar = acción atómica inline** (regla 5.3, acciones por ítem a la derecha), botón
  icon-only con `aria-label` obligatorio (regla 11.3) y Tooltip explicativo.
- **Acción reversible sin AlertDialog** (regla 6.3: AlertDialog solo para acciones irreversibles):
  anclar/desanclar alternan sin confirmación ni Toast (feedback = el ítem cambia de sección de
  inmediato; un Toast por anclado sería ruido durante la escucha, RF-ASIS-004).
- **Ajuste con guardado inmediato + Toast** (regla 6.1: Toast tras acción mutadora exitosa),
  coherente con la card de límite de coste ya existente en la misma pestaña.
- **Select (no Input numérico ni RadioGroup):** 5 opciones cerradas sin descripción — regla 4.4.
- Decisión no cubierta por el design system: el orden de la cola (más reciente primero). Se
  resuelve así porque la sugerencia recién generada es la más pertinente al momento de la
  conversación y debe ser glanceable sin scroll (RF-ASIS-004).

### Comportamiento responsive

- **Mobile (< md):** misma columna única; los ítems ya son apilados y de ancho completo. Los
  badges de la fila 1 hacen wrap si no caben; el botón de anclar permanece visible (nunca se
  oculta una acción primaria). En Ajustes, la card ocupa el ancho completo con el Select debajo
  del label.
- **Tablet (md–lg):** interpolado entre mobile y desktop.
- **Desktop (lg+):** wireframe completo tal cual.

## Notas técnicas

- **La cola es estado de sesión en main** (`assistantService.ts`, patrón de la sesión existente):
  nace vacía en cada `startAssistant` y muere en `stopAssistant`. No se persiste en db.json ni en
  el transcript (el transcript conserva `suggestionCount` y `usage`; pierde `feedback`).
- **Contrato con el LLM:** la cola viaja en el **mensaje de usuario** de cada análisis (lista
  numerada de preguntas pendientes y ancladas), nunca en los bloques de sistema — preservar la
  byte-estabilidad del prefijo cacheado es invariante de SPEC-023. El schema de salida se extiende
  para que el modelo devuelva, además de la candidata (action/suggestedQuestion/reason/alarms) y
  `objectivesMet`, los índices de las preguntas en cola cuyo tema ya quedó cubierto (resolución
  automática). El prompt instruye además no proponer preguntas similares a las ya en cola.
- **Supresión por similitud con doble barrera:** instrucción en el prompt (primera barrera) +
  comprobación determinista en main contra TODA la cola —pendientes y ancladas— antes de
  encolar (segunda barrera; normalización de mayúsculas/espacios/puntuación como mínimo). La
  comprobación determinista es la que garantizan los ACs.
- **Resolución de índices defensiva** (patrón `parseAnalysis`): índices fuera de rango se filtran;
  los que apunten a preguntas ancladas se ignoran (nunca se auto-resuelven).
- **Tamaño de cola:** singleton en el almacén JSON siguiendo el patrón de los ajustes de coste de
  IA existentes (`aiCostSettings`), con su canal IPC de lectura/escritura de la familia `db:*`
  (envelope `{ ok, data } | { ok, error }`). Se lee UNA vez en `startAssistant`; un cambio a mitad
  de sesión aplica a la siguiente (mismo criterio que el override de prompts de SPEC-026/031).
- **Eventos main → renderer:** `assistant:update` pasa a transportar la cola completa (pendientes
  ordenadas + ancladas) en lugar de la sugerencia única; main es la única fuente de verdad y el
  renderer la refleja tal cual. Anclar/desanclar viaja renderer → main por un canal nuevo del
  asistente (fire-and-forget, como el feedback que se retira). El API de feedback
  (`sendFeedback` / tipo de voto) se elimina de tipos, preload y main.
- **Sin cambios** en disparadores (3 líneas / 20 s / 45 s), guard `inFlight`, pausa por límite
  (SPEC-021), `MAX_TOKENS`/`maxLength` de salida (SPEC-023) ni en la salvaguarda de prompts
  (SPEC-031). El crecimiento del mensaje de usuario por la cola está acotado por el tamaño máximo
  (≤5 preguntas cortas).

## Decisiones asumidas

- Ubicación del ajuste → asumido pestaña «Claves de IA» de Ajustes, card propia debajo de la de
  coste de IA (alternativa: pestaña nueva «Asistente»). Regla: Layout 4 / agrupar los ajustes de
  IA existentes en una sola pestaña; una pestaña para un único control es densidad innecesaria.
- Rango del tamaño de cola → asumido Select con 1–5 (alternativa: Input numérico libre). Regla:
  design system §4.4 (opciones cerradas 3-10 → Select); >5 preguntas pendientes contradiría el
  «tamaño justo» de RF-ASIS-004.
- Momento de lectura del tamaño → asumido al arrancar la sesión; un cambio a mitad aplica a la
  siguiente (alternativa: lectura en cada análisis con desalojo si se reduce). Regla: criterio ya
  sentado por el override de prompts (SPEC-026) y semántica más simple de verificar.
- Orden de la cola → asumido más reciente primero (alternativa: FIFO). Justificado en Patrón de
  interacción.
- Desanclar con la cola llena → asumido que la pregunta vuelve a pendientes aunque la cola quede
  temporalmente por encima del máximo; mientras esté por encima no entran candidatas nuevas
  (alternativa: bloquear el desanclado con cola llena). Regla: nunca perder trabajo del usuario
  ni deshabilitar una acción sin motivo claro (§5.4 exigiría Tooltip de disabled — peor UX).
- Ítems anclados sin porqué → asumido omitirlo por compacidad (alternativa: mostrarlo). Regla:
  RF-ASIS-004 (tamaño justo); al anclar, el usuario ya evaluó la pregunta.
- `suggestionCount` persistido → asumido que cuenta las candidatas ACEPTADAS en cola (las
  suprimidas por similitud o cola llena no cuentan) (alternativa: contar todas las respuestas del
  LLM). Regla: el registro mide sugerencias realmente ofrecidas al usuario.
- Pausa por límite (SPEC-021) → asumido mantener el comportamiento vigente: el Alert sustituye a
  la lista y la cola reaparece al reanudar (alternativa: mostrar la cola bajo el Alert). Regla:
  no derogar SPEC-021 sin necesidad; el Alert es información persistente que requiere acción.
