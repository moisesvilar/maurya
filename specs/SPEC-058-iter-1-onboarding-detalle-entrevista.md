# SPEC-058-iter-1 — El banner refleja la generación de guión disparada desde la sección Guión

## Descripción

Iteración de corrección de defecto sobre la implementación de SPEC-058.

La desencadena un defecto detectado por el humano en QA manual (2026-07-29): en el detalle de una entrevista con plantilla y sin guión (paso 2 del banner), al pulsar «Generar guión» en la sección Guión (el botón inferior), el botón de la sección pasa a «Generando guión…» deshabilitado pero el botón del banner de onboarding permanece habilitado con «Generar guión». Esto incumple el criterio de SPEC-058 «GIVEN el banner en el paso 2 WHEN se pulsa "Generar guión" THEN se dispara la misma generación que el botón de la sección Guión y ambos botones muestran el estado "Generando guión…" deshabilitado hasta terminar» en su lectura simétrica, y el patrón de interacción de la base («"Generando guión…" […] aparecen a la vez en el banner y en el botón de la sección correspondiente»), que no distingue desde cuál de los dos botones se disparó la generación.

Qué cambia: el mecanismo por el que el banner conoce el estado de generación del guión pasa a ser el mismo puente banner↔sección (`onboardingBridge`) que ya usan los pasos 5 (Nota) y 6 (Objetivos), de modo que el estado ocupado de la sección Guión —venga de su botón manual o de la autogeneración de SPEC-033— se refleje siempre en el banner.

Qué NO cambia: la derivación de pasos, los copys, el wireframe, los `data-testid`, el resto de acciones del banner, la sección Guión en su comportamiento propio (botones, editor, confirmación de regenerar), los canales IPC existentes y la autogeneración de SPEC-033.

## Alcance de implementación

- Esta iteración define **únicamente el código de producción** de una corrección de sincronía de estado de UI entre el banner de onboarding y la sección Guión.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- No hay cambios de schema, ni de persistencia, ni de canales IPC ni de handlers de main: el delta vive íntegro en el renderer.
- Fuera de alcance: emitir eventos `llm:script-generation` desde el camino manual `llm:generate-script` en main (enfoque alternativo descartado, ver Decisiones asumidas); cualquier cambio en `scriptAutoGenerationService.ts`, en el editor del guión o en los pasos 1 y 3–7 del banner.

## Defecto a corregir

### Síntoma

En una entrevista con plantilla asignada, sin guión y con clave de Anthropic configurada, pulsar «Generar guión» en la sección Guión deja el botón de la sección en «Generando guión…» (deshabilitado, spinner) mientras el botón del banner de onboarding (paso 2) sigue mostrando «Generar guión» habilitado durante toda la generación. Captura del humano del 2026-07-29 (detalle «Silvia - DyCare»): banner en «PASO 2 DE 7» con botón activo y, simultáneamente, la sección Guión con «Generando guión…». En sentido inverso el estado sí se comparte: pulsando el botón del banner, ambos muestran «Generando guión…».

### Causa raíz

Existen dos caminos IPC de generación con contratos de estado distintos, y el banner solo observa uno de ellos:

- El botón de la sección Guión usa el invoke `llm:generate-script` (`src/main/ipc.ts:132`), cuyo estado vive **local** en `ScriptSection` (`generating` en `handleGenerate`, `src/renderer/src/components/interviews/ScriptSection.tsx:128-145`); este camino no emite ningún evento.
- El botón del banner usa `llm:auto-generate-script`, cuyo progreso viaja como eventos `llm:script-generation` emitidos por `src/main/scriptAutoGenerationService.ts` a todas las ventanas.
- `InterviewOnboardingBanner` deriva su estado `scriptGenerating` exclusivamente de esos eventos (`src/renderer/src/components/interviews/InterviewOnboardingBanner.tsx:97-107`), de modo que la generación manual de la sección le resulta invisible.

El comentario de la implementación de SPEC-058 («estado por los MISMOS eventos que ScriptSection — ambos botones muestran "Generando guión…"») asumía que los eventos cubrían ambos caminos, pero solo cubren el automático: el defecto es unidireccional (sección→banner roto; banner→sección correcto).

### Cambio requerido

Sustituir el mecanismo de eventos del paso 2 del banner por el espejo de acción del puente `onboardingBridge`, el patrón ya establecido por SPEC-058 para los pasos 5 y 6:

- `src/renderer/src/components/interviews/onboardingBridge.tsx`: añadir el registro `registerScriptAction` a `OnboardingRegistry` y la acción `script` a `OnboardingActions`, con el mismo contrato `OnboardingSectionAction` y la misma mecánica null-safe que `note`/`objectives`.
- `src/renderer/src/components/interviews/ScriptSection.tsx`: registrar en el puente su acción de generar guión — `busy` = generación en curso por cualquiera de los dos caminos (`generating || autoGenerating`), `disabled`/`disabledReason` = sus prerrequisitos actuales (plantilla y clave, mismos literales que hoy), `run` = su generación manual (`handleGenerate`) — con desregistro (registro de `null`) al desmontar, igual que hacen las secciones Nota y Objetivos.
- `src/renderer/src/components/interviews/InterviewOnboardingBanner.tsx`: el paso 2 pasa a construirse con `mirroredButton('Generar guión', 'Generando guión…', actions?.script ?? null)`, y se eliminan del banner la suscripción propia a `llm:script-generation`, el estado `scriptGenerating` y la resolución propia de `keyStatus` (la sección es la única dueña del estado y del motivo de deshabilitado, que ya usa el mismo literal `NO_KEY_SCRIPT_REASON`).

Resultado: ambos botones muestran «Generando guión…» deshabilitados a la vez, se dispare la generación desde el banner, desde la sección o por la autogeneración de SPEC-033 (que la sección ya refleja vía `autoGenerating` y ahora se espeja al banner), y ambos vuelven a su estado normal al terminar. Los criterios de la base sobre el paso 2 (disparo, estado compartido y Tooltip sin clave) siguen vigentes tal cual; esta iteración no deroga ningún criterio — corrige la implementación para cumplirlos.

## UX Design — ajuste puntual

Sin cambios visuales: wireframe, copys, iconos, variantes de botón y `data-testid` de SPEC-058 se mantienen íntegros. El literal del estado ocupado sigue siendo «Generando guión…» con spinner inline y botón deshabilitado (§5.4) en ambos botones, y el Tooltip del botón deshabilitado del banner sigue mostrando el mismo motivo que la sección Guión.

## Notas técnicas

- Ficheros afectados (solo renderer): `src/renderer/src/components/interviews/onboardingBridge.tsx`, `src/renderer/src/components/interviews/ScriptSection.tsx`, `src/renderer/src/components/interviews/InterviewOnboardingBanner.tsx`.
- Antes/después: antes, el banner escuchaba `llm:script-generation` (solo camino automático) y disparaba `window.api.llm.autoGenerateScript`; después, espeja la acción registrada por `ScriptSection` (estado y disparo), que ya integra ambos caminos de generación.
- Sin impacto en datos: cero cambios de schema, de repositorio, de canales IPC, de preload o de main. `package.json` intacto.
- Retrocompatibilidad explícita: el camino de autogeneración de SPEC-033 no se toca — `ScriptSection` sigue suscrita a `llm:script-generation` y su `autoGenerating` alimenta el `busy` espejado, así el banner sigue reflejando la generación disparada al crear una captura. La sección Guión conserva idénticos sus botones, toasts, confirmación de regenerar y remontaje del editor.
- Matiz de paridad asumido por el espejo: mientras `ScriptSection` resuelve el estado de la clave (instante inicial), su botón está deshabilitado con el Tooltip del motivo de clave, y el banner ahora refleja exactamente eso (antes trataba ese instante como habilitado); es el comportamiento de la sección, que el criterio de Tooltip de la base declara como fuente («el mismo motivo que muestra la sección Guión»).
- Dependencias: SPEC-058 (base, puente y banner), SPEC-033 (autogeneración por eventos, intacta), SPEC-014 (generación manual de la sección Guión, intacta).
- Verificación manual sugerida: (1) entrevista con plantilla, sin guión y con clave → pulsar «Generar guión» en la sección Guión → ambos botones pasan a «Generando guión…» deshabilitados y ambos vuelven al terminar (el banner avanza a paso 3); (2) repetir disparando desde el botón del banner → mismo resultado; (3) crear una captura con plantilla y clave (autogeneración SPEC-033) → ambos botones muestran «Generando guión…»; (4) sin clave de Anthropic → el botón del banner en paso 2 está deshabilitado con el mismo Tooltip que la sección.

## Decisiones asumidas

- Enfoque del fix: espejo por `onboardingBridge` (patrón existente de los pasos 5/6) en lugar de emitir eventos `llm:script-generation` también desde el camino manual en main. Alternativa descartada porque tocaría main y obligaría a `ScriptSection` a deduplicar toasts de error y a proteger el remontaje del editor frente a eventos `done` del camino manual; el espejo deja una única fuente de estado (la sección) y cero cambios de contrato IPC.
- El botón del banner en paso 2 pasa a ejecutar la generación manual de la sección (`run` espejado) en lugar del invoke silencioso `llm:auto-generate-script`. Consecuencia visible: al terminar con éxito una generación disparada desde el banner aparece el Toast «Guión generado» de la sección (antes, disparada desde el banner, terminaba sin Toast). Se asume porque cumple literalmente el criterio de la base («se dispara la misma generación que el botón de la sección Guión») y el §6.1 del design system (Toast tras acción mutadora exitosa); alternativa (mantener el invoke automático y solo espejar el estado) descartada por dejar dos caminos de disparo con feedback distinto para el mismo botón.
