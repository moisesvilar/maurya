# SPEC-016 — Asistencia proactiva en tiempo real durante la entrevista

> Requisitos origen: RF-ASIS-001 (Must) + RF-ASIS-002 (Must) + RF-ASIS-003 (Must) + RF-ASIS-004 (Must) + RF-ASIS-005 (Should) + RF-ASIS-006 (Should) + NFR §4.5 control de coste (Must) + KPI #3 feedback (Should) · Hito H5 completo (8 ítems) · **EL DIFERENCIADOR**
> Relacionados: SPEC-015 (grabación+transcripción en vivo donde vive la asistencia), SPEC-014 (guión y objetivos como contexto; patrón llmService), SPEC-002 (flujo de finales de transcripción en main), Riesgos #2 (distracción), #3 (latencia) y #5 (coste) del PRD
> Naturaleza: feature de producto con UI.

## Descripción

Mientras la entrevista se graba y transcribe, un asistente de IA analiza la conversación de forma proactiva —sin que el entrevistador tenga que pedir nada— y le muestra una única sugerencia en el tamaño justo: si debe **profundizar** en lo que acaba de responder el interlocutor (pidiendo el detalle concreto que falta, al estilo The Mom Test) o **continuar** con el guión, siempre con la siguiente pregunta propuesta y el porqué. Además marca en vivo qué objetivos de la entrevista se van cumpliendo, avisa de señales de alarma (cumplidos, genéricos, futuros hipotéticos) y permite valorar cada sugerencia con 👍/👎 para medir su utilidad. El análisis se hace por ventanas de conversación con control estricto de frecuencia para contener coste y latencia.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya pusheado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura. **Sin Supabase.**
- **Matices:** la asistencia existe solo durante la grabación de una entrevista (no en `/capture`); guión y objetivos son contexto recomendado pero no obligatorio; la calidad percibida de las sugerencias es juicio humano (Riesgo #2 — test de usabilidad manual); la verificación con la API real de Anthropic sigue pendiente de la clave del humano.

## Criterios de aceptación

### Activación y proactividad

- GIVEN una grabación de entrevista en curso con transcripción activa y clave de Anthropic configurada WHEN se acumula material nuevo de conversación THEN el asistente analiza automáticamente (sin interacción del usuario) y muestra su sugerencia.
- GIVEN el análisis en curso WHEN se muestra el panel del asistente THEN presenta un indicador discreto "Analizando…" sin ocultar la sugerencia anterior.
- GIVEN sin clave de Anthropic WHEN se graba THEN el panel del asistente muestra el estado "Asistente inactivo — configura tu clave de Anthropic en Ajustes" y no se hace ninguna llamada.
- GIVEN la transcripción inactiva (sin key de Deepgram o desconectada) WHEN se graba THEN el asistente permanece inactivo (no hay material que analizar).

### La sugerencia (tamaño justo)

- GIVEN un análisis completado WHEN se muestra la sugerencia THEN presenta exactamente: el Badge de acción ("Profundiza" ámbar / "Continúa" verde), la siguiente pregunta propuesta (texto destacado) y el porqué en una línea `muted` — nada más.
- GIVEN una nueva sugerencia WHEN llega THEN sustituye a la anterior (solo hay una sugerencia visible a la vez).
- GIVEN la acción "Profundiza" WHEN se muestra el porqué THEN referencia el motivo concreto (p. ej. falta de evidencia concreta según The Mom Test, o un objetivo aún no cubierto).

### Señales de alarma

- GIVEN el interlocutor emite cumplidos, genéricos o futuros hipotéticos ("suena interesante", "normalmente hacemos", "lo compraríamos") WHEN el asistente los detecta THEN la sugerencia incluye un aviso de señal de alarma (chip ámbar con el tipo detectado) y la propuesta reconduce a lo concreto.

### Objetivos en vivo

- GIVEN una entrevista con objetivos generados WHEN la grabación está en curso THEN el panel muestra la lista de objetivos con su estado (pendiente/cubierto) actualizado por el asistente en cada análisis.
- GIVEN una entrevista sin objetivos WHEN se graba THEN el panel de objetivos no se muestra (sin error).

### Feedback

- GIVEN una sugerencia visible WHEN el usuario pulsa 👍 o 👎 (aria-labels "Sugerencia útil"/"Sugerencia no útil") THEN la valoración queda registrada (resaltado del botón elegido) y se persiste con la sesión.
- GIVEN la grabación detenida WHEN se persiste la transcripción THEN el registro de la sesión del asistente (nº de sugerencias, valoraciones 👍/👎) queda incluido en el archivo de transcripción.

### Control de frecuencia y coste

- GIVEN la conversación fluye WHEN el asistente decide analizar THEN respeta el control de frecuencia: nunca más de una llamada simultánea, un intervalo mínimo entre llamadas y solo si hay material nuevo suficiente desde el último análisis (parámetros en Notas técnicas; verificable a nivel de servicio).
- GIVEN un error de la API en un análisis (clave inválida, límite, conexión) WHEN falla THEN el asistente muestra el estado de error de forma discreta (texto muted en el panel, sin Toast intrusivo durante la llamada), conserva la última sugerencia válida y reintenta en la siguiente ventana.

### Fin de la grabación

- GIVEN la grabación se detiene WHEN termina THEN el asistente se desactiva y el panel desaparece con la sección de grabación en su estado "Grabada".

## UX Design

### Wireframe textual

**Sección Grabación — Estado 2 (Grabando)** (extiende SPEC-015): el **panel del asistente** se inserta entre la fila superior (cronómetro/Detener/Badge transcripción) y los medidores de nivel — es lo que el entrevistador debe ver de un vistazo.

1. **Panel del asistente** (Card con borde acentuado, fondo sutil):
   - Fila 1: Badge de acción ("Profundiza" con clase ámbar / "Continúa" con clase verde, texto + color) + chips de alarma si hay (Badge outline ámbar con el tipo: "Cumplido", "Genérico", "Hipotético") + a la derecha: indicador "Analizando…" (muted, con icono Loader2 girando) cuando hay análisis en curso + botones 👍/👎 (ghost icon, aria-labels del AC; el votado queda con fondo `accent`).
   - Fila 2: **la pregunta sugerida** (texto text-base font-medium — el elemento más visible del panel).
   - Fila 3: el porqué (una línea, text-sm muted).
   - Estado inicial (aún sin sugerencia): "El asistente te sugerirá la siguiente pregunta en cuanto haya conversación." (muted).
   - Estado sin clave: "Asistente inactivo — configura tu clave de Anthropic en Ajustes" con Link a Ajustes.
   - Estado de error: línea muted "No se pudo analizar (se reintentará): {causa}" bajo la última sugerencia.
2. **Panel de objetivos** (solo si la entrevista tiene objetivos; colapsado bajo el panel del asistente como lista compacta): fila por objetivo con icono Circle (pendiente, muted) / CheckCircle2 (cubierto, verde) + texto (el cubierto además en muted con line-through suave). Heading `h4` "Objetivos".

### Componentes shadcn utilizados

Ya instalados todos: `Card`, `Badge`, `Button`, `Tooltip`, `Toast/sonner`. Sin instalaciones nuevas.

### Patrón de interacción

- **Una sola sugerencia visible, sin histórico en pantalla** (RF-ASIS-004; el histórico completo queda en el registro persistido). Decisión central de la spec.
- **Proactividad silenciosa**: nada de Toasts ni sonidos por sugerencia — el panel cambia en sitio; los errores del asistente tampoco interrumpen (texto muted). Durante una llamada real cualquier interrupción es hostil (Riesgo #2).
- **Badges con texto + color** (regla 11.4) para acción y alarmas.
- **👍/👎 como acción de un toque** con resaltado persistente del voto (cambiable hasta la siguiente sugerencia).
- **El panel no empuja la transcripción fuera de pantalla**: transcripción y medidores quedan debajo; el guión sigue más abajo (scroll).

### Comportamiento responsive

- **Desktop (lg+):** completo. **Tablet/Mobile:** no aplican (excepción SPEC-001).

## Notas técnicas

- **assistantService en main** (patrón llmService + transcriptionService): se activa cuando `recording:start` lleva `interviewId` y la transcripción está activa; escucha las líneas finales acumuladas de la sesión de transcripción.
- **Disparo del análisis (control de coste, parámetros como constantes ajustables):** analizar cuando haya ≥ `MIN_NEW_FINAL_LINES = 3` líneas finales nuevas desde el último análisis Y hayan pasado ≥ `MIN_INTERVAL_MS = 20000` desde la última llamada; además un temporizador de respaldo analiza a los `FALLBACK_INTERVAL_MS = 45000` si hay al menos 1 línea nueva. Nunca dos llamadas simultáneas (guard in-flight). Sin material nuevo → sin llamada.
- **Llamada a Claude** (constantes): `claude-opus-4-8`, `thinking: { type: 'adaptive' }`, `output_config: { effort: 'low', format: { type: 'json_schema', schema } }`, `max_tokens: 1024`. Schema: `{ action: 'dig_deeper' | 'continue', suggestedQuestion: string, reason: string, alarms: Array<'compliment' | 'generic' | 'hypothetical'>, objectivesMet: number[] }` (`objectivesMet` = índices de los objetivos ya cubiertos; `additionalProperties: false`). El modelo y el effort son constantes documentadas — ajustables si el humano quiere otro equilibrio latencia/coste.
- **Contexto del prompt** (acotado): system con el rol (copiloto de entrevistas Mom Test/Running Lean, instrucciones de brevedad y de las 3 alarmas); user con: objetivos numerados (si hay), guión (truncado ~6000 chars, si hay), últimas `TRANSCRIPT_WINDOW_CHARS = 4000` de conversación etiquetada por fuente/hablante, y la sugerencia anterior (para no repetirse). El estado de objetivos es acumulativo (un objetivo marcado cubierto no vuelve a pendiente).
- **Eventos al renderer**: `api.assistant.onUpdate(cb)` con `{ state: 'idle' | 'analyzing' | 'active' | 'no-key' | 'error', suggestion?: { action, suggestedQuestion, reason, alarms }, objectivesMet: number[], error?: { kind, message } }`. Feedback: `api.assistant.sendFeedback(vote: 'up' | 'down')` (aplica a la sugerencia vigente).
- **Persistencia del registro**: al detener, el transcript.json gana el campo `assistant: { suggestionCount: number, feedback: { up: number, down: number } } | null` (cambio de forma menor; QA adapta los tests del writer). Sin key o sin sugerencias → `null` o contadores a 0.
- **Reutilización**: la resolución de clave y el mapeo de errores del SDK se comparten con llmService (extraer helper si procede).
- **Regresión presupuestada en tests**: mockApi (bridge `assistant`), tests del writer del transcript (campo nuevo), y posiblemente el montaje de RecordingSection (nuevas suscripciones) — QA adapta.
- **Divergencia de stack:** igual que specs previas. Calidad de las sugerencias y usabilidad en llamada real = juicio humano (Riesgo #2; test de usabilidad del PRD H7).
