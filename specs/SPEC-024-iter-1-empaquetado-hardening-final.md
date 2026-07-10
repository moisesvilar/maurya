# SPEC-024-iter-1 — Sello ad-hoc real del bundle con entitlements embebidos (hook afterPack)

## Descripción

Iteración de corrección de defecto sobre la implementación de SPEC-024.

La desencadena la verificación del bundle de la fase 4 (orquestador, 2026-07-10): con
`identity: null`, electron-builder **omite la firma por completo** y el .app queda solo con la
firma del linker del binario de Electron (`flags=adhoc,linker-signed`, `Identifier=Electron`,
`Info.plist=not bound`, `Sealed Resources=none`). Consecuencias: `codesign --verify` falla ("code
has no resources but signature indicates they must be present"), los entitlements preparados en
SPEC-024 **no se embeben**, y el sello del bundle que el AC de verificación exige no existe. La
app arranca en local igualmente (por eso pasó en SPEC-005), pero la "firma ad-hoc" era nominal.

Cambia una sola cosa: el empaquetado gana un hook `afterPack` que sella el .app con firma ad-hoc
real (`codesign --force --deep --sign -`) aplicando `build/entitlements.mac.plist`, ANTES de que
electron-builder genere el DMG/ZIP. No cambia nada más: ni la decisión de no usar Developer ID
(documentada en SPEC-024), ni el Info.plist, ni el código de la app.

## Alcance de implementación

- Esta iteración define **únicamente** un hook de empaquetado: script nuevo en `build/` y su
  registro en `electron-builder.yml`.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests
  unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega.
  Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya
  commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador
  entregue será descartado o reemplazado.
- No hay cambios de schema, IPC, código de app ni `package.json` (dependencias cero: el hook usa
  `codesign` del sistema vía `child_process`).
- **Fuera de alcance:** firma con Developer ID y notarización (siguen documentadas como camino
  futuro en el yml, sin activar).

## Defecto a corregir

### Síntoma

`codesign --verify --deep dist/mac-arm64/Maurya.app` → "code has no resources but signature
indicates they must be present". `codesign -dv` muestra `linker-signed`, `Identifier=Electron`,
`Sealed Resources=none`. `codesign -d --entitlements` no muestra los entitlements de
`build/entitlements.mac.plist`. Incumple los ACs de verificación del bundle de SPEC-024.

### Causa raíz

`electron-builder.yml → mac.identity: null` desactiva TODO el paso de firma de electron-builder
(no hace fallback a ad-hoc). El binario conserva únicamente la firma de linker con la que Electron
se distribuye, que no sella recursos ni Info.plist ni admite entitlements.

### Cambio requerido

Hook `afterPack` de electron-builder (`build/afterPack.js` o `.cjs`, CommonJS — electron-builder lo
carga con require) registrado en `electron-builder.yml` (`afterPack: build/afterPack.js`):

- Solo actúa en macOS (`context.electronPlatformName === 'darwin'`).
- Ejecuta `codesign --force --deep --sign - --entitlements build/entitlements.mac.plist <appOutDir>/Maurya.app`
  (rutas desde `context`), y verifica ahí mismo con `codesign --verify --deep --strict`; si
  cualquiera de los dos pasos falla, **lanza** (el build debe fallar en rojo, no empaquetar un
  bundle sin sellar).
- Log de una línea al terminar ("firma ad-hoc aplicada con entitlements") para trazabilidad del build.

Comportamiento esperado tras el fix, verificable en el bundle: `codesign --verify --deep --strict`
sin errores; `codesign -dv` con `Signature=adhoc` y recursos sellados (`Info.plist=bound`);
`codesign -d --entitlements` mostrando `com.apple.security.cs.allow-jit` y
`com.apple.security.device.audio-input`; DMG/ZIP conteniendo el .app ya sellado (afterPack corre
antes del empaquetado de artefactos).

## Notas técnicas

- `--deep` con entitlements aplica los mismos entitlements a los helpers anidados; para firma
  ad-hoc local es el compromiso estándar (la alternativa —firmar helper a helper de dentro hacia
  fuera— es la práctica de la firma de distribución con Developer ID y queda para ese camino).
- Retrocompatibilidad: gatekeeper sigue tratando la app como no notarizada (clic derecho → Abrir,
  instrucciones del README intactas); el sello ad-hoc no cambia el onboarding, solo hace íntegro el
  bundle y embebe los entitlements.
- El hook corre también en `npm run build:mac` local del humano sin requisitos nuevos (`codesign`
  viene con macOS; no hace falta Xcode completo).
- Dependencias: SPEC-024 (base), SPEC-005 (empaquetado original).
- Verificación manual sugerida tras el build: los tres comandos de "Comportamiento esperado" +
  abrir el .app y comprobar que la ventana carga Capturas.
