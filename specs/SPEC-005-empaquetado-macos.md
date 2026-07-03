# SPEC-005 — Empaquetado macOS e identidad de la aplicación

> Requisito origen: RF-APP-001 (Must) · Hito H1 ítem 1 · Checklist: "Scaffolding Electron + React + TypeScript empaquetable en macOS"
> Relacionados: NFR §4.2 (macOS), go/no-go H0 (limitaciones 1 y 5: atribución TCC "Electron" en dev y requisito `NSAudioCaptureUsageDescription` para Electron ≥39/producto final), Riesgo #4
> Naturaleza: primera spec de producto (no spike). El scaffolding de desarrollo ya existe (SPEC-001); esta spec lo convierte en una app instalable con identidad propia.

## Descripción

Convierte el proyecto en una aplicación macOS empaquetable e instalable llamada **Maurya**: identidad propia (nombre, bundle id, icono), construcción de un `.app`/DMG con electron-builder, y el `Info.plist` con las descripciones de uso de micrófono y captura de audio del sistema, de modo que los permisos TCC se atribuyan a "Maurya" (no a "Electron") y el empaquetado quede preparado para futuras versiones de Electron que exigen `NSAudioCaptureUsageDescription`. El harness de captura existente sigue funcionando idéntico dentro de la app empaquetada.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya pusheado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura. **Sin Supabase.**
- **Matiz:** firma con Developer ID y notarización quedan FUERA (requieren cuenta de Apple del humano); el empaquetado será ad-hoc signed. La distribución pública es H7.

## Criterios de aceptación

### Identidad de la aplicación

- GIVEN el proyecto configurado WHEN se ejecuta la app (dev o empaquetada) THEN el nombre visible de la aplicación (menú de macOS, dock, título) es "Maurya".
- GIVEN la app empaquetada WHEN se inspecciona el bundle THEN el `CFBundleIdentifier` es un appId propio estable (formato `com.<org>.maurya`) y la versión coincide con la de `package.json`.

### Empaquetado

- GIVEN el proyecto en un working tree limpio WHEN se ejecuta el script de empaquetado (`npm run build:mac`) THEN se genera un `Maurya.app` (y artefacto DMG o ZIP) para macOS arm64 sin errores.
- GIVEN el `Maurya.app` generado WHEN se abre con doble clic THEN la app arranca y muestra el harness de captura funcionando igual que en dev.
- GIVEN la app empaquetada WHEN se inspecciona su `Info.plist` THEN contiene `NSMicrophoneUsageDescription` y `NSAudioCaptureUsageDescription` con textos en español que explican el uso (entrevistas: transcripción de micrófono y audio del sistema).

### Permisos con identidad propia

- GIVEN la app empaquetada abierta por primera vez WHEN se pulsa "Iniciar captura" THEN el prompt de micrófono de macOS se atribuye a "Maurya" (no a "Electron").
- GIVEN los paneles de Privacidad de Ajustes del Sistema WHEN la app empaquetada ha solicitado permisos THEN "Maurya" aparece como entrada propia en Micrófono y en Grabación de pantalla y audio del sistema.

### No regresión

- GIVEN el flujo de desarrollo WHEN se ejecuta `./start.sh` THEN todo sigue funcionando como hasta ahora (dev no se rompe por la configuración de empaquetado).
- GIVEN la app empaquetada WHEN se realiza una captura con transcripción THEN el WAV y el transcript.json se persisten en el directorio de datos de la app empaquetada (userData de "Maurya").

## UX Design

Sin UI nueva. Cambios visibles: nombre "Maurya" en menú/dock/título de ventana e icono de la app (si no hay diseño de marca aún, icono placeholder generado con la inicial "M" — decisión no cubierta por el design system: el branding real llega con el design system del producto en H1/H7).

## Notas técnicas

- **Herramienta:** electron-builder (estándar con electron-vite; la plantilla ya trae `build/` y `electron-builder.yml` de scaffold — revisarlos y ajustarlos, no partir de cero).
- **Config mínima:** `appId: com.maurya.app` (o equivalente estable), `productName: Maurya`, target `dmg`+`zip` para `arm64`, `extendInfo` con `NSMicrophoneUsageDescription` y `NSAudioCaptureUsageDescription` (textos es-ES). Icono: `build/icon.icns` (placeholder aceptable).
- **Firma:** ad-hoc (`identity: null` o equivalente) — sin Developer ID ni notarización en esta spec. Documentar en README cómo abrir una app sin notarizar (clic derecho → Abrir).
- **Flags de Chromium:** verificar que los `appendSwitch` del main siguen aplicándose en la app empaquetada (van en código, no en config de dev — deberían).
- **Los permisos TCC de dev ya concedidos a "Electron" no se transfieren** a "Maurya": la primera ejecución empaquetada volverá a pedirlos (esperado; documentarlo).
- **Script:** `build:mac` = `electron-vite build && electron-builder --mac`. No romper `dev`, `typecheck`, `lint`, `test`.
- **Divergencia de stack:** igual que specs previas (Electron local; e2e no aplica). La verificación del `.app` (doble clic, prompts con "Maurya") es manual del humano; QA automatiza lo automatizable (config presente y coherente).
