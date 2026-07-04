# Plan de implementación — SPEC-013: crear entrevista y asignar template

> Generado por subagente Plan y aprobado por el orquestador (2026-07-04). Contrato: specs/SPEC-013-crear-entrevista.md. getInterview existe; main fija status draft; main/preload/db intactos.

## 1. Datos
- useInterviews(companyId) (calco useContacts): create (SIN status) → append + "Entrevista creada"; update con patch de los 3 campos (null limpia; NUNCA enviar status ni campos H3/H4) → "Cambios guardados"; remove → "Entrevista eliminada"; !ok → toast.error + return.
- Templates: useInterviewTemplates() UNA vez a nivel de página (filas + Selects + resolución de nombres = 1 fetch); fallo del fetch → Select solo "Sin template" (degradación).

## 2. InterviewFormDialog
Calco ContactFormDialog: key con interview.id, Enter=submit, foco al Título sin select, placeholder `Discovery con ${companyName}`, trim → "Campo requerido" sin bridge. Dos Selects con sentinel 'none' ("Sin contacto"/"Sin template"); template con fase entre paréntesis vía PHASE_LABELS.

## 3. UI
- CompanyDetailPage: sección Entrevistas bajo Contactos (heading+Nueva entrevista; List con Link título → .../interviews/:id + Badge secondary STATUS_LABELS + muted [contacto, template].filter(Boolean).join(' · ') + menú; empty MessagesSquare "Aún no hay entrevistas"+"Crear primera entrevista"; skeletons; dialogs fuera del menú con setTimeout(0); AlertDialog "Se eliminarán permanentemente «título» y sus notas.").
- InterviewDetailPage: Promise.all(getInterview,getCompany) en .then; useContacts+useInterviewTemplates para nombres (fallbacks "Sin contacto"/"Sin template"); Volver → empresa; h1+Badge; fila muted empresa·contacto·template; sección Guión con empty "Aún no hay guión" + "La generación con IA llegará en la siguiente fase"; error → "Volver a Discoveries".
- App.tsx: ruta .../interviews/:interviewId.

## 4. statusLabels.ts
Record<InterviewStatus,string> completo: draft 'Borrador' (contractual) + provisionales Preparada/Grabada/Resumida comentados como no contractuales (los revisan sus specs).

## 5. AC→cambio
14 ACs mapeados (tabla del plan).

## 6. Breakage presupuestado: CERO
mockApi ya da defaults a listInterviews/listInterviewTemplates; "Acciones"[0] sigue siendo el primero existente; matching exacto de nombres evita colisiones ("Crear" vs "Crear primera entrevista"). Solo warnings act() nuevos.

## 7. Orden, validación, riesgos
Orden: statusLabels → useInterviews → InterviewFormDialog → sección en CompanyDetailPage → InterviewDetailPage → ruta → literales. Validación: lint+typecheck+test (0 rojos) + humo dev.
Riesgos: dropdown→dialog (mitigador); key del form con id; patch sin status; Link no anidado en interactivos; refs borradas → fila omite nombre/detalle fallback (documentar); sentinels 'none'.
