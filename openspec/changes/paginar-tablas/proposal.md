# Proposal

## Why

Every long table in the app should read 20 rows at a time and open where the owner left it. Right now only Contactos pages its list, and it forgets its page and filters whenever the owner leaves. Cotizaciones (401 rows), Proyectos (133) and the Finanzas tables render every row in one scroll. Opening a record from row 300 and coming back lands at the top with the filters cleared.

## What Changes

- One pager for every long table: 20 rows per page and a footer that always shows `a–b de N` · `Anterior` · `Siguiente`, the one Contactos has today.
- Tables that get it: Contactos, Cotizaciones, Proyectos; in Finanzas, Cobrado, Por cobrar, Costos pendientes, Ingresos del periodo and Costos del periodo; the Lab file list; the Historial on the Ficha del Contacto; Proyectos AI; and on Inicio, Cobros, Costos pendientes, Proyectos en curso, Cotizaciones abiertas and Tareas.
- **BREAKING (UI)**: Contactos goes from 10 rows per page to 20.
- Each table remembers its search, filters and page while the app is open. It opens as it was left, however the owner comes back (header path, sidebar). Finanzas and AI also remember their Periodo, and Finanzas remembers its Por cobrar Actual/Vencida choice. The Historial page is remembered per Contacto.
- Changing a search, filter or Periodo goes back to page 1. Coming back to a table does not.
- Nothing survives a restart. The app opens every table on page 1 with no filters, as today.

## Capabilities

### New Capabilities

- `paginacion`: how long tables page their rows, which tables do, and which of each table's search, filters and page the app remembers while it stays open.

### Modified Capabilities

None. No existing spec states how many rows a table shows or whether its filters persist. Contactos' pager exists only in code and tests. `encabezado-de-seccion` keeps a table's filters with its content, and this change leaves that as it is.

## Non-goals

- Remembering anything across an app restart (no `localStorage`, nothing in the database).
- Loading pages from the main process. The lists are already read whole over IPC, and the renderer slices them.
- A page-size selector, page-number buttons, or jumping to a page.
- Remembering transient UI: an open dialog, the inline Reembolso form, the Lab preview, a half-filled form.
- Paginating short fixed lists: Próximos pagos, Top 10 por valor, Por categoría, AI Suscripciones and Asignación, the Ficha's Archivos, Logs.
- The cramped Cobrado layout in Finanzas (dates and row actions wrapping in the narrow column).

## Terms

Touches Contacto, Cotización, Proyecto, Ficha del Contacto, Ingreso, Costo and Periodo, all as used in CONTEXT.md. It introduces no domain term: a page and the pager are UI, not business vocabulary, so CONTEXT.md is unchanged. No ADR is contradicted.

## Impact

- Renderer only: a shared pager and a remembered-table-state module under `src/renderer/src/components/`, used by `Contactos.tsx`, `Cotizaciones.tsx`, `Proyectos.tsx`, `Finanzas.tsx`, `Lab.tsx`, `FichaContacto.tsx` and `Ai.tsx`.
- No IPC, schema, main-process or migration change.
- Tests: `Contactos.test.tsx` changes its "ten at a time" case. Each covered screen's test file gains pager and remembered-state cases.
