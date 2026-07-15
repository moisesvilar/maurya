# Plan de implementación — SPEC-040 Preguntas ceñidas al guión y a su orden

> Plan autorado por el orquestador (un solo fichero, precedente SPEC-037/038).
> Spec: `specs/SPEC-040-preguntas-cenidas-guion.md`. Sin UI, sin IPC, sin deps nuevas.

## Fichero afectado

`src/main/assistantService.ts`.

## Cambios

1. **`OUTPUT_SCHEMA`**: `scriptCursor: { type: 'string', maxLength: SCRIPT_CURSOR_MAX_CHARS }`
   añadido a properties y a `required`. Nueva constante documentada
   `export const SCRIPT_CURSOR_MAX_CHARS = 120`.
2. **`AssistantSession`**: campo `scriptCursor: string | null` (nace null en startAssistant).
3. **`parseAnalysis`**: devuelve además `scriptCursor: string | null` — string con trim no vacío
   → ese valor; cualquier otro caso (ausente, no-string, vacío) → null. Nunca lanza por esto.
4. **`runAnalysis`** (camino de éxito): `if (outcome.scriptCursor !== null) target.scriptCursor = outcome.scriptCursor`
   (el vacío/None conserva el previo).
5. **`buildSystemPrompt`** — tres reglas nuevas de texto estático (después de la regla de
   `suggestedQuestion`, antes de las de la cola):
   - Con `action` 'continue', la `suggestedQuestion` debe ser la SIGUIENTE pregunta del guión aún
     no cubierta, respetando el orden del guión.
   - Desviarse del guión solo con justificación Mom Test (falta de evidencia concreta o señal de
     alarma); tras profundizar, volver al punto del guión donde se quedó.
   - `scriptCursor`: el bloque o pregunta del guión que se está tratando ahora mismo
     (máximo SCRIPT_CURSOR_MAX_CHARS caracteres; string vacío si no hay guión o no se sabe).
6. **`buildUserPrompt`**: sección condicional `## Punto actual del guión\n<cursor>` cuando
   `target.scriptCursor !== null`, colocada entre «## Objetivos ya cubiertos» y
   «## Conversación reciente».

## Invariantes a preservar

- systemBlocks byte-estables (el cursor solo en el mensaje de usuario).
- MAX_TOKENS/topes existentes intactos; parseo defensivo nunca rompe un análisis válido.
- Aceptación/supresión de candidatas y resolución de cola sin cambios.
- Typecheck + lint verdes.
