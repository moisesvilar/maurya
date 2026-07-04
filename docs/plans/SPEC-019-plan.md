# Plan de implementación — SPEC-019: aviso de consentimiento de grabación

> Generado por subagente Plan y aprobado por el orquestador (2026-07-04). Contrato: specs/SPEC-019-aviso-consentimiento-grabacion.md. Sin deps npm nuevas.

## 1. Tipos + persistencia del consent
- types/audio.ts: `TranscriptConsent {acknowledgedAt: string}`; `MauryaApi.recording.start(interviewId?, consentAcknowledgedAt?)`.
- transcriptionService: `persistTranscript(wavPath, assistant = null, consent: TranscriptConsent|null = null)` → JSON {lines, latency, assistant, consent}. Llamadas existentes compilan (spike → null, AC-10).
- ipc.ts: `let activeConsent` espejo de activeInterviewId (asignar en recording:start TRAS el guard; resetear en AMBOS caminos de recording:stop incluido catch); 3er arg a persistTranscript.

## 2. IPC/preload
- Firma posicional: `start(deviceId, interviewId?, consentAcknowledgedAt?)` (mockApi tipa con vi.fn<MauryaApi[...]> → 0 ediciones; spike sigue start(deviceId) → consent null, /capture intacta). Canal devuelve string directo (contrato previo).
- preload: invoke('recording:start', interviewId ?? null, consentAcknowledgedAt ?? null). useAudioCapture: passthrough; timestamp generado en renderer (new Date().toISOString()) al confirmar/arrancar.

## 3. UI
- **ui/checkbox.tsx (NUEVO a mano)**: CheckboxPrimitive del paquete `radix-ui`, data-slot, CheckIcon lucide, cn. NO tocar otros ui/**.
- **hooks/useConsentPreference.ts (NUEVO)**: calco useSidebarCollapsed; clave `maurya:recording-consent-dismissed`; lectura lazy con try/catch; {dismissed, persistDismiss}.
- **components/recording/ConsentDialog.tsx (NUEVO, precedente StopOnCloseDialog)**: AlertDialog LITERALES — título "Aviso de grabación"; descripción "Vas a grabar y transcribir esta conversación. Es tu responsabilidad informar a tu interlocutor y contar con su consentimiento antes de empezar."; Checkbox + label plano "No volver a mostrar este aviso" FUERA de AlertDialogDescription (es un <p>); Cancelar (Cancel, foco por defecto Radix) + Action default "Entendido, iniciar grabación". Checkbox se resetea a false al abrir. Escape/cancel: nunca persiste ni arranca. Props {open, onCancel, onConfirm(dontShowAgain)}.
- **RecordingSection**: extraer handleStart → startCapture(+timestamp); handleStart: dismissed → directo; si no → abrir diálogo; onConfirm: checkbox → persistDismiss(), cerrar y startCapture().

## 4. AC→cambio
10 ACs mapeados (tabla del plan del subagente).

## 5. Breakage presupuestado EXACTO — 23 its en 2 archivos (QA adapta)
- tests/unit/recording/RecordingSection.test.tsx: **10 de 14** (las que pulsan "Iniciar grabación": AC-02..AC-10 y AC-14 según nombres listados; AC-04 además cambia toHaveBeenCalledWith('i-1') → ('i-1', ISO)). NO se rompen AC-01/11/12/13.
- tests/unit/assistant/AssistantPanel.test.tsx: **13 de 13** (helper startRecording clica el botón).
- 0 roturas en: mockApi (tipado genérico), transcriptionService.test (campos sueltos, no forma completa), assistantService.test, spike-audio/**.
- Presupuesto: 290 → **267 PASS + 23 FAIL esperados**, ni uno más. tsc tests limpio.

## 6. Orden, validación, riesgos
Orden: tipos → transcriptionService+ipc → preload → useAudioCapture → checkbox → useConsentPreference → ConsentDialog → RecordingSection.
Validación: typecheck+lint limpios; vitest EXACTAMENTE los 23 FAIL listados.
Riesgos: foco Cancel (default Radix; si no, onOpenAutoFocus); checkbox nunca dentro del <p> de Description; resetear activeConsent en camino de error de stop (si no, consent de una entrevista se filtra a la siguiente grabación del spike); reset del checkbox al reabrir tras cancelar.
