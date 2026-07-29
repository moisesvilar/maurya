# SPEC-059 — Ocultar métricas técnicas de la grabación tras un desplegable al final de la pantalla

> Origen: issue de GitHub [#39 «Ocultar métricas técnicas»](https://github.com/moisesvilar/maurya/issues/39) (enhancement, 2026-07-28), reportado con captura. No proviene del checklist (precedente SPEC-049, SPEC-054, SPEC-057). Traza a **RF-GRAB** (grabación y persistencia del WAV/transcript) y ajusta posicionalmente el detalle del estado Grabada definido en SPEC-015/030 y reubicado por SPEC-055: la latencia STT y las rutas de los ficheros WAV y transcript dejan de ocupar la zona superior de la pantalla.

## Descripción

Cuando una entrevista (o una captura) tiene una grabación, la pantalla de detalle muestra hoy, justo bajo la cabecera y antes de los objetivos, un bloque con métricas técnicas: la latencia de transcripción y las rutas absolutas de los ficheros WAV y transcript. Esa información no aporta lo suficiente para ocupar ese nivel de importancia. Esta spec la mueve al final de la pantalla, dentro de un desplegable «Mostrar información técnica de la grabación» que por defecto está plegado; al pulsarlo se despliega y muestra la misma información. Los avisos de la grabación (errores, modo degradado, falta de clave) y los diálogos del flujo no se mueven: siguen bajo la cabecera.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura.
- Esta spec **no** toca main ni preload, ni la persistencia (`db.json` intacto), ni contratos IPC, ni tipos compartidos. El cambio es de composición en el renderer: el bloque del estado Grabada sale de la superficie de grabación y pasa a una sección nueva al final de las dos páginas de detalle. **Fuera de alcance:** el contenido del bloque (formato de `LatencyRow`, umbral OK/Lenta, formato de rutas) no cambia; la página `/capture` del spike (`ResultSection`) no se toca.

## Criterios de aceptación

### Desplegable al final de la pantalla

- GIVEN el detalle de una entrevista con grabación (estado Grabada) WHEN se renderiza la página THEN al final de la pantalla, tras las secciones de Nota y Guión, aparece el desplegable «Mostrar información técnica de la grabación».
- GIVEN el detalle de una entrevista con grabación WHEN se renderiza la página THEN el desplegable está plegado y ni la latencia STT ni las rutas del WAV y del transcript son visibles.
- GIVEN el desplegable plegado WHEN el usuario pulsa «Mostrar información técnica de la grabación» THEN se despliega y muestra la fila «Latencia STT» y las rutas de los ficheros WAV y transcript.
- GIVEN el desplegable desplegado WHEN el usuario vuelve a pulsar el trigger THEN el contenido se pliega y las métricas dejan de ser visibles.
- GIVEN el detalle de una entrevista con grabación WHEN se renderiza la zona bajo la cabecera THEN la latencia y las rutas ya no aparecen ahí.

### Ambas páginas

- GIVEN el detalle de una captura (sección Capturas) con grabación WHEN se renderiza la página THEN el desplegable aparece igualmente al final, plegado por defecto, con el mismo trigger y el mismo contenido.
- GIVEN el detalle de una captura con grabación WHEN el usuario despliega el desplegable THEN se muestran la latencia y las rutas de esa captura.

### Sin grabación — el desplegable no existe

- GIVEN el detalle de una entrevista sin grabación (estado Preparación) WHEN se renderiza la página THEN el desplegable no se renderiza en absoluto.
- GIVEN una entrevista grabándose (estado Grabando) WHEN se renderiza la página THEN el desplegable no se renderiza mientras dura la grabación.
- GIVEN el detalle de una entrevista grabada WHEN el usuario pulsa «Nueva grabación» en la top bar THEN el desplegable desaparece junto con el resto del detalle del estado Grabada.

### Contenido parcial

- GIVEN una entrevista grabada sin estadísticas de latencia disponibles WHEN el usuario despliega el desplegable THEN se muestran solo las rutas, sin la fila «Latencia STT» y sin dejar hueco vacío.
- GIVEN una entrevista grabada sin transcript (`transcriptPath` nulo, transcripción degradada o fallida) WHEN el usuario despliega el desplegable THEN se muestra la ruta del WAV y no se renderiza línea alguna para el transcript.

### No regresión de la superficie de grabación

- GIVEN una grabación en curso con la transcripción en modo degradado WHEN se renderiza la página THEN el aviso de modo degradado sigue apareciendo bajo la cabecera, no dentro del desplegable.
- GIVEN una grabación en curso sin clave de Deepgram configurada WHEN se renderiza la página THEN el aviso «Falta la key» sigue apareciendo bajo la cabecera.
- GIVEN un error de captura o de transcripción WHEN se renderiza la página THEN la alerta de error sigue apareciendo bajo la cabecera, fuera del desplegable.
- GIVEN una parada de grabación con preguntas descartadas WHEN termina la grabación THEN el diálogo «Preguntas descartadas» se abre igual que antes de esta spec.

### Estado efímero del desplegable

- GIVEN el desplegable desplegado WHEN el usuario navega a otra pantalla y vuelve al detalle THEN el desplegable aparece de nuevo plegado.

## UX Design

La información técnica es contenido opcional e independiente que el usuario consulta rara vez: el patrón del design system para eso es el desplegable (§4.3, Accordion/Collapsible para contenido opcional e independiente) colocado en la zona inferior del detalle (§8.3: «Historial, actividad, logs. Lo menos consultado va al final»). El anti-patrón de §8.3 («nunca Accordion para secciones de detalle») no aplica: prohíbe esconder información relevante, y el punto de este issue es precisamente que esta información no es relevante para el flujo principal. Al ser una sección única se usa `Collapsible` (un solo bloque plegable) y no `Accordion` (familia de items).

### Wireframe textual

**Layout 2 — Página de detalle** (las dos páginas conservan su composición actual; solo cambia de sitio el bloque técnico).

**Zona bajo la cabecera** (ambas páginas, sin cambios salvo la resta): alertas de permiso/captura/transcripción, aviso de modo degradado, aviso «Falta la key» — exactamente como hoy. El bloque «latencia + rutas» del estado Grabada desaparece de aquí.

**Sección nueva al final de la página** (ambas páginas, tras Nota/Guión, solo cuando hay grabación):

- **Trigger**: fila a ancho completo con Button (variant ghost) que contiene el icono `ChevronRight` (Lucide, 16px) y el texto literal «Mostrar información técnica de la grabación». El icono rota 90° a `ChevronDown` cuando está desplegado. Tipografía secundaria (`text-sm text-muted-foreground`), coherente con su bajo peso jerárquico.
- **Contenido desplegado**, en columna con el mismo espaciado que tiene hoy el bloque:
  - Fila «Latencia STT» (`LatencyRow` actual, sin cambios): «Latencia STT mediana X,X s · p95 X,X s · máx X,X s · N resultados» + Badge «OK» (verde) o «Lenta» (destructive). Solo si hay estadísticas de latencia.
  - Ruta del fichero WAV en monoespaciada (`font-mono text-sm break-all`), texto literal de la ruta absoluta.
  - Ruta del fichero transcript en monoespaciada, solo si existe.

### Componentes shadcn utilizados

Componentes: `Button` (variant ghost, trigger), `Badge` (dentro de `LatencyRow`, ya existente), `Collapsible` (`Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`).

Componente adicional necesario: `Collapsible` (no instalado en el scaffold base; primitiva `@radix-ui/react-collapsible`).

### data-testid

- `recording-tech-info` — el contenedor `Collapsible` de la sección.
- `recording-tech-info-trigger` — el botón que pliega/despliega.
- `recording-tech-info-content` — el contenido desplegable (latencia + rutas).

El texto del trigger («Mostrar información técnica de la grabación») y el contenido (`Latencia STT`, rutas) son además localizables por texto; los testids dan locator estable al contenedor y al estado plegado/desplegado.

### Patrón de interacción

- **Collapsible único, no Accordion** (§4.3): es una sola sección opcional; un Accordion de un item sería ruido estructural.
- **Al final de la página** (§8.3): lo menos consultado va al final; la identidad y el progreso (cabecera, objetivos, nota/guión) conservan la zona superior.
- **Plegado por defecto y sin persistencia**: el estado es local a la visita; volver a la página lo muestra plegado de nuevo. No hay razón para recordar una consulta puntual de diagnóstico.
- **Sin feedback adicional**: desplegar/plegar es una acción local no mutadora — sin Toast, sin diálogo (§6.1: Toast solo tras acciones mutadoras).
- **Renderizado condicional, no deshabilitado**: sin grabación la sección no existe; un trigger deshabilitado con Tooltip (§5.4) sugeriría una acción disponible que no lo está.

### Comportamiento responsive

- **Ventana estrecha (< md)**: sin cambios estructurales; las rutas ya rompen por cualquier carácter (`break-all`) y la fila de latencia envuelve a varias líneas si no cabe.
- **Tablet (md–lg)**: interpolado, sin cambios.
- **Desktop (lg+)**: layout completo del wireframe; el trigger y el contenido ocupan el ancho de la columna de contenido.

## Notas técnicas

No hay cambios de schema, persistencia, canales IPC ni tipos compartidos. Estado actual, para que el implementador no lo rediagnostique:

- El bloque a mover vive en `src/renderer/src/components/recording/RecordingSurface.tsx` (líneas ~137-145): `{recorded && (<div>… LatencyRow + wavPath + transcriptPath …</div>)}`. Los avisos y los diálogos de ese mismo componente **se quedan donde están**; al extraer el bloque, revisar el cálculo de `showBlock` para que la superficie no reserve espacio cuando solo quedaba el detalle de Grabada.
- `recorded` y `displayLatency` vienen de `useRecordingController` (`src/renderer/src/hooks/useRecordingController.ts:276-277`): `recorded = !capturing && interview.wavPath !== null && !newRecordingRequested`; `displayLatency = result?.latency ?? persistedLatency` y puede ser `null`. Estas derivaciones no cambian.
- Las páginas que montan la sección nueva son `src/renderer/src/pages/InterviewDetailPage.tsx` y `src/renderer/src/pages/CaptureDetailPage.tsx` (ambas ya comparten `controller` e `interview` por props); la sección va tras `NoteScriptSections`, como último elemento del contenido.
- Sugerencia de extracción: un componente compartido (p. ej. `components/recording/RecordingTechInfo.tsx`) que reciba `controller` e `interview` y encapsule el `Collapsible`; evita duplicar el bloque en las dos páginas.
- `LatencyRow` no se modifica; `ResultSection` (spike `/capture`) sigue usándola tal cual.

## Decisiones asumidas

- Texto del trigger → asumido el literal del issue, **«Mostrar información técnica de la grabación»**, constante en ambos estados con el chevron como indicador de plegado/desplegado (alternativa: alternar a «Ocultar información técnica de la grabación» al desplegar). Razón: el chevron ya comunica el estado y un label estable evita saltos de ancho; el issue solo nombra el texto de mostrar.
- Persistencia del estado del desplegable → asumido **efímero por visita** (alternativa: recordarlo en `localStorage`). Razón: el issue fija «por defecto, no desplegado»; recordar el estado desplegado contradiría ese default en la práctica.
- Posición exacta → asumido **último elemento de la página, tras Nota/Guión** (alternativa: entre Objetivos y Nota/Guión). Razón: el issue pide «al final de la pantalla, en el bottom» y §8.3 manda lo menos consultado al final.
- Alcance del movimiento → asumido **solo el bloque del estado Grabada** (latencia + rutas); los avisos y diálogos de `RecordingSurface` permanecen bajo la cabecera (alternativa: mover la superficie entera). Razón: los avisos son información operativa urgente (§6, Alert visible sin scroll, precedente SPEC-049); esconderlos al final rompería su función.
