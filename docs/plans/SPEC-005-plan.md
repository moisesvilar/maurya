# Plan de implementación — SPEC-005: empaquetado macOS e identidad "Maurya"

> Generado por subagente Plan y aprobado por el orquestador (2026-07-03). Contrato: specs/SPEC-005-empaquetado-macos.md. Host: macOS 26.5.1 arm64; electron-builder 26.15.3 ya en devDeps.

## 1. Inventario
Ya existe (scaffold electron-vite): electron-builder.yml genérico (appId com.electron.app, extendInfo como LISTA — hay que pasarlo a map), build/ con entitlements.mac.plist e iconos default tracked, script `build:mac`, postinstall, dist/ ignorado, flags de loopback en código (aplican empaquetado).
Falta: identidad (appId/productName/extendInfo/targets), icono "M", títulos, **gap de env.ts** (en app empaquetada no encuentra .env.local → añadir candidato `join(app.getPath('userData'), '.env.local')` primero), README (abrir sin notarizar, re-prompt TCC, dónde va la key).

## 2. electron-builder.yml
appId `com.maurya.app` · productName `Maurya` · mac target dmg+zip arm64 · `identity: null` (ad-hoc) · notarize false · entitlementsInherit build/entitlements.mac.plist · **extendInfo como map** con NSMicrophoneUsageDescription y NSAudioCaptureUsageDescription (es-ES) · files: mantener exclusiones + `!{tests,docs,specs}/**` y sueltos · eliminar win/nsis/linux/appImage/publish · dmg artifactName `${productName}-${version}.${ext}` · npmRebuild false.

## 3. Icono placeholder "M"
`scripts/generate-icon.sh`: PNG 1024 vía JXA (osascript Cocoa, sin deps), fondo redondeado oscuro + "M" blanca; `sips` a 16-512 (+@2x, DPI 72) + `iconutil -c icns` → sobrescribe `build/icon.icns` (tracked).

## 4. package.json y main
package.json: `productName: "Maurya"`, description/author actualizados; scripts intactos. `src/main/index.ts`: `title: 'Maurya'`, `setAppUserModelId('com.maurya.app')`. `src/renderer/index.html`: `<title>Maurya</title>` (pisa al de BrowserWindow). `src/main/env.ts`: candidato userData primero. Nota: con productName, userData pasa a `~/Library/Application Support/Maurya` también en dev (grabaciones previas quedan en ruta vieja — documentar). README: sección app empaquetada.

## 5. AC→verificación
Automatizable: config yml (map extendInfo, appId, targets), títulos, dev intacto (typecheck/lint/test/start.sh). Semi: build:mac real + artefactos + `codesign -dv` = adhoc + `plutil -p` del Info.plist. Humano: doble clic, prompts TCC atribuidos a "Maurya", entradas en paneles de Privacidad, transcript en userData de Maurya (key copiada ahí). En dev, menú/dock seguirán diciendo "Electron" (limitación conocida): solo el título es Maurya.

## 6. Orden, validación, riesgos
Orden: icono → yml → package.json → env.ts → títulos → README → build real. Validación: typecheck && lint && test (si algún test asserta el título viejo "Spike captura…", romperá → a QA) → start.sh humo → `npm run build:mac` (1ª vez descarga Electron dist ~100 MB, 2-6 min) → codesign -dv + plutil -p.
Riesgos: ad-hoc arm64 (fallback `codesign --force --deep -s -`), red en descarga de binarios, extendInfo lista→map (si no, TCC silenciosamente roto), NSAudioCapture aún no exigida en E38 (preparación E39+), env.ts es el único cambio de código real — mantener mínimo.
