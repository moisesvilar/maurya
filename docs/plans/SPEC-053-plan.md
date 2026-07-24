# SPEC-053 — Plan de implementación · Soporte multilenguaje independiente por función

> Plan pre-autorizado a petición humana directa (2026-07-24) junto con la spec [`specs/SPEC-053-soporte-multilenguaje.md`](../../specs/SPEC-053-soporte-multilenguaje.md). **No está en ejecución**: queda versionado para cuando el humano lo priorice en base al feedback de más usuarios. El PRD excluía el multilenguaje del MVP (exclusión 6, «Por evaluar»); la spec materializa esa evaluación pendiente. Al priorizarse, este plan puede ejecutarse por fases (cada fase es entregable de forma independiente) o trocearse en specs derivadas si el pipeline lo requiere.

## Contexto y estado final

Hoy el español está hardcodeado en cinco superficies: los strings inline del renderer (~100 componentes, sin i18n), la línea «Escribe TODO en español» de los prompts de guión/asistente/notas (`prompts/defaults.ts` y cada servicio), `language=es` en la URL del WebSocket de Deepgram (`deepgramService.ts:9`), las stopwords españolas de la similitud de preguntas (SPEC-037, `assistantService.ts`) y los locales de fecha `es-ES`. Estado final: un bloque `languageSettings` en `db.json` con cinco ajustes independientes (`ui`, `script`, `transcription`, `assistant`, `notes`), valores `'es' | 'en'`, defaults `'es'` (retrocompatible), configurables desde una pestaña nueva «Idioma» en Ajustes, y cada superficie parametrizada por su ajuste.

## La spec

Todo el comportamiento (ACs, wireframe, data-testid, decisiones asumidas) está en [`specs/SPEC-053-soporte-multilenguaje.md`](../../specs/SPEC-053-soporte-multilenguaje.md). Este plan solo ordena la ejecución y localiza los cambios en el código.

## Decisiones cerradas

1. **Idiomas v1: es + en.** El tipo `AppLanguage` es una unión ampliable; añadir un idioma nuevo exige repetir la validación manual de Deepgram y completar el catálogo de UI, nunca solo ampliar el enum.
2. **Ajustes globales, sin override por entrevista.** El override por entrevista (natural para el trío transcripción/asistente/guión) queda como evolución si el feedback lo pide; la resolución de idioma se centraliza en un helper de main para que añadirlo después sea un cambio local.
3. **Orden de fases: infraestructura → transcripción → generación → asistente → interfaz.** Las fases 2-4 son cambios acotados al main process con riesgo bajo; la fase 5 (i18n de UI) es ~80 % del esfuerzo total y va la última — puede incluso posponerse indefinidamente sin invalidar las anteriores.
4. **La línea de idioma de los prompts pasa a ser dinámica** y las `lockedRules` de la pestaña «Prompts personalizados» la muestran con la convención de corchetes existente («[Según el idioma configurado] …»). Los prompts personalizados ya persistidos por el usuario no se migran.

## Fase 1 — Infraestructura de ajustes

Sin efecto funcional sobre generación ni transcripción: solo el bloque de settings y su pestaña.

- `src/renderer/src/types/domain.ts` — tipos `AppLanguage` y `LanguageSettings`, `DEFAULT_LANGUAGE_SETTINGS` (todo `'es'`), validador de valores desconocidos (patrón del validador de `AiModelId`).
- `src/main/db/store.ts` + `src/main/db/repository.ts` + `src/main/db/ipc.ts` — campo `languageSettings` opcional en el store, getter/setter con envelope `DbResult` y resolución con defaults ante bloque ausente o valores inválidos (patrón exacto de `assistantSettings`).
- `src/preload/index.ts` — métodos `getLanguageSettings`/`setLanguageSettings` en el bridge `db`.
- `src/renderer/src/hooks/` — hook `useLanguageSettings` (patrón de los hooks de settings existentes).
- `src/renderer/src/pages/SettingsPage.tsx` + componente nuevo `src/renderer/src/components/settings/LanguageTab.tsx` — quinta pestaña «Idioma» con los cinco selects, estados loading/error, Toast por cambio, revert en fallo y Alert de divergencia transcripción ≠ asistente (wireframe y data-testid en la spec).
- `src/main/` — helper de resolución de idioma (p. ej. en un módulo `language.ts`) que los servicios de las fases siguientes consultan en cada uso, como ya se hace con la resolución de claves.

## Fase 2 — Transcripción (Deepgram)

- `src/main/deepgramService.ts` — `buildDeepgramUrl(diarize, language)`: el literal `language=es` de la URL base se parametriza; con `'es'` la URL debe quedar byte a byte idéntica a la histórica (AC de regresión). El fallback sin diarización de SPEC-022 conserva el idioma.
- `src/main/transcriptionService.ts` — lee el ajuste al iniciar sesión de transcripción y lo propaga a la conexión; un cambio de ajuste con grabación en curso no afecta a la sesión abierta.
- **Validación manual previa al cierre de la fase**: grabación real con `language=en` verificando calidad con `multichannel + diarize + interim_results`. Si Deepgram degrada la combinación en inglés, escalar antes de continuar (riesgo externo, no de código).

## Fase 3 — Generación: guión y notas

- `src/main/prompts/defaults.ts` — la línea de idioma de `SCRIPT_LOCKED_RULES` y `NOTE_LOCKED_RULES` se vuelve dinámica (función del idioma); las `lockedRules` de solo lectura muestran la convención de corchetes.
- `src/main/llmService.ts` (guión + objetivos) y `src/main/scriptAutoGenerationService.ts` — regla de idioma según el ajuste `script`; instrucción explícita de traducir la plantilla de preguntas cuando su idioma difiera del de salida.
- `src/main/objectiveOverrideService.ts` — regeneración de objetivos en el idioma del guión.
- `src/main/contextService.ts` — el informe de LinkedIn («en español» en dos puntos) sigue el idioma del guión.
- `src/main/noteService.ts` — regla de idioma según el ajuste `notes`; instrucciones de la spec: títulos de sección traducidos, citas textuales conservadas en el idioma original de la conversación.

## Fase 4 — Asistente en vivo

- `src/main/prompts/defaults.ts` — `ASSISTANT_LOCKED_RULES` con línea de idioma dinámica y ejemplos de alarmas (`compliment`/`generic`/`hypothetical`) por idioma (los españoles actuales + equivalentes ingleses).
- `src/main/assistantService.ts` — prompt interactivo según el ajuste `assistant`; `QUESTION_STOPWORDS` pasa a un set por idioma (crear el set inglés) y se revisa que la reducción singular/plural ingenua de SPEC-037 siga siendo aceptable en inglés.
- `src/main/objectiveEvaluationService.ts` — llamada de mantenimiento en el idioma del asistente.
- Caso cruzado (transcripción es + asistente en): sin código específico — el prompt ya recibe la ventana transcrita y la regla de idioma de salida; verificar en QA que no se degrada.

## Fase 5 — Interfaz (i18n del renderer)

La más cara con diferencia (~100 `.tsx` con strings inline); entregable por separado y posponible sin bloquear las fases 1-4.

- Infraestructura i18n en el renderer (librería a decidir en el momento — `react-i18next` como candidato por defecto —, provider en `App.tsx`, catálogos `es`/`en`; el catálogo español se extrae de los strings actuales y es la fuente del fallback).
- Extracción masiva de strings de `pages/`, `components/` y hooks con mensajes de error visibles; el barrido de cierre tipo SPEC-052 (`grep` de literales españoles fuera del catálogo) es la verificación determinista de que no quedan strings huérfanos.
- Locales de fecha: parametrizar `'es-ES'` en `NewCaptureDialog.tsx`, `LatencyRow.tsx`, `DiscoveriesPage.tsx` y cualquier otro que aparezca en el barrido.
- Cambio de idioma en caliente sin reinicio (patrón del cambio de tema).

## Riesgos y validaciones

- **Deepgram en inglés** (fase 2): riesgo externo; validación manual obligatoria antes de cerrar la fase. El peor caso ya está cubierto por la degradación sin diarización.
- **Calidad de generación cruzada** (fases 3-4): plantilla española → salida inglesa y transcripción española → nota inglesa funcionan con Claude, pero merecen una pasada de evaluación manual la primera vez.
- **Similitud de preguntas en inglés** (fase 4): sin el set de stopwords inglés la deduplicación de SPEC-037 se degrada y el asistente repite preguntas — es parte de la fase, no un opcional.
- **Contexto acumulado multi-idioma**: si se cambia el idioma del guión a mitad de un discovery, los prompts pueden mezclar idiomas (entrevistas previas en español + generación en inglés). No es un error; el Alert de divergencia y la documentación de la pestaña lo cubren.
- **Tests existentes**: los tests que asertan literales españoles de prompts y stopwords necesitarán actualizarse al parametrizar (lo gestiona el pipeline de QA en su paso normal).

## Esfuerzo relativo

| Fase | Alcance | Esfuerzo |
| --- | --- | --- |
| 1 · Infraestructura | store + IPC + pestaña Ajustes | Bajo |
| 2 · Transcripción | 2 ficheros de main + validación manual | Bajo |
| 3 · Generación | 5 ficheros de main (prompts) | Bajo-medio |
| 4 · Asistente | 3 ficheros de main + stopwords/ejemplos en | Medio |
| 5 · Interfaz | i18n + extracción en ~100 componentes | Alto (~80 % del total) |
