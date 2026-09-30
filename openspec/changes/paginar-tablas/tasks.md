# Tasks

## 1. Shared pieces

- [x] 1.1 Add `src/renderer/src/components/recordado.ts` with `useRecordado<T>(clave, inicial)` and `olvidarRecordado()` (design D1). Verify in `src/renderer/src/components/recordado.test.tsx`:
  - A value set before unmount comes back after remount
  - Two keys don't share a value
  - Switching the key on a mounted component returns the new key's value, or `inicial`
  - `olvidarRecordado()` brings back `inicial`
- [x] 1.2 Add `src/renderer/src/components/Paginacion.tsx` with `POR_PAGINA = 20`, `usePaginacion(filas, clave, filtros)` and `<PiePaginacion>`, rendering today's Contactos footer markup (design D2, D3). Verify in `src/renderer/src/components/Paginacion.test.tsx`:
  - 45 rows show 20, then `21–40 de 45`, then `41–45 de 45` with `Siguiente` disabled
  - 3 rows show `1–3 de 3` with both buttons shown and disabled
  - 0 rows show no range and both buttons disabled
  - Changing `filtros` shows page 1
  - Remounting with the same `filtros` keeps the page
  - Filters that change and change back show page 1
  - Rows shrinking under the page show the last page with rows, and it stays there when they grow back
  - An empty (loading) list keeps the page

## 2. Section lists

- [x] 2.1 Move Contactos onto `usePaginacion`/`PiePaginacion` and `useRecordado` (búsqueda, estado), dropping its inline pager and `setPagina(0)` calls. Verify in `src/renderer/src/components/Contactos.test.tsx`:
  - Rewrite `pages the table ten at a time` as twenty at a time
  - Leaving on page 2 with a search, then remounting, shows the same search and page
  - `olvidarRecordado()` runs in `beforeEach`
- [x] 2.2 Page Cotizaciones and keep búsqueda, Contacto, Año, Categoría and Estado. Kept Contacto/Año values missing from the options count as Todos (design D6). Verify in `src/renderer/src/components/Cotizaciones.test.tsx`:
  - 21+ Cotizaciones page at 20
  - Picking a filter on page 2 shows page 1
  - Filters and page survive a remount
  - A kept Contacto no longer in the list shows Todos and every row
- [x] 2.3 Page Proyectos and keep búsqueda, Contacto, Año, Categoría, Estado and `Sin ingresos registrados`, with the same D6 fallback. Verify in `src/renderer/src/components/Proyectos.test.tsx`:
  - It pages at 20
  - Ticking `Sin ingresos registrados` shows page 1
  - Filters and page survive a remount

## 3. Finanzas

- [x] 3.1 Keep Periodo, búsqueda and Por cobrar's Actual/Vencida with `useRecordado`, and give `TablaIngresos`/`TablaCostos` `clave` and `filtros` props so Cobrado, Por cobrar, Costos pendientes, Ingresos del periodo and Costos del periodo each page on their own (design D4). Verify in `src/renderer/src/components/Finanzas.test.tsx`:
  - Each table shows its own footer, even with 3 rows
  - Paging Ingresos del periodo leaves Cobrado on its page
  - Switching to Vencida resets only Por cobrar
  - Changing the Periodo resets all five
  - A row action (`Pagado`) reloads and keeps the page, or falls back to the last page with rows
  - Periodo, search and pages survive a remount

## 4. Lab, Historial, Proyectos AI

- [x] 4.1 Page the Lab file list and keep its folder, search text and page. On mount, pick the kept folder if `api.carpetas()` still lists it, else the first, and re-run a kept search through `buscar` (design D5). Verify in `src/renderer/src/components/Lab.test.tsx`:
  - More than 20 files page at 20
  - Picking another folder shows page 1
  - Remounting restores the folder, search and page
  - A kept folder no longer on disk falls back to the first
- [x] 4.2 Page the Historial on the Ficha del Contacto, keeping its filter and page under `historial.<contactoId>`. Verify in `src/renderer/src/components/FichaContacto.test.tsx`:
  - More than 20 movements page at 20
  - Changing the filter shows page 1
  - Page 2 on one Contacto doesn't carry to another, whose Historial opens on page 1 with Todo
  - Returning to the first Contacto shows page 2
- [x] 4.3 Page Proyectos AI and keep the AI Periodo and its filters, with the D6 fallback. Verify in `src/renderer/src/components/Ai.test.tsx`:
  - More than 20 Proyectos page at 20
  - A filter or Periodo change shows page 1
  - Filters, Periodo and page survive a remount

## 5. Review and final checks

- [x] 5.1 Run `/code-review` on the branch diff, and fix what it confirms
- [x] 5.2 Run `/security-review`, since the change touches the Lab screen (folder and search reads through `window.dmm.lab`), and fix what it confirms
- [x] 5.3 Run `npm run typecheck`, `npm run lint` and `npm test`. All three must pass
