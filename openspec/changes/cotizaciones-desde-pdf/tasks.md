# Tasks

## 1. Setup

- [x] 1.1 Add `unpdf` to `package.json` dependencies (`npm install unpdf`). Pin in `src/main/importacion/pdfs.test.ts` that a minimal PDF built inside the test is extracted, under Electron's Node, to text holding its `Costo: $ 3,000.00` line (design.md §1). Run `npm test -- src/main/importacion/pdfs.test.ts` and confirm it passes.
- [x] 1.2 In `src/shared/dominio.ts`:
  - add `'partidas'` to `ACCIONES_SUGERENCIA`
  - add an optional `recurrente` to `PartidaCotizacion`
  - add `cotizacionesIncompletas` and `nuevos.cotizaciones` to `LogCarpetas` (design.md §4, §9, §10)

  Run `npm run db:generate` and confirm it writes no migration. If it writes one, check in `src/main/db/migrations.test.ts` that it survives a rebuild under ADR-0003. Confirm `npm run typecheck` passes.

## 2. PDF parser (pure)

- [x] 2.1 Create `src/main/importacion/pdf-cotizacion.ts` with `leerPdfCotizacion(texto, anio)`, starting with the fecha (design.md §3). Pinned in `src/main/importacion/pdf-cotizacion.test.ts` on text fixtures written in the template's layout:
  - `29 de octubre, 2021` → 2021-10-29
  - accented and uppercase month names, and `setiembre`
  - a December date filed under the next year is kept
  - `1 de enero, 2021` filed under 2022 → `null`
  - no date line → `null`
- [x] 2.2 Price lines in `leerPdfCotizacion`: `Costo:` and `Costo especial:`, the amount, `usd`, the printed `($… MXN)`, the recurring words, a price split across two lines, the etiqueta (nearest non-bullet line ending in `:`), `Opción` / `Paquete`, the Asunto, and the first `“…”` name. Pinned in `pdf-cotizacion.test.ts` with one fixture per case.
- [x] 2.3 `cotizacionDePdf(pdf, nombreArchivo)` in the same module (design.md §4–§7). Pinned in `pdf-cotizacion.test.ts`:
  - **Items**: one per line, quantity 1, with `recurrente` set.
  - **Monto** for each case: one line; the sum of several; the lowest with Opción; a one-off line plus a recurring line (Monto from the one-off, *pago único*); only recurring lines (*mensual*); no line (0, listed as sin precio).
  - **Currency**: all-USD with a printed MXN amount (tipo de cambio 19.2308), all-USD without one (null), and mixed lines (MXN, a USD line without MXN left out of the Monto).
  - **Categoría**: each mapping rule, in order ("Web App" → app, "Plataforma Web" → app, "Sitio Web" → website), "App" matched only as a whole word, the Asunto fallback, and `other`.
  - **Faltantes**: `fecha`, `precio`.
- [x] 2.4 Survey the parser against the real `DMM OS/Cotizaciones/` with a script in the session scratchpad. The script is not committed and reads the files only. Report its coverage next to issue #194's table:
  - fecha: 396
  - price lines: 374 quotes
  - recurring: 102
  - quoted names: 297
  - line-count distribution
  - how the `usd` quotes split between all-USD and mixed

  Tune the parser, adding a fixture to `pdf-cotizacion.test.ts` for each layout fixed, until the counts match or each gap is explained. Record the final counts in the PR description.

## 3. Reading the PDFs

- [x] 3.1 `leerPdfsCotizaciones(db, root)` in `src/main/importacion/pdfs.ts` (design.md §2). It reads only legacy files whose Folio and letter are not yet imported. It skips files over 10 MB as unreadable, turns any extraction error or empty text into `null`, and destroys each document proxy. Pinned in `pdfs.test.ts` with a temp `Cotizaciones/` folder, removed in `afterEach`:
  - an imported Folio is not read
  - a corrupt file yields `null` without throwing
  - an oversized file yields `null`
  - new-format files are not read

## 4. Import

- [x] 4.1 `importarCotizacion` in `src/main/importacion/carpetas.ts` takes the parsed PDF and writes fecha, items, subtotal and total, `iva = 0`, facturación, moneda, tipo de cambio and categoría, falling back to today's values when the PDF is `null`. Pinned in `src/main/importacion/escaneo.test.ts`:
  - a dated MXN quote
  - the 346 undated-template case
  - a damaged PDF importing like before, while the other files import
  - a USD quote
  - a re-scan leaving an imported Cotización unchanged, even after it was edited
- [x] 4.2 Project name precedence: the map row's `proyecto`, then the quoted name, then the split, then the filename (design.md §8). `repartirNombres` tries the whole name before splitting. Pinned in `escaneo.test.ts`:
  - 308 / 320 "3 Moon Wishes": 308 linked, 320 *enviada* and named "3 Moon Wishes"
  - the map row wins over the quoted name
  - Korova: the quoted name overrides the split, and the Contacto still comes from the split
  - no quoted name gives the same result as before
  - a quoted name containing " y " links to its folder
- [x] 4.3 `escanearCarpetas` takes the PDF map and fills `cotizacionesIncompletas` (`fecha`, `precio`, `pdf`) and `nuevos.cotizaciones`. Pinned in `escaneo.test.ts`, which also checks that a Vista previa on a copy lists them and leaves the database unchanged.
- [x] 4.4 Make the callers async: `reimportar` in `src/main/importacion/reimportar.ts` reads the PDFs after the bloqueos check and before the Respaldo, and so do `handlers.importacion.carpetas`, `vistaPrevia` and `vistaPreviaDesdeCero` in `src/main/handlers.ts`. Update the doc comments in `src/shared/contrato.ts` if they describe a sync result. Pinned in:
  - `reimportar.test.ts`: refused before any PDF is read; imported Cotizaciones with items do not block
  - `handlers.test.ts`: `importacion.carpetas()` resolves to a log with the PDF's values; `vistaPreviaDesdeCero()` reads PDFs for the removed Folios
- [x] 4.5 ADR-0002 and derived facts. Pinned in `src/main/proyectos.test.ts`:
  - an imported quote linked *aceptada* (MXN, *pago único*) creates no Ingreso, Costo or definition, nor does a recurring-only one (*mensual*)
  - Sin ingresos registrados shows for a completed Proyecto whose paid Ingresos are below the new Monto, and clears once an Ingreso reaching it is entered
  - the same for a USD quote paid by a USD invoice
  - never for a *mensual* one

## 5. "¿Qué aceptó?"

- [x] 5.1 `vincularCotizacion` proposes a `partidas` Sugerencia when the Cotización it sets *aceptada* has two or more lines setting its Monto (design.md §9). Pinned in `escaneo.test.ts`: proposed for two lines, not for one, not for one one-off line plus a recurring one, and not twice on a re-scan.
- [x] 5.2 Opciones and pre-check in `opcionesDe` in `src/main/sugerencias.ts`, with `varias: true`. Pinned in `src/main/sugerencias.test.ts`:
  - a single line matches
  - a set of lines matches ($10,000 + $2,500 = $12,500)
  - Parcialidades are summed per `cfdi_uuid`
  - invoices dated before the quote and cancelled invoices are ignored
  - the earliest invoice decides
  - the smallest set wins
  - a USD quote matches a USD invoice by its amount before IVA and ignores MXN invoices
  - with no match, nothing is pre-checked
  - an invoice added after the proposal pre-checks on the next read
- [x] 5.3 Answering. `decidir` accepts several `elegidas` for a `varias` kind. A new `partidas` branch sets `subtotal = total = Σ` and `iva = 0`. Pinned in `sugerencias.test.ts`:
  - the pre-check gives *aceptada*
  - another set gives *corregida*
  - Rechazar leaves the provisional Monto
  - an empty or duplicated `elegidas`, or an index not offered, is refused with nothing changed
  - `'aceptada'` with nothing pre-checked is refused
  - a USD answer is in US cents
  - no Ingreso, Costo or definition is created
  - `estadoCobro` loses its faltante after an answer that the paid Ingresos cover
- [x] 5.4 Visibility. `pendientes()` leaves out a `partidas` Sugerencia whose Cotización is not *aceptada*, and `responderEn` refuses one. Pinned in `sugerencias.test.ts`:
  - hidden after its *vincular* is rejected, and after the Cotización is cancelled
  - still shown after its *vincular* is corrected
  - `aceptarVincular` leaves it pending
- [x] 5.5 IPC. Pinned in `src/main/handlers.test.ts`: `importacion.responder(id, { elegidas: [0, 2] })` on a `partidas` Sugerencia returns the remaining pending ones, and the Cotización's total is the sum of lines 0 and 2.

## 6. UI

- [x] 6.1 In `src/renderer/src/components/Logs.tsx`, render a `varias` Sugerencia as checkboxes preset to its `sugerida` opciones, titled "¿Qué aceptó?" (design.md §9). Pinned in `src/renderer/src/components/Logs.test.tsx`:
  - Aceptar with the pre-check calls `responder(id, 'aceptada')`
  - with another set, it calls `responder(id, { elegidas })`
  - Aceptar is disabled with none checked
  - Rechazar calls `responder(id, 'rechazada')`
  - single-choice rows are unchanged
- [x] 6.2 In `Logs.tsx`, list `cotizacionesIncompletas` (Folio, file, "sin fecha" / "sin precio" / "PDF ilegible") after a scan and in both Vista previa modes, and show `nuevos.cotizaciones` with fecha, Monto, moneda and categoría in the previews. Pinned in `Logs.test.tsx`.
- [x] 6.3 In `src/renderer/src/components/FichaCotizacion.tsx`, mark recurring items *recurrente* (a line may be monthly, yearly or quarterly). Pinned in `src/renderer/src/components/Cotizaciones.test.tsx`.

## 7. Domain docs

- [x] 7.1 Update `CONTEXT.md`:
  - **Sugerencia de importación**: a fourth kind, *partidas* ("¿Qué aceptó?"). It asks which prices of an accepted legacy Cotización were accepted, and several may be chosen. It is pre-checked from a matching invoice and shown only while its Cotización is *aceptada*.
  - **Importación**: the folder scan reads a legacy Cotización's PDF on first import (fecha, items, Monto before IVA with IVA 0, categoría, project name, currency).

  Verify that the wording matches the spec delta.

## 8. Review and checks

- [ ] 8.1 Run `/code-review` on the branch diff and fix what it confirms.
- [ ] 8.2 Run `/security-review`, since the change parses external PDFs in the main process, adds a dependency, reads files under `Cotizaciones/`, and widens what `importacion.responder` accepts. Fix what it confirms.
- [ ] 8.3 Run `npm run typecheck`, `npm run lint`, `npm test` and `openspec validate cotizaciones-desde-pdf --strict`. All pass.
