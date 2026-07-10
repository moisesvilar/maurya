# PRD — Maurya (asistente para conducir entrevistas de discovery)

> Versión: 1.0
> Fecha: 2026-07-03
> Basado en: exploration-report.md

---

> ⚠️ **Nota de base de evidencia.** El exploration-report.md se apoya en **una única fuente** (experiencia propia del autor). Este PRD asume las hipótesis de dolor de ese informe como **premisas de diseño**, no como problema validado. Los requisitos son trazables a esos dolores, pero la validación con usuarios reales sigue siendo un riesgo abierto (ver §7). Las features de producto de este PRD provienen de **decisión explícita del usuario** (no del report), y así se marcan en el rationale con `[Decisión de usuario]`.

---

## 1. Contexto y Visión del producto

### 1.1 Resumen del problema

Conducir entrevistas de discovery exige varias tareas cognitivas simultáneas y en tiempo real: sostener el hilo, elegir la siguiente pregunta adecuada, escuchar activamente y adaptar el guión según las respuestas del interlocutor `[exploration-report §4.1]`. La complejidad se multiplica porque las preguntas correctas dependen de la **fase del discovery** (exploratoria según *The Mom Test*; de problema y de solución según *Running Lean*) y del **estado acumulado** de lo ya aprendido. El resultado percibido es que se necesitan muchas entrevistas y, aun así, los aprendizajes salen sesgados, incompletos, inconclusos o —peor— erróneos `[exploration-report §4.2 #5]`, comprometiendo la decisión de producto que el discovery debía informar. Hoy se resuelve de forma casi enteramente manual (Granola, notas, formularios) e, incluso, yendo dos personas a cada entrevista como workaround, porque ninguna herramienta asiste *durante* la conversación `[exploration-report §5-6]`. Afecta a research, product managers y entrepreneurs `[exploration-report §3]`.

La visión de **Maurya** es una aplicación de escritorio que acompaña al entrevistador de punta a punta: organiza el discovery, prepara guiones personalizados con IA, transcribe la llamada capturando el audio del dispositivo, y —el diferenciador— **asiste proactivamente en tiempo real** sugiriendo la siguiente pregunta y el porqué, para que una sola persona conduzca entrevistas de mayor calidad y con aprendizajes más fiables.

### 1.2 Alcance del Producto

- **Incluye:** aplicación de escritorio stand-alone que cubre el flujo completo mínimo — crear *discoveries*, dar de alta empresas y contactos, definir *templates* de entrevista, generar guión + objetivos con LLM, iniciar transcripción capturando micrófono y altavoces del sistema, asistencia proactiva en tiempo real, y resumen final según *note-template* configurable con persistencia de la transcripción para reutilizarla en futuras entrevistas.
- **No incluye:** ver §5 (Exclusiones) para el detalle (multiusuario/cloud sync, integraciones con CRM, app móvil, analítica agregada del discovery, etc.).
- **Versión:** MVP end-to-end (flujo mínimo usable de punta a punta).
- **Usuarios objetivo:** los tres perfiles del report, con **foco primario en el entrepreneur / PM que conduce en solitario** — el que más sufre la carga cognitiva y el coste de ir en pareja. El research dedicado es beneficiario secundario en el MVP.

### 1.3 Objetivos de Negocio

| # | Objetivo | Métrica asociada | Target |
|---|----------|-----------------|--------|
| 1 | Permitir conducir una entrevista de discovery en solitario con calidad | % de entrevistas conducidas por 1 sola persona (antes iban 2) | Por definir con datos baseline |
| 2 | Reducir el tiempo de preparación y síntesis por entrevista | Minutos de trabajo manual pre/post entrevista | Por definir con datos baseline |
| 3 | Mejorar la fiabilidad del aprendizaje (menos sesgo tipo "cumplido/futuro/genérico") | % de respuestas con evidencia concreta capturada por entrevista | Por definir con datos baseline |
| 4 | Validar que el problema y la solución tienen fit real | Nº de usuarios ajenos al autor que completan ≥3 entrevistas con la app | Por definir con datos baseline |

> Los targets quedan "por definir con datos baseline" porque el exploration report **no aporta datos cuantitativos** (fuente única, sin cifras). La obtención del baseline es una acción explícita en §7.

---

## 2. User Personas y Casos de uso

### 2.1 User Personas

#### Persona 1: Elena — Entrepreneur en solitario (persona primaria)

- **Rol:** fundadora de una startup en fase de validación; hace discovery de su propia idea.
- **Contexto:** conduce entrevistas sola, sin equipo que tome notas; combina discovery con otras mil tareas; conoce *The Mom Test* y *Running Lean* pero le cuesta aplicarlos en directo.
- **Objetivo principal:** validar qué problemas son reales y si su solución encaja, con pocas entrevistas y sin engañarse a sí misma.
- **Frustración principal:** no puede escuchar bien y a la vez decidir la siguiente pregunta; sospecha que sus aprendizajes están sesgados.
- **Cita representativa:** *"es difícil tener en la cabeza todo el hilo de la conversación, hacer las preguntas adecuadas, realizar escucha activa y modificar el guión en función de las respuestas"* `[exploration-report §4.1]`.
- **Fuente:** exploration-report.md (experiencia-autor, relato verbal).

#### Persona 2: Marcos — Product Manager

- **Rol:** PM en producto establecido; hace discovery continuo para decidir qué construir.
- **Contexto:** entrevistas encajadas entre reuniones; no es investigador formado; necesita guardar el estado del discovery entre sesiones y no repetir validaciones.
- **Objetivo principal:** llegar a conclusiones defendibles ante su equipo, sin dedicar días a sintetizar.
- **Frustración principal:** el proceso es manual y el "estado" del discovery vive solo en su cabeza y en notas dispersas.
- **Cita representativa:** *"quizás el discovery ya esté iniciado y estés en una fase adelantada… validando el fit de una solución"* `[exploration-report §4.1]`.
- **Fuente:** exploration-report.md.

#### Persona 3: Lucía — Research / UX Researcher (persona secundaria)

- **Rol:** investigadora dedicada; conduce muchas entrevistas y sintetiza aprendizajes.
- **Contexto:** ya tiene método y a veces va en pareja; le interesa reducir el trabajo manual de captura/síntesis y estandarizar templates.
- **Objetivo principal:** escalar el volumen de entrevistas sin perder rigor.
- **Frustración principal:** mucho proceso manual y poca ayuda automatizada `[exploration-report §6]`.
- **Fuente:** exploration-report.md.

### 2.2 Casos de uso principales

| # | Caso de uso | Persona | Descripción | Frecuencia |
|---|-------------|---------|-------------|------------|
| CU-01 | Crear un discovery | Elena/Marcos | Crea un discovery por nombre (como una carpeta) para agrupar entrevistas de una investigación | Puntual |
| CU-02 | Dar de alta empresa y contactos | Todos | Registra empresa (nombre, web, LinkedIn) y sus contactos (nombre, posición, LinkedIn) dentro del discovery | Semanal |
| CU-03 | Definir/editar un template de entrevista | Marcos/Lucía | Crea un template con bloques y preguntas (p. ej. exploratoria/problema/solución) | Puntual |
| CU-04 | Preparar una entrevista | Todos | Asigna template a una entrevista y genera guión personalizado + objetivos con IA usando info de empresa/contacto y entrevistas previas | Por entrevista |
| CU-05 | Conducir la entrevista con asistencia | Elena | Inicia la transcripción (mic+altavoces) y recibe en tiempo real la siguiente pregunta y el porqué | Por entrevista |
| CU-06 | Cerrar y sintetizar | Todos | Genera el resumen según el note-template y persiste la transcripción para futuras entrevistas | Por entrevista |
| CU-07 | Reutilizar contexto histórico | Marcos/Lucía | Al preparar una nueva entrevista de una empresa, la IA usa transcripciones/notas anteriores de esa empresa | Por entrevista |

---

## 3. Requisitos funcionales

### 3.1 Aplicación y almacenamiento (APP)

| Código | Nombre | Descripción | Rationale | Criticidad |
|--------|--------|-------------|-----------|------------|
| RF-APP-001 | App de escritorio stand-alone | Aplicación empaquetada de escritorio (Electron + React/TypeScript), instalable en macOS como mínimo, que funciona sin backend propio obligatorio | `[Decisión de usuario]` stack tipo Granola; necesaria para capturar audio del sistema (§3.5) | Must |
| RF-APP-002 | Persistencia local | Todos los datos (discoveries, empresas, contactos, templates, entrevistas, transcripciones, notas) se guardan localmente en el dispositivo | Estado del discovery debe sobrevivir entre sesiones `[report §4.2 #3]`; privacidad de conversaciones | Must |
| RF-APP-003 | Configuración de claves de IA | Pantalla de settings para introducir/gestionar las API keys de LLM y STT | Requisito operativo para §3.4, §3.5, §3.6, §3.7 | Must |
| RF-APP-004 | Configuración de note-templates | El usuario puede crear/editar plantillas de notas de resumen (contexto + secciones), como el ejemplo note-template-sample.md | `[Decisión de usuario]` feature 9; resumen configurable | Must |
| RF-APP-005 | Búsqueda/navegación por discoveries | Navegar y buscar entre discoveries, empresas y entrevistas | Usabilidad a volumen alto de entrevistas `[report §4.2 #6]` | Should |

### 3.2 Discoveries, empresas y contactos (DISC)

| Código | Nombre | Descripción | Rationale | Criticidad |
|--------|--------|-------------|-----------|------------|
| RF-DISC-001 | Crear discovery por nombre | Crear un discovery indicando solo un nombre; actúa como carpeta contenedora | `[Decisión de usuario]` feature 2; organiza el estado del discovery `[report §4.2 #3]` | Must |
| RF-DISC-002 | Gestionar discoveries | Renombrar, listar y eliminar discoveries | CRUD básico de organización | Should |
| RF-DISC-003 | Alta de empresa | Dentro de un discovery, crear empresa con nombre, website y página de LinkedIn | `[Decisión de usuario]` feature 3; alimenta la personalización del guión (§3.4) | Must |
| RF-DISC-004 | Alta de contacto | Dentro de una empresa, crear contacto con nombre, posición y perfil de LinkedIn | `[Decisión de usuario]` feature 3; alimenta personalización del guión | Must |
| RF-DISC-005 | Gestionar empresas y contactos | Editar y eliminar empresas y contactos | CRUD de mantenimiento | Should |

### 3.3 Templates de entrevista (TPL)

| Código | Nombre | Descripción | Rationale | Criticidad |
|--------|--------|-------------|-----------|------------|
| RF-TPL-001 | Crear template de entrevista | Crear un template con un listado de preguntas, organizables en bloques (como interview-sample.md) | `[Decisión de usuario]` feature 4; ataca "no saber qué preguntas tocan según la fase" `[report §4.2 #2]` | Must |
| RF-TPL-002 | Metadatos de bloque/pregunta | Cada bloque/pregunta puede llevar notas de guía (tiempo estimado, propósito, señales de alarma) | interview-sample.md incluye tiempos y notas metodológicas; enriquece la asistencia (§3.6) | Should |
| RF-TPL-003 | Editar/duplicar/eliminar templates | Gestión completa de templates reutilizables | Reutilización entre discoveries | Should |
| RF-TPL-004 | Fase metodológica del template | Marcar el template por fase (exploratoria/problema/solución) según Mom Test / Running Lean | `[report §4.1]` las preguntas dependen de la fase; contextualiza la asistencia | Could |

### 3.4 Preparación: guión y objetivos con IA (GUION)

| Código | Nombre | Descripción | Rationale | Criticidad |
|--------|--------|-------------|-----------|------------|
| RF-GUION-001 | Crear entrevista y asignar template | Crear una entrevista dentro de una empresa/contacto y asignarle un template | `[Decisión de usuario]` features 3 y 5 | Must |
| RF-GUION-002 | Generar guión personalizado con LLM | A partir del template + info de empresa y contacto, el LLM (Claude) genera un guión adaptado a esa entrevista | `[Decisión de usuario]` feature 6; ataca adaptación del guión `[report §4.2 #4]` | Must |
| RF-GUION-003 | Contexto histórico en el guión | Si existen transcripciones/notas de entrevistas anteriores de la misma empresa, el LLM las usa para personalizar el guión | `[Decisión de usuario]` feature 6; ataca gestión del estado del discovery `[report §4.2 #3]` | Must |
| RF-GUION-004 | Generar objetivos/metas de la entrevista | El LLM genera una lista de objetivos/metas para la entrevista | `[Decisión de usuario]` feature 6; los objetivos alimentan la asistencia (§3.6) | Must |
| RF-GUION-005 | Editar guión y objetivos | El usuario puede revisar y ajustar el guión y los objetivos antes de la llamada | Control humano sobre output del LLM; salvaguarda anti-error `[report §4.2 #5]` | Should |

### 3.5 Captura de audio y transcripción (AUDIO)

| Código | Nombre | Descripción | Rationale | Criticidad |
|--------|--------|-------------|-----------|------------|
| RF-AUDIO-001 | Iniciar/detener transcripción | Botón para iniciar la transcripción, que marca que la llamada/entrevista está en curso | `[Decisión de usuario]` feature 7 | Must |
| RF-AUDIO-002 | Captura de micrófono y altavoces | Capturar simultáneamente el audio del micrófono y de los altavoces/salida del sistema, sirviendo tanto para entrevistas presenciales como virtuales | `[Decisión de usuario]` feature 7; elimina la necesidad de segunda persona `[report §4.2 #7]` | Must |
| RF-AUDIO-003 | Transcripción en tiempo real (STT streaming) | Transcribir el audio en streaming con baja latencia (Deepgram) mostrando la transcripción en vivo | `[Decisión de usuario]` features 7-8; base de la asistencia proactiva | Must |
| RF-AUDIO-004 | Diarización / atribución de hablante | Distinguir entrevistador vs. interlocutor en la transcripción | Necesario para que la asistencia evalúe *quién* aporta evidencias (Mom Test) | Should |
| RF-AUDIO-005 | Aviso de permisos y dispositivos | Guiar la concesión de permisos de micrófono/captura de sistema y selección de dispositivos | Captura de audio de sistema en macOS requiere permisos/config explícitos | Must |

### 3.6 Asistencia proactiva en tiempo real (ASIS)

| Código | Nombre | Descripción | Rationale | Criticidad |
|--------|--------|-------------|-----------|------------|
| RF-ASIS-001 | Análisis continuo de la transcripción | El LLM analiza la transcripción a medida que avanza la llamada, de forma proactiva (sin esperar interacción del entrevistador) | `[Decisión de usuario]` feature 8; ataca la sobrecarga cognitiva `[report §4.2 #1]` | Must |
| RF-ASIS-002 | Sugerencia de siguiente acción | En tiempo real, indica si incidir en la pregunta actual pidiendo detalle adicional o continuar con el cuestionario | `[Decisión de usuario]` feature 8; asistencia en directo, el diferenciador | Must |
| RF-ASIS-003 | Justificación de la sugerencia (el "porqué") | Cada sugerencia incluye el motivo: p. ej. faltan evidencias concretas (The Mom Test) o un objetivo no está cumplido | `[Decisión de usuario]` feature 8; ataca aprendizajes sesgados/erróneos `[report §4.2 #5]` | Must |
| RF-ASIS-004 | Feedback del tamaño justo | La asistencia entrega solo lo esencial (siguiente pregunta + porqué), sin abrumar ni distraer de la escucha | `[Decisión de usuario]` feature 8; una asistencia mal dosificada empeora la escucha `[report §8]` | Must |
| RF-ASIS-005 | Seguimiento de objetivos en vivo | Mostrar el estado de cumplimiento de los objetivos de la entrevista durante la llamada | Los objetivos (RF-GUION-004) dirigen las sugerencias; da sensación de control del estado | Should |
| RF-ASIS-006 | Detección de señales de alarma | Señalar cumplidos/genéricos/futuros ("suena interesante", "lo haríamos") y reconducir a lo concreto | interview-sample.md y método Mom Test; refuerza fiabilidad del aprendizaje | Should |

### 3.7 Resumen y persistencia (NOTE)

| Código | Nombre | Descripción | Rationale | Criticidad |
|--------|--------|-------------|-----------|------------|
| RF-NOTE-001 | Generar resumen según note-template | Al cerrar, el LLM elabora un resumen de la llamada siguiendo el note-template configurado (contexto + secciones, como note-template-sample.md) | `[Decisión de usuario]` feature 9; ataca trabajo manual de síntesis `[report §4.2 #8]` | Must |
| RF-NOTE-002 | Persistir transcripción | Guardar la transcripción completa de la entrevista de forma persistente | `[Decisión de usuario]` feature 9; base para reutilización (RF-GUION-003) | Must |
| RF-NOTE-003 | Reutilización por el LLM | Las transcripciones/notas quedan disponibles como contexto para preparar futuras entrevistas de la misma empresa | `[Decisión de usuario]` feature 9; cierra el bucle del estado del discovery `[report §4.2 #3]` | Must |
| RF-NOTE-004 | Consulta y edición del resumen | El usuario puede leer y editar el resumen y consultar la transcripción | Control humano; el resumen del LLM debe poder corregirse | Should |
| RF-NOTE-005 | Exportar resumen/transcripción | Exportar a Markdown/otro formato para compartir fuera de la app | Compartir aprendizajes con el equipo | Could |

### 3.8 Configuración avanzada de IA (CFG)

| Código | Nombre | Descripción | Rationale | Criticidad |
|--------|--------|-------------|-----------|------------|
| RF-CFG-001 | Prompts de IA personalizables | El usuario puede consultar y editar desde Ajustes el bloque de persona/enfoque de los tres system prompts de IA (guión y objetivos, nota de resumen, asistente en vivo), con restablecimiento al default. Las reglas estructurales que sostienen los structured outputs (campos del JSON, límites de caracteres, partes dinámicas) permanecen bloqueadas | `[Decisión de usuario 2026-07-10]` (docs/drafts/prompt-externalizar-prompts-claude.md); control humano sobre el comportamiento de la IA sin recompilar la app | Should |

**Resumen de distribución:**

| Criticidad | Cantidad | % del total |
|-----------|----------|-------------|
| Must | 21 | 60% |
| Should | 11 | 31% |
| Could | 3 | 9% |
| **Total** | **35** | **100%** |

---

## 4. Requisitos no funcionales

### 4.1 Usabilidad

- Interfaz en español (idioma del usuario y del material de research).
- Durante la llamada, la asistencia debe ser glanceable: legible de un vistazo sin romper el contacto/escucha con el interlocutor (RF-ASIS-004). Máximo una sugerencia activa a la vez.
- El flujo crear discovery → entrevista → guión → llamada → resumen debe ser aprendible en la primera sesión, sin manual.
- Latencia percibida de la asistencia: la sugerencia debe aparecer con retraso suficientemente bajo como para ser útil en la conversación (objetivo orientativo < 3-5 s desde que se detecta el gap).

### 4.2 Compatibilidad

- Plataforma objetivo del MVP: **macOS** (por la captura de audio del sistema y por alinear con el stack tipo Granola). Windows/Linux quedan fuera del MVP (ver §5).
- Requiere conexión a internet para LLM (Claude) y STT (Deepgram).

### 4.3 Internacionalización / Localización

- UI en español en el MVP. Las entrevistas pueden transcribirse en el idioma en que ocurran (dependiente del soporte de Deepgram); el resumen y la asistencia operan en español por defecto.
- Formatos de fecha/hora locales (es-ES).

### 4.4 Integraciones

- **LLM:** Claude (Anthropic) para generación de guión, objetivos, asistencia en tiempo real y resumen.
- **STT en tiempo real:** Deepgram (streaming) para transcripción con baja latencia.
- **Captura de audio de sistema (macOS):** vía el mecanismo nativo/soportado por el stack (p. ej. captura de salida del sistema + micrófono).
- No hay integraciones con CRM, calendario ni LinkedIn API en el MVP (los campos de LinkedIn son datos introducidos manualmente).

### 4.5 Disponibilidad y Rendimiento

- App de escritorio de un solo usuario; sin SLA de servidor propio.
- Debe sostener una sesión de transcripción+asistencia continua de al menos 60 minutos sin degradarse ni perder audio.
- Gestión de coste/tokens: la asistencia en tiempo real debe controlar la frecuencia de llamadas al LLM para no disparar coste ni latencia (p. ej. analizar por turnos/ventanas, no por cada palabra).

### 4.6 Seguridad

- Las transcripciones y notas contienen conversaciones potencialmente sensibles: almacenamiento local, sin subida a servidores propios más allá de los proveedores de IA necesarios para procesar.
- Las API keys se guardan de forma segura en el dispositivo (keychain del sistema, no en texto plano).
- Aviso/registro de consentimiento de grabación: recordatorio al usuario de su responsabilidad de informar al interlocutor de que se graba/transcribe (cumplimiento legal de grabación de llamadas).
- Cumplimiento de los términos de los proveedores de IA respecto al envío de audio/texto.

---

## 5. Exclusiones

| # | Exclusión | Razón | Versión futura |
|---|-----------|-------|---------------|
| 1 | Multiusuario / colaboración / cloud sync | MVP es app local monousuario | Por evaluar |
| 2 | Windows y Linux | Foco en macOS por captura de audio y stack | Sí |
| 3 | App móvil | La captura de audio de sistema y la conducción se hacen desde escritorio | No |
| 4 | Integración con LinkedIn API / CRM / calendario | LinkedIn se captura como dato manual; integraciones añaden complejidad y permisos | Por evaluar |
| 5 | Analítica agregada del discovery (cross-entrevista: patrones, temas recurrentes automáticos) | Alto valor pero no imprescindible para el flujo mínimo; el report lo sitúa como necesidad futura | Sí |
| 6 | Traducción automática de resúmenes multi-idioma | El MVP opera en español | Por evaluar |
| 7 | Marketplace/biblioteca de templates compartidos | El usuario crea sus templates; compartir es escalado posterior | Por evaluar |
| 8 | Soporte de otros marcos más allá de Mom Test / Running Lean (JTBD, Continuous Discovery) | Gap identificado en el report §8; requiere validación antes de construir | Por evaluar |
| 9 | Integración nativa con Granola u otras note-takers | La app captura su propio audio; integrarse con otras es posterior | Por evaluar |

---

## 6. KPIs de éxito

| # | KPI | Definición | Método de medición | Target | Plazo |
|---|-----|------------|-------------------|--------|-------|
| 1 | Entrevistas conducidas en solitario | % de entrevistas hechas por 1 persona usando la app | Conteo en app | Por definir con baseline | Post-MVP, 1er mes de uso |
| 2 | Adopción del flujo completo | % de entrevistas que llegan de guión → transcripción → resumen | Telemetría local / conteo | ≥ 70% de las entrevistas iniciadas | 1er mes de uso |
| 3 | Utilidad de la asistencia | % de sugerencias en tiempo real que el entrevistador considera útiles (feedback thumbs up/down) | Feedback in-app por sugerencia | ≥ 60% útiles | Post-MVP |
| 4 | Densidad de evidencia | Nº medio de respuestas con dato concreto (cifra/fecha/caso) por entrevista | Etiquetado por el LLM en el resumen | Por definir con baseline | Post-MVP |
| 5 | Reducción de tiempo de síntesis | Minutos hasta tener el resumen listo vs. proceso manual previo | Autoinforme del usuario / timestamp | −50% vs. manual | Post-MVP |
| 6 | Validación del problema | Nº de usuarios ajenos al autor que completan ≥3 entrevistas con la app | Conteo de usuarios activos | ≥ 5 usuarios | 2-3 meses tras MVP |

---

## 7. Riesgos

| # | Riesgo | Probabilidad | Impacto | Plan de mitigación |
|---|--------|-------------|---------|-------------------|
| 1 | Problema no validado (fuente única en el discovery) | Alta | Alto | Antes/durante el MVP, hacer 5-8 entrevistas de validación a PMs/entrepreneurs ajenos al autor (report §8). Obtener baseline cuantitativo para los KPIs |
| 2 | La asistencia en tiempo real distrae o empeora la escucha | Media | Alto | Diseño "tamaño justo" (RF-ASIS-004), una sugerencia a la vez, tests de usabilidad tempranos con prototipo wizard-of-oz |
| 3 | Latencia LLM+STT demasiado alta para ser útil en directo | Media | Alto | Deepgram streaming; ventanas de análisis por turnos, no por palabra; prompts cortos; medir latencia extremo a extremo como criterio de aceptación |
| 4 | Captura de audio del sistema en macOS (permisos/estabilidad) | Media | Alto | Prototipar la captura mic+sistema como primer hito técnico (spike), antes de construir el resto |
| 5 | Coste de IA por entrevista se dispara (análisis continuo) | Media | Medio | Control de frecuencia de llamadas, batching por turnos, límites configurables; medir coste por entrevista |
| 6 | Calidad/sesgo del guión y del resumen generados por LLM | Media | Medio | Edición humana obligatoria antes/después (RF-GUION-005, RF-NOTE-004); prompts anclados a Mom Test / Running Lean |
| 7 | Equipo no definido → roadmap incierto | Alta | Medio | Roadmap calculado sobre supuesto base (1 fullstack full-time con IA); revisar al confirmar equipo real |
| 8 | Privacidad/legalidad de grabar conversaciones | Media | Medio | Almacenamiento local, aviso de consentimiento (RF §4.6), keys en keychain |
| 9 | Diarización imperfecta degrada el juicio de "quién da evidencias" | Media | Bajo | Marcar diarización como Should; degradar con elegancia si falla (asistencia sigue funcionando sin atribución perfecta) |

---

## 8. Roadmap de alto nivel

### 8.1 Hitos principales

| Hito | Descripción | Semana objetivo | Dependencias | Entregable |
|------|-------------|----------------|-------------|------------|
| H0 | Spike técnico: captura mic+altavoces macOS + STT streaming Deepgram | S2 | — | Prueba de concepto que transcribe una llamada en vivo |
| H1 | Shell de la app + persistencia local + settings/keys + note-templates | S4 | H0 | App instalable con datos locales y configuración |
| H2 | Discoveries, empresas, contactos y templates de entrevista (CRUD) | S6 | H1 | Organización completa del discovery (RF-DISC, RF-TPL) |
| H3 | Preparación con IA: guión personalizado + objetivos (con contexto histórico) | S8 | H2 | Entrevista con guión y objetivos generados por Claude (RF-GUION) |
| H4 | Transcripción en vivo integrada en la entrevista | S10 | H0, H3 | Iniciar/parar transcripción con audio de mic+sistema (RF-AUDIO) |
| H5 | Asistencia proactiva en tiempo real (siguiente pregunta + porqué + objetivos) | S13 | H4 | El diferenciador funcionando en una entrevista real (RF-ASIS) |
| H6 | Resumen según note-template + persistencia + reutilización de contexto | S15 | H5 | Flujo end-to-end cerrado (RF-NOTE) |
| H7 | Pulido, control de coste/latencia, tests de usabilidad y hardening | S17 | H6 | MVP listo para usuarios de validación |

### 8.2 Diagrama de Gantt (por semanas)

```
Semana:                       S1  S2  S3  S4  S5  S6  S7  S8  S9  S10 S11 S12 S13 S14 S15 S16 S17
──────────────────────────────────────────────────────────────────────────────────────────────
H0 - Spike audio+STT          ████████
H1 - Shell+persistencia+keys      ████████████
H2 - Discoveries/empresas/tpl              ████████
H3 - IA guión+objetivos                        ████████
H4 - Transcripción en vivo                             ████████
H5 - Asistencia tiempo real                                    ████████████
H6 - Resumen+persistencia                                                  ████████
H7 - Pulido+coste/latencia+QA                                                      ████████
```

**Supuestos del roadmap:**
- Equipo: **1 desarrollador fullstack a tiempo completo con asistencia intensiva de IA** (supuesto base; el equipo real está por definir — Riesgo #7). Con 2-3 personas, H2/H3/H4 pueden paralelizarse y el MVP comprimirse a ~S11-S12.
- Dedicación: full-time.
- Sin contar festivos ni vacaciones.
- H0 (spike de audio) va primero a propósito: es el mayor riesgo técnico y bloquea H4/H5.
- Las estimaciones son orientativas y se revisarán al inicio de cada hito y al confirmar el equipo.
```
