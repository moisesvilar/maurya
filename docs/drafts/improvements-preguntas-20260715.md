# Mejoras del asistente de preguntas en vivo (2026-07-15)

Peticiones directas del humano tras usar la app en una entrevista real. Rama de trabajo:
`moisesvilar/improvements-preguntas`. Afectan al asistente en vivo (SPEC-016/023/036),
a la generación de guión/objetivos (SPEC-014/025/028) y al layout del detalle de
entrevista (SPEC-025/029/030).

## 1. Robustecer la supresión de preguntas casi idénticas

En la entrevista real, muchas preguntas generadas eran MUY parecidas entre sí,
prácticamente la misma pregunta. La doble barrera de SPEC-036 (instrucción en el
prompt + `normalizeQuestion` determinista, que solo iguala tras normalizar
minúsculas/puntuación/espacios) no basta: dos formulaciones distintas de la misma
pregunta pasan el filtro.

**Pedido:** robustecer la detección de candidatas casi idénticas a alguna de las que
ya se muestran al usuario (pendientes y ancladas) y, en ese caso, **no mostrarlas**.
La similitud debe ser semántica/aproximada, no solo igualdad tras normalización.

## 2. Robustecer la detección en vivo de preguntas ya respondidas

En la entrevista real, el entrevistado contestaba de manera explícita una pregunta en
cola y esta seguía mostrándose como pendiente hasta muchos minutos después.

**Pedido:** robustecer el análisis de la conversación en tiempo real para detectar qué
preguntas de la cola están siendo respondidas (mecanismo `resolvedQueueIndexes` de
SPEC-036) y retirarlas mucho antes.

## 3. Acciones por pregunta: ANCLAR / DESANCLAR / DESCARTAR / RESPONDIDA

Darle una vuelta al anclado actual (chincheta de SPEC-036). El humano prefiere
botones explícitos por pregunta:

- **ANCLAR**: la pregunta nunca será sustituida por otra generada a continuación
  (ni resuelta automáticamente).
- **DESANCLAR**: solo visible si la pregunta está anclada; vuelve a ser sustituible /
  auto-resoluble.
- **DESCARTAR**: el entrevistador descarta la pregunta (sale de la cola). **Al
  finalizar la entrevista se le preguntará por qué la descartó**, para dejar
  constancia en las notas y en los objetivos.
- **RESPONDIDA**: el entrevistador indica que el entrevistado ya respondió esa
  pregunta. Sale de la cola y **dispara en background un análisis de la
  transcripción para actualizar los objetivos en tiempo real**; lo respondido queda
  disponible para las notas al finalizar la entrevista.

## 4. Generación de preguntas ceñida al guión y a su orden

Las preguntas generadas deberían ceñirse más al guión generado (SPEC-014) y seguir
el orden que el guión establece (bloques/preguntas del template personalizado).

**Pedido:** el asistente debe apoyarse en la estructura del guión — qué parte se está
cubriendo ahora y qué viene después — y sugerir preferentemente la siguiente pregunta
del guión aún no cubierta, en su orden, usando la desviación solo cuando el Mom Test
lo justifique (falta de evidencia concreta, señal de alarma).

## 5. Sugerencias de preguntas arriba al grabar

Al empezar a grabar, la sección de sugerencias de preguntas en tiempo real (el panel
del asistente, hoy dentro de la sección Grabación al final de la página) debe pasar
arriba: **entre la sección de Objetivos y el Guión**.

## 6. Fusionar las dos secciones «Objetivos»

Al iniciar la grabación hoy coexisten dos secciones «Objetivos»: la de estado
(`ObjectivesSection`, arriba, solo lectura + evaluación/overrides) y la de edición
dentro del Guión (`ScriptSection`, inputs + eliminar + añadir). Deben fusionarse en
**una sola**, porque al final cada objetivo son tres cosas:

- **Icono** que muestra en tiempo real si el objetivo ha sido cumplido (verde) o no
  (color estándar) durante la entrevista.
- **Descripción corta** del objetivo, **editable en tiempo real**.
- **Botón para eliminar** el objetivo.

Se conserva la posibilidad de añadir objetivos (hoy en ScriptSection) dentro de la
sección fusionada, y se mantienen la evaluación post-grabación y las marcas manuales
con comentario (SPEC-025/028) sobre la misma lista.
