# SPEC-024 — Plan de implementación

> Elaborado por el orquestador (2026-07-10) sobre verificación inline previa del empaquetado —
> desviación documentada del flujo habitual (subagente planner): la auditoría que alimentaría al
> planner ya se hizo en la propia sesión (electron-builder.yml, build/entitlements.mac.plist,
> src/main/index.ts, package.json, AiCostCard) y la spec es de alcance mínimo (2 ficheros de
> configuración + 1 estado de componente + verificación de bundle que ejecuta el orquestador).
> Contrato: specs/SPEC-024-empaquetado-hardening-final.md.

Verificado sobre el código real: (a) `electron-builder.yml` ya tiene `extendInfo` como **map** con
las dos descripciones TCC (nota SPEC-005: una lista las pierde) e `identity: null` / `notarize:
false`; (b) `build/entitlements.mac.plist` trae del scaffold `allow-jit` + `allow-unsigned-executable-memory`
+ `allow-dyld-environment-variables` y NO declara `device.audio-input`; (c) `package.json` version
`0.1.0`, Electron `38.8.6` pinneado; (d) `AiCostCard` no deshabilita "Guardar" en vuelo (gap QA
SPEC-021); (e) el resto del empaquetado (files, asarUnpack, dmg, icons) está completo y no se toca.

## 1. Entitlements (build/entitlements.mac.plist)

- Dejar el dict exactamente con: `com.apple.security.cs.allow-jit` (true) y
  `com.apple.security.device.audio-input` (true).
- Eliminar `allow-unsigned-executable-memory` y `allow-dyld-environment-variables`.
- Comentario XML breve: inocuo con ad-hoc, exigido con hardened runtime + firma real.

## 2. electron-builder.yml + versión

- `extendInfo` gana `LSApplicationCategoryType: public.app-category.productivity` (mismo map;
  descripciones TCC intactas).
- Bajo `identity: null` / `notarize: false`, comentario documentando el camino a firma real:
  `identity` con el nombre del certificado Developer ID Application, `notarize: true` +
  `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID` por entorno. NO activarlo.
- `package.json`: `version` `0.1.0` → `1.0.0`. Nada más del package.json.

## 3. AiCostCard: guard de doble submit (src/renderer/src/components/settings/AiCostCard.tsx)

- Estado `submitting`; submit: set true antes del bridge, false al resolver; `<Button type="submit"
  disabled={submitting}>` con `Loader2` inline (calco NewCaptureDialog). Sin cambios de copy ni
  data-testid (el botón se localiza por role+name dentro de `ai-cost-settings-card`).

## 4. Verificación del bundle (orquestador, tras QA)

1. `npm run build:mac` → dist/Maurya-1.0.0.dmg + .zip arm64.
2. `plutil -p dist/mac-arm64/Maurya.app/Contents/Info.plist | grep -E "NSMicrophone|NSAudioCapture|LSApplicationCategory"` → 3 claves.
3. `codesign --verify --deep dist/mac-arm64/Maurya.app && codesign -d --entitlements - dist/mac-arm64/Maurya.app` → firma ad-hoc válida + entitlements = fase 1.
4. `open dist/mac-arm64/Maurya.app` → humo: ventana con Capturas (prompts TCC como "Maurya" quedan a verificación humana).

## AC → fase

Entitlements (2 ACs) → 1 · yml ad-hoc documentado + categoría + versión (3 ACs) → 2 ·
guard doble submit (1 AC) → 3 · observaciones aceptadas sin cambio (1 AC) → spec (sin código) ·
verificación bundle (4 ACs) → 4 (orquestador, MANUAL/instrumentado).

## Breakage presupuestado (QA lo repone; el implementador NO escribe tests)

- Esperado: **cero**. Los tests de AiCostCard (SPEC-021) asertan copys/validación, no el estado
  disabled del botón; si alguno pulsa "Guardar" dos veces rápido, revisarlo. Config de build y
  entitlements no tienen tests unit.

## Riesgos

1. `extendInfo` debe seguir siendo map — regresión conocida de SPEC-005 si se convierte en lista.
2. El bump a 1.0.0 cambia los nombres de artefactos; el README ya usa `${productName}-${version}` —
   verificar que ninguna instrucción cita "0.1.0" literal.
3. Quitar entitlements del scaffold: inocuo con ad-hoc (no se aplican); si algún día fallara el
   arranque firmado, restaurar `allow-unsigned-executable-memory` sería el primer sospechoso.
