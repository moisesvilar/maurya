# Plan de implementación — SPEC-007: settings de claves IA con guardado seguro

> Generado por subagente Plan y aprobado por el orquestador (2026-07-04). Contrato: specs/SPEC-007-settings-api-keys.md.

## 0. Deps
`react-router-dom@7` (autorizada) · shadcn CLI: `input`, `skeleton` (faltan; el resto existe).

## 1. secretsService (main)
Nuevos: `types/secrets.ts` (SecretKind, KeyStatus, SecretsStatus, SecretsError{validation|encryption-unavailable|storage}, SecretsResult, SecretsApi — envelope tipo DbResult), `src/main/atomicFile.ts` (extraer writeFileAtomicSync del persist de db/store.ts, que pasa a consumirlo — cubierto por tests de persistencia), `src/main/secretsService.ts`: `userData/maurya-data/secrets.json` `{schemaVersion:1, keys:{deepgram?:{blob(base64),last4}, anthropic?}}`; `initSecrets(baseDir?)` inyectable, corrupción → `.corrupt-<ts>` sin crash; `getSecretsStatus()` (available = isEncryptionAvailable() por llamada, post-ready; last4 sin descifrar); `saveSecret` (trim, validation si vacío, encryption-unavailable si no disponible — NUNCA guardar en claro; sobrescribe directo); `removeSecret`; `getDecryptedSecret(kind)` SOLO main (fallo de descifrado → null, degrada a env).
IPC: 3 canales `secrets:{get-status,save,remove}` con wrapper try/catch → SecretsResult + `initSecrets()` en registerIpcHandlers.

## 2. transcriptionService — cambio mínimo
`getApiKey()`: 1º getDecryptedSecret('deepgram') → 2º process.env.DEEPGRAM_API_KEY → 3º null (flujo no-key SPEC-002). Se re-resuelve por captura (efecto inmediato sin reiniciar). env.ts intacto.

## 3. Bridge
`api.secrets: SecretsApi` (3 invoke); `window.api: MauryaApi & {db: DbApi; secrets: SecretsApi}`. La clave solo viaja renderer→main en save; jamás vuelve.

## 4. Router sin romper tests
App.tsx: TooltipProvider > HashRouter (file:// en empaquetado) > Routes {/ → HarnessRoute, /settings → SettingsPage} + Toaster global. **SpikeAudioCapturePage NO usa useNavigate**: prop opcional `onOpenSettings?`; `HarnessRoute` (en App.tsx) hace navigate('/settings'). Botón engranaje ghost icon aria-label "Ajustes" en la cabecera del harness. Los tests existentes renderizan la página sin Router → siguen pasando.

## 5. SettingsPage
Nuevos: pages/SettingsPage.tsx (Layout 3, max-w-640: Volver ghost ArrowLeft → navigate('/'), h1 Ajustes, h3 Claves de IA + muted, Alert destructive si !available, 2×ApiKeyRow), components/settings/ApiKeyRow.tsx (label+Badge Configurada/····last4 o No configurada; Input password + Guardar; inline "Introduce una clave" on submit sin IPC; write-only: nunca precarga; Eliminar ghost destructive → AlertDialog Cancelar/Eliminar; disabled+Tooltip con span tabIndex=0 si !available; Skeleton si status null), hooks/useSecrets.ts (getStatus al montar; save/remove → KeyStatus local + toasts literales).

## 6. AC→cambio
(tabla del plan: navegación, guardado+toast+badge, cifrado en disco, persistencia reinicio, write-only, precedencia secrets→env→null, AlertDialog eliminar, validación inline, Alert+disabled tooltip, sustitución directa, skeletons.)

## 7. Orden, validación, riesgos
Orden: deps → types → atomicFile+refactor store → secretsService → ipc → getApiKey → preload → App/harness → useSecrets/ApiKeyRow/SettingsPage. Validación: typecheck && lint && test (suites previas verdes) + humo dev (guardar → secrets.json base64 → relanzar → precedencia → eliminar → fallback env).
Riesgos: (1) NO usar useNavigate dentro de SpikeAudioCapturePage (rompería 2 suites); (2) mockApi de tests exigirá `secrets` en el tipo → si typecheck de tests bloquea al dev, actualización mínima del helper es legítima para mantener build verde (el resto lo hace QA); (3) refactor persist cubierto por tests; (4) no llamar isEncryptionAvailable en initSecrets (pre-ready); (5) descifrado fallido → null silencioso (aceptable, "Probar conexión" es H7); (6) jamás loguear el plaintext.
