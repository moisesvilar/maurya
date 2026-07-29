# Plan de implementación — SPEC-059 (ocultar métricas técnicas tras un desplegable al final)

> Plan autorado por el orquestador del loop (precedente SPEC-030, SPEC-035, SPEC-042, SPEC-047, SPEC-049): el cambio es de composición en el renderer, toca 3 ficheros existentes y añade 2, y la spec ya trae el diagnóstico del estado actual en «Notas técnicas». No se abre vuelta de subagente en modo plan.

## Diagnóstico confirmado sobre el código

- `src/renderer/src/components/recording/RecordingSurface.tsx:137-145` contiene el bloque a mover: `{recorded && (<div className="flex flex-col gap-3">… LatencyRow + wavPath + transcriptPath …</div>)}`.
- La prop `interview` de `RecordingSurface` **solo** la consume ese bloque (`interview.wavPath`, `interview.transcriptPath`); `recorded` del controller solo lo consumen ese bloque y `showBlock`. Al extraerlos, ambos quedan huérfanos → la prop y la desestructuración salen (TS estricto + `noUnusedParameters`/eslint no toleran el residuo).
- `showBlock` (línea 120) pasa a `hasCaptureError || hasTranscriptionError || hasDegraded || hasNoKey`: sin el término `recorded`, la superficie deja de reservar espacio en el estado Grabada sin avisos.
- `radix-ui` 1.6.1 (paquete unificado, ya instalado) exporta el namespace `Collapsible` con `Root`/`Trigger`/`Content` → **cero dependencias nuevas** (precedente SPEC-028: `label`/`radio-group` salieron del mismo paquete).
- `LatencyRow` y `ResultSection` (spike `/capture`) no se tocan.

## Cambios

### 1. `src/renderer/src/components/ui/collapsible.tsx` (nuevo)

Primitivo shadcn estándar sobre `Collapsible as CollapsiblePrimitive` de `radix-ui`, con el mismo patrón de los demás `components/ui/` del repo (función por parte, `data-slot`, `React.ComponentProps<typeof …>`). Exporta `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`. Sin estilos propios más allá de pasar `className`.

### 2. `src/renderer/src/components/recording/RecordingTechInfo.tsx` (nuevo)

Componente compartido por las dos páginas (evita duplicar el bloque):

- Props: `{ controller: RecordingController; interview: Interview }`.
- `const { recorded, displayLatency } = controller`; **`recorded === false` → `return null`** (renderizado condicional, no deshabilitado — §5.4 de la spec). Cubre Preparación, Grabando y «Nueva grabación» de una sola vez, porque `recorded` ya incorpora `!capturing && wavPath !== null && !newRecordingRequested`.
- Estado local `const [open, setOpen] = useState(false)` → plegado por defecto y efímero por visita (se pierde al desmontar; no hay `localStorage`).
- `Collapsible` con `data-testid="recording-tech-info"`; `CollapsibleTrigger asChild` envolviendo un `Button variant="ghost"` con `data-testid="recording-tech-info-trigger"`, clase `w-full justify-start text-sm text-muted-foreground`, icono `ChevronRight` (Lucide, `size-4`) con `transition-transform` + `rotate-90` cuando `open`, y el literal **«Mostrar información técnica de la grabación»** constante en ambos estados.
- `CollapsibleContent` con `data-testid="recording-tech-info-content"` y el bloque movido **tal cual**: `flex flex-col gap-3` (más `pt-2` para separarlo del trigger) → `LatencyRow` solo si `displayLatency !== null`, `<p className="break-all font-mono text-sm">{interview.wavPath}</p>` y el mismo `<p>` para `interview.transcriptPath` solo si no es `null`. Radix desmonta el contenido al plegar → sin `forceMount`, las métricas no existen en el DOM plegado.

### 3. `src/renderer/src/components/recording/RecordingSurface.tsx`

- Fuera el bloque `{recorded && …}`, el import de `LatencyRow`, `recorded` de la desestructuración, la prop `interview` (y su entrada en `RecordingSurfaceProps`) y el término `recorded` de `showBlock`.
- Se actualiza el docblock: la superficie queda como «solo avisos + diálogos»; el detalle de archivo se nombra con su destino nuevo (`RecordingTechInfo`, SPEC-059).
- **No se toca nada más**: `CaptureErrorAlert`, `DegradedTranscriptionAlert`, `NoKeyAlert`, `ConsentDialog`, `StopOnCloseDialog`, `DiscardReasonsDialog` y el efecto de motivos se quedan exactamente donde están.

### 4. `src/renderer/src/pages/InterviewDetailPage.tsx` y `src/renderer/src/pages/CaptureDetailPage.tsx`

- `<RecordingSurface …>` pierde la prop `interview`.
- Se añade `<RecordingTechInfo controller={controller} interview={interview} />` **después** de `</OnboardingBridgeProvider>` (es decir, tras `NoteScriptSections`), como último elemento del contenido de la página. Va fuera del provider porque no participa del puente banner↔secciones (SPEC-058); el orden del DOM es el mismo que dentro.
- Los diálogos que siguen en el JSX (`AssignCompanySheet`, `EditCaptureDialog`, `InterviewFormDialog`) son portales sin footprint: la sección sigue siendo el último elemento **visible**.

## Orden de ejecución

1. `collapsible.tsx` → 2. `RecordingTechInfo.tsx` → 3. poda de `RecordingSurface.tsx` → 4. las dos páginas → 5. `npm run typecheck` + `npm run lint` → 6. commit.

## Riesgos y no-riesgos

- **Suites existentes**: las que asertan latencia/rutas bajo la cabecera (herencia SPEC-015/030/055) pasarán a fallar por diseño; es derogación posicional, no debilitamiento — se adaptan en el paso de QA citando SPEC-059, nunca se borran ni se `.skip`.
- **Sin riesgo de IPC/persistencia**: cero cambios en main, preload, `db.json`, canales y tipos compartidos.
- **Sin dependencia nueva**: `radix-ui` ya está en `package.json`; `package-lock.json` no se toca.
