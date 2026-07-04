# Plan de implementación — SPEC-011: empresas y contactos

> Generado por subagente Plan y aprobado por el orquestador (2026-07-04). Contrato: specs/SPEC-011-empresas-contactos.md.

## 0. Enlaces externos
Verificado: `src/main/index.ts:60-63` ya tiene setWindowOpenHandler → shell.openExternal + deny. Main/preload INTACTOS. Anchors con target=_blank rel=noreferrer.

## 1. Dialogs: dos específicos (CompanyFormDialog + ContactFormDialog), no genérico
Tipado del contrato > genérico config-driven. Patrón DiscoveryNameDialog (form interno remontado por key —incluir company.id/contact.id en la key—, Enter=submit nativo, trim "Campo requerido" sin bridge, onOpenAutoFocus preventDefault+focus SIN select — divergencia deliberada). Helper compartido `normalizeOptional` ('' → null) en lib/.

## 2. Hooks
useCompanies(discoveryId) / useContacts(companyId), patrón useDiscoveries: loading|error|ready, setState en .then. Toasts: "Empresa creada"/"Cambios guardados"/"Empresa eliminada" · "Contacto creado"/"Cambios guardados"/"Contacto eliminado". Orden: createdAt asc (alta), sin re-sort en edición. Patches de edición envían los 3 campos (null para limpiar). Mutación !ok → toast.error y return antes de tocar estado.

## 3. UI
- DiscoveryDetailPage: sección Empresas real (heading+Nueva empresa; List con Link nombre → detalle + ExternalIconLink Globe/Linkedin condicionales + DropdownMenu Editar/sep/Eliminar; empty "Aún no hay empresas"+"Añadir primera empresa" SIN secundario; skeletons discovery|empresas; dialogs FUERA del menú con setTimeout(0); AlertDialog cascada literal «nombre» y contactos y entrevistas).
- CompanyDetailPage (nueva): getCompany(companyId) (existe en DbApi — más directo que list+find); Volver → /discoveries/:discoveryId; h1 + fila muted con enlaces con hostname visible (hostnameOf con try/catch); sección Contactos (useContacts): List nombre+posición muted+Linkedin+menú; empty Users "Aún no hay contactos"+"Añadir primer contacto"; dialogs/AlertDialog "Eliminar contacto" simple; skeletons; error/not-found → "Volver a Discoveries".
- App.tsx: ruta discoveries/:discoveryId/companies/:companyId. Sidebar/TopBar sin cambios (prefijo verificado).

## 4. AC→cambio
20 ACs mapeados (tabla del plan).

## 5. Breakage presupuestado
EXACTAMENTE 1 rojo: tests/unit/discoveries/DiscoveryDetailPage.test.tsx AC-15 SPEC-010 (secundario derogado, líneas 59-61). AC-16/17 sobreviven; layout intacto; posibles warnings act(). QA remapea AC-15 como derogado parcial por SPEC-011 AC-02.

## 6. Orden, validación, riesgos
Orden: lib → hooks → dialogs+ExternalIconLink → DiscoveryDetailPage (cae el rojo presupuestado) → CompanyDetailPage+ruta → literales. Validación: lint+typecheck+test (1 rojo exacto) + humo dev (Enter, opcionales null, iconos condicionales, navegador del sistema, cascada, id inválido, persistencia).
Riesgos: dropdown→dialog (mitigador SPEC-010); foco sin select; key del form con id; normalización '' ↔ null en ambos sentidos; anchor hermano del Link (no anidar); no tocar main/preload/db ni literales ajenos.
