# SPEC-024 — Empaquetado macOS e instalador: hardening final del MVP

> Traza: ítem H7 del checklist "Empaquetado/instalador macOS y hardening final" (RF-APP-001,
> NFR §4.6). Base: SPEC-005 ya produce Maurya.app + DMG/ZIP arm64 con firma ad-hoc, `extendInfo`
> con las descripciones TCC de micrófono y audio de sistema, filtrado de `files` y entitlements.
> Esta spec cierra los huecos detectados en la auditoría del empaquetado (2026-07-10) y las
> observaciones menores de hardening acumuladas por QA, y deja el bundle verificado y listo para
> usuarios de validación.

## Descripción

El MVP ya se empaqueta, pero el bundle arrastra huecos de la fase de spikes: los entitlements no
declaran el permiso de micrófono que la firma real exigirá (y sí permisos que no hacen falta), la
versión sigue en 0.1.0, y quedan dos asperezas de UI señaladas por QA. Esta spec deja los
entitlements correctos para el día que haya Developer ID (manteniendo la firma ad-hoc actual),
sube la versión a 1.0.0 (MVP), endurece el formulario del límite de coste contra dobles envíos, y
cierra con un build verificado: DMG e Info.plist comprobados, no solo "compila".

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes,
  páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests
  unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega.
  Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya
  commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador
  entregue será descartado o reemplazado.
- No hay cambios de schema de datos ni de canales IPC.
- El build final (`npm run build:mac`) y la verificación del bundle los ejecuta el orquestador tras
  el QA; el implementador NO ejecuta electron-builder (tarda minutos y no es criterio de su entrega).

## Criterios de aceptación

### Entitlements listos para firma real (manteniendo ad-hoc)

- GIVEN `build/entitlements.mac.plist` WHEN se inspecciona THEN declara `com.apple.security.device.audio-input` (micrófono, exigido por el hardened runtime cuando haya firma real) y conserva `com.apple.security.cs.allow-jit` (Electron lo necesita).
- GIVEN los entitlements heredados de la plantilla del scaffold WHEN se revisan THEN `com.apple.security.cs.allow-unsigned-executable-memory` y `com.apple.security.cs.allow-dyld-environment-variables` se eliminan (no son necesarios para Electron moderno y debilitan el hardened runtime futuro).
- GIVEN `electron-builder.yml` WHEN se inspecciona THEN la firma sigue siendo ad-hoc (`identity: null`, `notarize: false`) con un comentario que documenta el camino a Developer ID/notarización (qué claves cambiar y qué variables de entorno usar) sin activarlo.

### Versión y metadatos del MVP

- GIVEN `package.json` WHEN se inspecciona THEN `version` es `1.0.0` (cierre del MVP; los artefactos pasan a llamarse `Maurya-1.0.0.dmg`/`.zip`).
- GIVEN `electron-builder.yml` WHEN se inspecciona THEN el bloque `mac` declara la categoría de app (`LSApplicationCategoryType: public.app-category.productivity`) vía `extendInfo`, junto a las descripciones TCC existentes que no cambian.

### Hardening de UI pendiente (observaciones de QA)

- GIVEN la card "Coste de IA" de Ajustes WHEN se pulsa "Guardar" con una petición en vuelo THEN el botón queda deshabilitado con spinner inline hasta resolverse (sin dobles envíos), patrón idéntico al resto de forms de la app.
- GIVEN el resto de observaciones menores acumuladas (drift de céntimos por suma de deltas en `estimatedCostUsd`; desglose del Tooltip con caché plegado) WHEN se decide su tratamiento THEN quedan documentadas como aceptadas en esta spec y NO se modifican (el drift es < 1 céntimo mostrado a 2 decimales; separar componentes exigiría cambio de schema sin consumidor).

### Verificación del bundle (la ejecuta el orquestador tras QA)

- GIVEN `npm run build:mac` WHEN termina THEN produce `dist/Maurya-1.0.0.dmg` y `.zip` arm64 sin errores, con typecheck previo en verde.
- GIVEN el `Info.plist` del .app generado WHEN se inspecciona THEN contiene `NSMicrophoneUsageDescription`, `NSAudioCaptureUsageDescription` y `LSApplicationCategoryType` con los valores configurados.
- GIVEN el .app generado WHEN se verifica con `codesign` THEN la firma ad-hoc es válida (`codesign --verify` sin errores) y los entitlements embebidos coinciden con `build/entitlements.mac.plist`.
- GIVEN el .app generado WHEN se lanza THEN abre la ventana con la UI de Capturas (verificación de humo; los prompts TCC atribuidos a "Maurya" y el flujo completo empaquetado quedan como verificación humana final, ya listada en MEMORY).

## UX Design

Sin UI nueva. El único cambio visible es el estado de envío del botón "Guardar" de la card "Coste
de IA" (spinner inline + disabled mientras persiste), patrón ya establecido (regla 5.4 del design
system, calco del resto de forms de la app). Sin data-testid nuevos: el botón ya es localizable por
role+name dentro de `ai-cost-settings-card`.

## Notas técnicas

- **build/entitlements.mac.plist**: con firma ad-hoc los entitlements no se aplican (solo cuentan
  con hardened runtime + firma real), así que este cambio es inocuo hoy y necesario mañana — cero
  riesgo de regresión.
- **electron-builder.yml**: `extendInfo` DEBE seguir siendo un map (nota heredada de SPEC-005: una
  lista deja el Info.plist sin las claves TCC). Añadir `LSApplicationCategoryType` ahí mismo.
- **AiCostCard (`src/renderer/src/components/settings/AiCostCard.tsx`)**: estado `submitting` +
  `disabled` + `Loader2`, calco del patrón de NewCaptureDialog/ApiKeyRow.
- **Riesgo conocido documentado (go/no-go)**: Electron ≥39 exigirá `NSAudioCaptureUsageDescription`
  — ya presente desde SPEC-005; esta spec no toca la versión de Electron (38.8.6 pinneada).
- Dependencias: SPEC-005 (empaquetado base), SPEC-021 (AiCostCard), README (instrucciones de
  apertura sin notarizar y colocación de la key, ya escritas — verificar que siguen exactas tras
  el bump de versión).

## Decisiones asumidas

- **Mantener firma ad-hoc** (alternativa: Developer ID + notarización) → no hay credenciales de
  Apple Developer en el entorno; el camino queda documentado en el yml para activarlo cuando el
  humano las tenga. Distribuir a usuarios de validación con las instrucciones de apertura del README.
- **Versión 1.0.0** (alternativa: 0.9.x hasta pasar validación) → el checklist marca este ítem como
  cierre del MVP; la semántica de "MVP listo para usuarios de validación" es 1.0.0.
- **Drift de céntimos y desglose del Tooltip: aceptados sin cambio** → coste/beneficio negativo
  (cambio de schema o recomputo incompatible con el plegado del caché para corregir fracciones de
  céntimo invisibles a 2 decimales).
- **Sin auto-update ni canal de distribución** (alternativa: electron-updater) → fuera del alcance
  del MVP (PRD §5 exclusiones: app local de un solo usuario).
