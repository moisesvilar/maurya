# Checklist de implementación — Maurya (MVP)

> Seguimiento de las tareas del MVP. Derivado de [prd.md](prd.md) (34 RF) y su roadmap (H0-H7).
> Organizado por hito de implementación. Cada ítem enlaza al requisito funcional del PRD.
> Estado: `[ ]` pendiente · `[~]` en curso · `[x]` hecho · `[!]` bloqueado.

## Leyenda de criticidad
- 🔴 **Must** — imprescindible para el flujo end-to-end.
- 🟡 **Should** — importante, no bloquea el flujo.
- 🟢 **Could** — deseable.

---

## H0 · Spike técnico (objetivo S2)

Mayor riesgo técnico; bloquea H4/H5. Va primero a propósito.

- [x] 🔴 Prueba de captura simultánea de **micrófono + altavoces/salida del sistema** en macOS (RF-AUDIO-002) — SPEC-001, unit 11/11 PASS; verificación acústica/TCC pendiente de humano
- [x] 🔴 Gestión de **permisos** de micrófono y captura de audio de sistema en macOS (RF-AUDIO-005) — cubierto por SPEC-001 (decisión humana 2026-07-03); iterar si la verificación manual revela huecos
- [x] 🔴 Integración de **STT streaming con Deepgram** transcribiendo en vivo con baja latencia (RF-AUDIO-003) — SPEC-002, unit 24/24 PASS; verificación con voz real pendiente de humano
- [x] 🔴 Medir **latencia extremo a extremo** audio→texto y validar que es utilizable en directo (NFR §4.1, Riesgo #3) — SPEC-003, unit 32/32 PASS; veredicto "utilizable" pendiente de sesión real del humano
- [x] 🟡 Probar **diarización** (entrevistador vs. interlocutor) de Deepgram (RF-AUDIO-004) — SPEC-004, unit 40/40 PASS; calidad con voces reales pendiente de humano
- [ ] 🔴 **Decisión go/no-go** técnico documentada antes de continuar

---

## H1 · Shell de la app + persistencia + settings (objetivo S4)

Depende de H0.

- [x] 🔴 Scaffolding **Electron + React + TypeScript** empaquetable en macOS (RF-APP-001) — SPEC-005, unit 45/45 PASS, Maurya.app+DMG generados; verificación del bundle pendiente de humano
- [x] 🔴 **Persistencia local** de datos (esquema de datos: discoveries, empresas, contactos, templates, entrevistas, transcripciones, notas) (RF-APP-002) — SPEC-006, unit 62/62 PASS (JSON store transaccional + api.db)
- [x] 🔴 Pantalla de **settings** para gestionar API keys de LLM y STT (RF-APP-003) — SPEC-007, unit 80/80 PASS
- [x] 🔴 Guardado seguro de **API keys en keychain** del sistema (NFR §4.6) — SPEC-007 (Electron safeStorage, cifrado verificado en test; write-only al renderer)
- [x] 🔴 Editor de **note-templates** (contexto + secciones, como note-template-sample.md) (RF-APP-004) — SPEC-008, unit 102/102 PASS tras 1 iteración de QA
- [x] 🔴 UI base en **español** y layout de navegación principal (NFR §4.3) — SPEC-009, unit 114/114 PASS. **H1 completo**

---

## H2 · Discoveries, empresas, contactos y templates (objetivo S6)

Depende de H1.

### Discoveries, empresas y contactos (DISC)
- [x] 🔴 **Crear discovery** por nombre (como carpeta contenedora) (RF-DISC-001) — SPEC-010, unit 133/133 PASS
- [x] 🟡 Renombrar / listar / eliminar discoveries (RF-DISC-002) — SPEC-010 (misma spec; detalle mínimo /discoveries/:id incluido)
- [ ] 🔴 **Alta de empresa** (nombre, website, LinkedIn) dentro de un discovery (RF-DISC-003)
- [ ] 🔴 **Alta de contacto** (nombre, posición, perfil LinkedIn) dentro de una empresa (RF-DISC-004)
- [ ] 🟡 Editar / eliminar empresas y contactos (RF-DISC-005)

### Templates de entrevista (TPL)
- [ ] 🔴 **Crear template** con listado de preguntas organizable en bloques (RF-TPL-001)
- [ ] 🟡 Metadatos por bloque/pregunta (tiempo, propósito, señales de alarma) (RF-TPL-002)
- [ ] 🟡 Editar / duplicar / eliminar templates (RF-TPL-003)
- [ ] 🟢 Marcar **fase metodológica** del template (exploratoria/problema/solución) (RF-TPL-004)

---

## H3 · Preparación con IA: guión + objetivos (objetivo S8)

Depende de H2. LLM: Claude.

- [ ] 🔴 **Crear entrevista** dentro de empresa/contacto y **asignar template** (RF-GUION-001)
- [ ] 🔴 **Generar guión personalizado con LLM** a partir de template + info de empresa/contacto (RF-GUION-002)
- [ ] 🔴 Inyectar **contexto histórico** (transcripciones/notas de entrevistas previas de la misma empresa) en el guión (RF-GUION-003)
- [ ] 🔴 **Generar objetivos/metas** de la entrevista con LLM (RF-GUION-004)
- [ ] 🟡 **Editar** guión y objetivos antes de la llamada (control humano) (RF-GUION-005)

---

## H4 · Transcripción en vivo integrada (objetivo S10)

Depende de H0 y H3.

- [ ] 🔴 Botón **iniciar/detener transcripción** (marca entrevista en curso) (RF-AUDIO-001)
- [ ] 🔴 Integrar captura **mic + altavoces** del spike en el flujo real de entrevista (RF-AUDIO-002)
- [ ] 🔴 **Transcripción en vivo** visible durante la llamada (RF-AUDIO-003)
- [ ] 🔴 Flujo de **permisos y selección de dispositivos** dentro de la app (RF-AUDIO-005)
- [ ] 🟡 **Atribución de hablante** (diarización) en la transcripción (RF-AUDIO-004)
- [ ] 🔴 Sostener sesión continua de **≥60 min** sin degradarse ni perder audio (NFR §4.5)

---

## H5 · Asistencia proactiva en tiempo real (objetivo S13) — DIFERENCIADOR

Depende de H4.

- [ ] 🔴 **Análisis continuo y proactivo** de la transcripción por el LLM (sin esperar interacción) (RF-ASIS-001)
- [ ] 🔴 **Sugerencia de siguiente acción**: incidir/pedir detalle vs. continuar (RF-ASIS-002)
- [ ] 🔴 **Justificación ("porqué")**: falta de evidencia concreta (Mom Test) u objetivo no cumplido (RF-ASIS-003)
- [ ] 🔴 **Feedback del tamaño justo**: una sugerencia a la vez, glanceable, sin abrumar (RF-ASIS-004, NFR §4.1)
- [ ] 🟡 **Seguimiento de objetivos en vivo** durante la llamada (RF-ASIS-005)
- [ ] 🟡 **Detección de señales de alarma** (cumplidos/genéricos/futuros) y reconducción a lo concreto (RF-ASIS-006)
- [ ] 🔴 **Control de frecuencia/coste** de llamadas al LLM (análisis por turnos/ventanas, no por palabra) (NFR §4.5, Riesgo #5)
- [ ] 🟡 Feedback in-app (👍/👎) por sugerencia para medir utilidad (KPI #3)

---

## H6 · Resumen + persistencia + reutilización (objetivo S15)

Depende de H5. Cierra el flujo end-to-end.

- [ ] 🔴 **Generar resumen** de la llamada según el note-template configurado (RF-NOTE-001)
- [ ] 🔴 **Persistir la transcripción** completa (RF-NOTE-002)
- [ ] 🔴 Dejar transcripciones/notas **disponibles como contexto** para futuras entrevistas (cierra bucle con RF-GUION-003) (RF-NOTE-003)
- [ ] 🟡 **Consultar y editar** resumen y transcripción (RF-NOTE-004)
- [ ] 🟢 **Exportar** resumen/transcripción a Markdown u otro formato (RF-NOTE-005)

---

## H7 · Pulido, coste/latencia, QA y hardening (objetivo S17)

Depende de H6. MVP listo para usuarios de validación.

- [ ] 🟡 **Búsqueda/navegación** entre discoveries, empresas y entrevistas (RF-APP-005)
- [ ] 🔴 Optimización de **latencia** de la asistencia (objetivo < 3-5 s) (NFR §4.1)
- [ ] 🔴 Medición y control de **coste de IA por entrevista** (NFR §4.5)
- [ ] 🔴 **Aviso de consentimiento de grabación** al usuario (NFR §4.6, Riesgo #8)
- [ ] 🔴 **Tests de usabilidad** de la asistencia en directo (Riesgo #2)
- [ ] 🟡 Degradación elegante si falla la diarización (Riesgo #9)
- [ ] 🔴 Empaquetado/instalador macOS y hardening final

---

## Validación de producto (transversal, en paralelo)

Riesgo #1: el problema se apoya en una fuente única. Validar en paralelo al desarrollo.

- [ ] 🔴 **5-8 entrevistas de validación** a PMs/entrepreneurs ajenos al autor (report §8)
- [ ] 🔴 Obtener **baseline cuantitativo** para los KPIs (tiempos actuales, nº entrevistas/discovery) (PRD §1.3, §6)
- [ ] 🟡 Priorización relativa de los 3 dolores nucleares (carga cognitiva / preguntas por fase / estado del discovery)
- [ ] 🟡 Validar forma de la asistencia (en directo vs. asíncrona) con prototipo wizard-of-oz (Riesgo #2)

---

## Resumen de progreso

| Hito | Total ítems | Hechos |
|------|-------------|--------|
| H0 · Spike | 6 | 5 |
| H1 · Shell | 6 | 6 |
| H2 · CRUD | 9 | 2 |
| H3 · IA guión | 5 | 0 |
| H4 · Transcripción | 6 | 0 |
| H5 · Asistencia | 8 | 0 |
| H6 · Resumen | 5 | 0 |
| H7 · Pulido | 7 | 0 |
| Validación | 4 | 0 |
| **Total** | **56** | **13** |

> Siguiente paso sugerido: `/somo-create-spec` para detallar cada requisito funcional del PRD en specs implementables.
