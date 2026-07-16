# Empresas y contactos globales + grupos de entrevistas (2026-07-16)

Petición directa del humano. Rama de trabajo: `moisesvilar/company-contact-entities`.
Reestructura el modelo de entidades del dominio (SPEC-006/010/011/013) y el flujo de
creación de entrevistas (SPEC-013/014/017/020).

## Problema actual

El flujo vigente es: discovery → empresa (dentro del discovery) → contacto (dentro de
la empresa) → entrevista (dentro de la empresa, con UN contacto y un template).

Problemas detectados:

1. **Las empresas no se pueden reutilizar entre discoveries.** Si la empresa X existe
   en el discovery A y se quiere usar en el discovery B, hay que crearla de nuevo,
   duplicando información (y sus contactos).
2. **Una entrevista solo admite un contacto** como participante; no cubre entrevistas
   a varias personas de la misma empresa.

## Propuesta (literal del humano, refinada)

- **Nueva sección «Empresas» en el sidebar**: CRUD global de empresas (nombre,
  website, LinkedIn, contexto), independiente de los discoveries.
- **Dentro de cada empresa, sección «Contactos»**: CRUD de contactos de esa empresa
  (nombre, LinkedIn, posición, contexto).
- **Sección «Discoveries» en el sidebar**: CRUD de discoveries con nombre y un nuevo
  campo **`objetivos`**.
- **Dentro de cada discovery, «Grupos de entrevistas»**: CRUD de grupos con nombre,
  campo **`objetivo`**, un **template de preguntas** que se aplica a todas las
  entrevistas del grupo y un **template de notas** que se aplica por defecto.
- **Dentro de cada grupo, las entrevistas**: se crean asignando **una empresa y N
  contactos de esa empresa**. El guión se genera como hasta ahora, personalizado para
  la empresa y TODOS los contactos (nombre y contexto de ambos). Con transcripción,
  se generan las notas: por defecto con el template de notas del grupo, pero se
  pueden **regenerar seleccionando otro template** para esa entrevista en particular.

## Decisiones de diseño (humano, 2026-07-16)

1. **Migración automática de `db.json`** (schemaVersion 2→3): las empresas pasan a
   globales tal cual (sin deduplicar posibles duplicadas entre discoveries), cada
   discovery con entrevistas recibe un grupo «General» que las contiene, y
   `Interview.contactId` migra a `contactIds = [contactId]`. Cero pérdida de datos.
2. **Las capturas siguen existiendo sin grupo**: `Interview.interviewGroupId` es
   nullable; la captura cuelga directamente del discovery y se puede asignar a un
   grupo después (patrón `assignInterviewCompany` de SPEC-020).
3. **Borrar una empresa con entrevistas asociadas → SET NULL**: la entrevista conserva
   transcripción, guión y notas pero queda sin empresa ni contactos (coherente con las
   capturas sin empresa). Los contactos de la empresa se borran en cascada.
4. **Una empresa por entrevista**: se asigna una empresa y N contactos de ESA empresa
   (invariante del repositorio). No se admiten participantes de varias empresas.

## Cambios de modelo derivados

- `Company`: pierde `discoveryId` (entidad global). `Contact` no cambia de forma
  (sigue colgando de `companyId`).
- `Discovery`: gana `objetivos` (texto libre).
- Nueva entidad `InterviewGroup`: `id`, `discoveryId`, `name`, `objective`,
  `interviewTemplateId`, `noteTemplateId`, timestamps. Cascada: borrar discovery →
  borra grupos; borrar grupo → decisión en spec (las entrevistas conservan datos).
- `Interview`: gana `interviewGroupId: string | null`; `contactId` →
  `contactIds: string[]` (invariante: todos pertenecen a `companyId`); `companyId`
  deja de estar restringida al discovery (la empresa es global).
- Templates: el template de preguntas y el de notas del grupo son los defaults de sus
  entrevistas; la nota es regenerable con otro `noteTemplateId` puntual.

## Impacto conocido

- **Persistencia** (SPEC-006): migración 2→3 en `store.ts` (ya existe precedente 1→2),
  repositorio, cascadas e integridad referencial nuevas.
- **UI/navegación** (SPEC-009/010/011): sidebar con secciones Empresas y Discoveries;
  las empresas dejan de listarse dentro del discovery.
- **Creación de entrevista** (SPEC-013) y **guión IA** (SPEC-014): selector de
  empresa + multiselector de contactos; prompt con N contactos.
- **Capturas** (SPEC-020/032/033): `assignInterviewCompany` pasa a asignar empresa
  global + N contactos (+ opcionalmente grupo).
- **Notas** (SPEC-017): template por defecto del grupo + regeneración con override.
- **Búsqueda global** (SPEC-018): empresas/contactos fuera del árbol del discovery.
- **Enriquecimiento IA de contexto** (H8, web + LinkedIn MCP): se conserva tal cual,
  solo cambia dónde viven las entidades.
