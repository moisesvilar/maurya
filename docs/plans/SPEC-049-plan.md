# SPEC-049 — Plan de implementación

> Plan autorado por el orquestador (cambio quirúrgico de renderer, ~6 ficheros, sin IPC nuevo;
> precedente SPEC-030/035/042/047). Spec: `specs/SPEC-049-permisos-no-concedidos-visibles.md`.

## Contexto

Dos cambios de visibilidad sobre piezas existentes:

1. Botón «Abrir Ajustes del Sistema» junto a los badges de permisos en estado Preparación
   (top bar de la captura y bloque Preparación del detalle de entrevista).
2. Los `CaptureError` de permiso (`microphone-permission` | `system-audio-permission`) se pintan
   bajo la cabecera de la página (antes de Objetivos) en ambas páginas, y dejan de pintarse en la
   sección Grabación. El resto de errores no se mueven.

Todo el estado necesario ya está izado: ambas páginas poseen el `RecordingController`
(SPEC-034/041). `openPrivacySettings(target)` ya existe (`services/permissionsService.ts`).

## Cambios por fichero

### 1. `src/renderer/src/components/recording/OpenSettingsButton.tsx` (NUEVO)

Componente pequeño y única fuente de la lógica de visibilidad/destino:

- Props: `permissions: PermissionsSnapshot | null`.
- Visibilidad: se renderiza si `permissions?.microphone !== 'granted' || permissions?.systemAudio
  !== 'granted'` (mismo criterio que `PermissionBadges`: snapshot null ⇒ visible). Si ambos
  concedidos → `null`.
- Destino del clic: `microphone` si el micrófono no está `granted`; si no, `systemAudio`.
  `onClick={() => void openPrivacySettings(target)}`.
- Render: `<Button variant="outline" size="sm" data-testid="open-settings-button">Abrir Ajustes
  del Sistema</Button>`.

### 2. `src/renderer/src/components/recording/CaptureTopBarControls.tsx`

En la rama Preparación (no `capturing`), insertar `<OpenSettingsButton
permissions={controller.permissions} />` entre `<PermissionBadges …/>` y `<MicSelect …/>`.

### 3. `src/renderer/src/components/recording/RecordingSection.tsx`

- **Bloque Preparación (variant interview):** envolver `PermissionBadges` + `OpenSettingsButton`
  en una fila `div.flex.flex-wrap.items-center.gap-4` (badges a la izquierda, botón a su derecha);
  `MicSelect` y el CTA quedan igual.
- **Errores:** dejar de pintar en la sección los errores de permiso. Con
  `isPermissionError(error) = error.kind === 'microphone-permission' || error.kind ===
  'system-audio-permission'`: `{error !== null && !isPermissionError(error) && <CaptureErrorAlert
  error={error} />}`. `transcription.error` se queda como está (nunca es de permiso).

### 4. `src/renderer/src/components/recording/PermissionErrorAlert.tsx` (NUEVO)

Wrapper fino para el Alert superior de página:

- Props: `error: CaptureError | null`.
- Si `error === null` o su `kind` no es de permiso → `null`. Si es de permiso → renderiza
  `<div data-testid="permission-error-alert"><CaptureErrorAlert error={error} /></div>`
  (reutiliza título por kind, mensaje y botón «Abrir Ajustes del Sistema» que ya trae
  `CaptureErrorAlert`).
- Exporta también `isPermissionError(error)` (o se coloca ese helper aquí y lo importa
  RecordingSection — una sola definición, no dos).

### 5. `src/renderer/src/pages/CaptureDetailPage.tsx`

Insertar `<PermissionErrorAlert error={controller.error} />` inmediatamente después del `div` de
cabecera (título/acciones) y antes de `<ObjectivesSection …/>`.

### 6. `src/renderer/src/pages/InterviewDetailPage.tsx`

Igual: `<PermissionErrorAlert error={controller.error} />` tras la cabecera y antes de
`<ObjectivesSection …/>` (el controller ya está izado en `InterviewDetailContent`, SPEC-041).

## Notas de comportamiento (mapa a ACs)

- El botón junto a badges cubre AC-01..08 (visibilidad por snapshot, destino con prioridad
  micrófono, desaparición al refrescar el snapshot — el refresco ya lo hace el controller).
- El Alert superior cubre AC-09..11 y AC-15 (aparece con `controller.error` de permiso; el error
  se limpia en el propio controller al arrancar una nueva captura con éxito → AC-14 sin código
  nuevo).
- El filtro de la sección Grabación cubre AC-12/13.

## Fuera de alcance

- Ningún cambio en main/preload/IPC, hooks (`useRecordingController`), `CaptureErrorAlert` en sí,
  ni en el spike `/capture` (redirect desde SPEC-020; `PermissionsSection`/spike intactos).
- Sin tests (los genera `/somo-qa-dev`).

## Riesgos

- Bajo. El único punto con matices es no duplicar el helper `isPermissionError` y mantener la
  condición de montaje del portal de la top bar tal cual (`!controller.recorded`).
