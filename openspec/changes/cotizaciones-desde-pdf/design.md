## Context

- `importarCotizacion` (`src/main/importacion/carpetas.ts`) builds a legacy Cotización from `leerNombreArchivo` alone:
  - `fecha = <anio>-01-01`
  - `categoria: 'other'`
  - `items = []`
  - subtotal, IVA and total all 0
  - `facturacion: 'unica'`
  - `moneda: 'MXN'`
  - `nombre` is the map row's `proyecto`, else the `Cliente - Proyecto` split, else the filename
- The scan is synchronous. `escanearCarpetas` runs one better-sqlite3 transaction per file, and `reimportar` and the Vista previa handlers call it directly. A Vista previa runs it on `conexion.copiaEnMemoria()`.
- Acceptance by import happens in one place, `vincularCotizacion`. A Proyecto folder of the same name sets the oldest unlinked matching Cotización *aceptada* and proposes a *vincular* Sugerencia. `proyectosDeCotizacionesAceptadas` then creates Proyectos for accepted quotes with no folder, copying `c.categoria`.
- Sugerencias since #193:
  - `OpcionSugerencia { id, nombre, sugerida }` and `varias` exist, but `varias` is `false` for every kind
  - `decidir` refuses more than one `elegidas`
  - opciones are worked out when read (`opcionesDe`)
  - The `sugerencias_destino` CHECK requires `contacto_id` only for *fusionar* and `proyecto_id` only for *vincular*, so a kind with neither passes as is
- Payment:
  - `cobro` (`cobranza.ts`) compares paid Ingresos' totals, or their USD originals for a USD quote, with `cotizaciones.total`, and skips `facturacion = 'mensual'`
  - `listarProyectos` derives Sin ingresos registrados from that, for completed Proyectos with a location
- `reimportar` runs the folder scan and then the Facturas run. So no issued CFDI exists yet when a reimported Cotización is linked.
- The text layout of the 401 PDFs was surveyed with macOS PDFKit (issue #194). The app has no PDF library yet.

## Goals / Non-Goals

**Goals:**
- A pure parser from PDF text to what a Cotización needs, pinned by fixtures and checked once against the real 401 files.
- Keep the scan's per-file transactions synchronous. Only the file reading becomes asynchronous.
- "¿Qué aceptó?" reuses #193's opciones and `Eleccion`. Its pre-check is derived when read, so the order of the two runs does not matter.

**Non-Goals:**
- OCR or layout analysis. Text extraction only.
- Storing the extracted text.
- Changing Cotizaciones made in the app, or the quote form.

## Decisions

### 1. `unpdf` for text extraction

`unpdf` (unjs) ships a serverless build of Mozilla's PDF.js with no native dependencies and no worker to configure. It runs under Electron's Node in both the app and Vitest. The call is `getDocumentProxy(new Uint8Array(buffer))`, then `extractText(pdf, { mergePages: true })`, then `pdf.loadingTask.destroy()` (docs checked via context7). `mergePages: true` collapses spaces and keeps line breaks, which is what the parser reads line by line.

*Alternatives*:
- `pdfjs-dist` directly: same engine, but the legacy build and worker setup must be configured by hand in the main process.
- `pdf-parse`: wraps PDF.js too, with a less maintained API.
- Shelling out to macOS PDFKit: it is what the survey used, but it would tie the app to a Swift helper and cannot run in Vitest.

Hardening, since these are external files parsed in the main process:
- No font program becomes JavaScript, the class of CVE-2024-4367. The PDF.js that `unpdf` 1.8.1 bundles (6.1.200) removed that path and its `isEvalSupported` option, and the bundle holds no `eval` or `Function(`. `/security-review` rechecks this when the dependency is bumped.
- Skip files over 10 MB and report them as unreadable. The quotes are one or two pages.
- A PDF that throws, or yields no text, is recorded as unreadable. It never fails the scan.

### 2. Read the PDFs first, then run the synchronous scan

A new `leerPdfsCotizaciones(db, root): Promise<Map<rutaRelativa, TextoPdf | null>>` in `src/main/importacion/pdfs.ts`:
- lists `Cotizaciones/<year>/`
- keeps legacy filenames whose Folio and letter are not yet in the database, since the PDF applies only on first import
- extracts their text sequentially

`escanearCarpetas(db, root, hddRoot, hoy, pdfs)` takes that map and stays synchronous. Callers change as follows:
- `handlers.importacion.carpetas`, `vistaPrevia` and `vistaPreviaDesdeCero` become `async`. The previews read the PDFs against the throwaway copy, after `borrarImportado` for *desde cero*, so a preview reads exactly what the real scan would.
- `reimportar` becomes `async`. It checks the bloqueos, reads the PDFs, and only then takes the Respaldo and removes records. A slow read therefore never leaves the database half-removed.

`contrato.ts` declares no new channel. The existing ones return promises, as `restaurar` already does.

*Alternative*: make `importarCotizacion` async and await inside the loop. Rejected: better-sqlite3 transactions cannot span an `await`, and reading every file up front also keeps a Vista previa from holding a copy open during I/O.

### 3. A pure parser: `leerPdfCotizacion(texto, anio)`

This goes in a new `src/main/importacion/pdf-cotizacion.ts`, next to `leerNombreArchivo`'s module. It returns:

```ts
interface PdfCotizacion {
  fecha: string | null                 // null → fallback, and listed as sin fecha
  lineas: LineaPrecio[]                // every Costo / Costo especial line
  opciones: boolean                    // the text says Opción or Paquete
  asunto: string | null
  proyecto: string | null              // first “…” name on a price line's service line
}
interface LineaPrecio {
  etiqueta: string                     // the service line, trailing colon removed
  monto: number                        // centavos (or US cents)
  moneda: 'MXN' | 'USD'
  mxnImpreso: number | null            // the ($5,000.00 MXN) beside a USD amount
  recurrente: boolean
}
```

Rules, all on text normalized for accents and case where the spec says so:
- **Fecha**: the first `D de mes, AAAA` (or English `Month D, AAAA`) in the text, always in the folder's year. The survey found 8 quotes dated in the year before their folder, 7 of them in January or February. The owner chose the folder's year with the PDF's day and month, and these are listed as `año` in Logs.
- **Price line**: `Costo:`, `Costo especial:` or `Price:` followed by `$`/`US$` and an amount. The rest of the line is checked for the recurring words, `usd`/`Dlls`, and a parenthesized `$… MXN`. PDF.js sometimes emits `$ 300.00 usd mensuales.Costo:`, or `Costo:` alone with the amount on the next line. Both are put back in order first. A `Total: $…` right under a unit price replaces it.
- **Etiqueta**: the first line after the previous price that is not a bullet, starts with a capital (or `eBook`/`eCommerce`), and has a colon after a short label. The nearest line above picked sub-headings such as `Requisitos:`, while the block's first line is its service.
- **Proyecto**: the first `“…”` (or `"…"`) inside an etiqueta.

Everything a Cotización row needs comes from a second pure function, `cotizacionDePdf(pdf, nombreArchivo)`:
- items
- Monto
- facturación
- moneda
- tipoCambio
- categoría
- nombre
- which lines set the Monto
- what is missing

Its money goes through `src/shared/montos.ts` (`totalesCotizacion` with `conIva = false`) and `dinero.convertir`. Neither function touches the database.

*Why not extend `cotizaciones.ts`*: that module reads filenames. The PDF parser is larger, and it is external-input parsing that the security review should see on its own.

### 4. Items: `PartidaCotizacion` gains `recurrente?: boolean`

Each line becomes `{ concepto: etiqueta, categoria, cantidad: 1, precio: monto, recurrente }`.
- `categoria` is the line's own mapped categoría.
- The field is optional, so the Cotizaciones made in the app and the quote form are unchanged.
- `FichaCotizacion` shows a *mensual* tag on recurring items.
- `items` is a JSON column, so no migration is needed.

`PartidaCotizacion` also gains an optional `sinConvertir` (see §6).

*Alternative*: a `periodo: 'mensual' | 'anual'`. Rejected for now. "x 1 año" is ambiguous in the PDFs (a yearly price, or a monthly price for a year), no Ingreso is ever generated from it (ADR-0002), and the full price-line wording stays readable in the concepto.

### 5. Monto and facturación

The "lines setting the Monto" are the one-off lines, or all lines when every one is recurring.
- One line: that line.
- Several lines: their sum, or the minimum when `opciones` is true. `opciones` means a numbered `Opción <n>` / `Paquete <n>` line. The 3 quotes that say "Paquete" name the whole bundle in their Asunto and add up.
- `subtotal = total = Monto` and `iva = 0`.
- `facturacion` is `'mensual'` when those lines are recurring, else `'unica'`.

Why IVA 0: `cobro` compares Ingreso totals with the Cotización total (see issue #194). A 16% IVA on top would keep uninvoiced jobs, which carry no IVA, short forever.

### 6. USD

- Every line in USD: `moneda = 'USD'`, and items and Monto are in US cents. `tipoCambio = mxnImpreso / monto` of the first line that prints one, rounded to 4 decimals. Otherwise it is null.
- Mixed lines: `moneda = 'MXN'`. A USD line counts at its `mxnImpreso`, or at the rate another line prints. One with neither keeps its USD figure, its concepto gains " (USD)", and it is marked `sinConvertir` on the partida. `partidasDelMonto` leaves such a partida out, so the Monto and "¿Qué aceptó?" can both be recomputed from the items. The survey found one such quote (484).

A null tipo de cambio is safe for Sin ingresos registrados. `montoEn` compares USD Ingresos by their original amount, and a USD invoice carries one. An MXN Ingreso typed by hand against a USD quote with no rate counts as 0 until the owner sets the rate. That is the existing behavior for a USD quote.

*Alternative*: the rate of the first USD invoice to the Contacto. Rejected: the invoice may be months later, and the Facturas run happens after the scan.

### 7. Categoría mapping

This is an ordered list of `[categoria, patterns]` in `pdf-cotizacion.ts`, matched on the etiqueta's label part (before `“` or `:`), normalized. `App` is matched as a whole word so that a label like "Apple" does not match. The first price line decides. Without one, the Asunto decides, and without that it is `other`. The mapping is the owner's from issue #194 and awaits their confirmation in review. Changing it only edits this table and its test.

### 8. Project name precedence

In `importarCotizacion`, the Cotización's `nombre` becomes:
1. the map row's `proyecto`
2. the PDF's quoted name
3. the `Cliente - Proyecto` split
4. the filename name

`atribuir` still decides the Contacto from the filename, so it is unchanged. Only the `proyecto` it returns is overridden when the row gave none. `vincularCotizacion` and `repartirNombres` keep working on `nombre`. A quoted name such as “Diseño y desarrollo” may contain ` y ` or `,`, which `nombresDeProyecto` splits on. So `repartirNombres` first compares the whole name with the folder name, and splits only when that fails. No flag is stored.

### 9. "¿Qué aceptó?" as the Sugerencia kind `partidas`

- `ACCIONES_SUGERENCIA` gains `'partidas'`. It has `entidad: 'cotizacion'`, no `proyecto_id` and no `contacto_id`, and it passes the existing CHECK. The schema enum is type-only, so `npm run db:generate` is expected to write no migration.
- **Proposed** in `vincularCotizacion`, after the Cotización is set *aceptada*, when it has two or more lines setting the Monto. The line indices come from `items` again: the lines setting the Monto are recomputed from the items by the same rule as §5, so nothing extra is stored. The motivo is `cotización <folio> aceptada con <n> precios`. A corrected *vincular* keeps the Cotización *aceptada*, so the Sugerencia stays.
- **Opciones** (in `opcionesDe`): `{ id: índice del item, nombre: "<etiqueta> · <monto>" }`, with `varias: true` for this kind. `sugerida` is the pre-check:
  1. Read the Contacto's Ingresos with a `cfdi_uuid`, not *cancelado*, with `fecha_registro >= cotizacion.fecha`, grouped by `cfdi_uuid` (Parcialidades summed). For each invoice take the subtotal in MXN, or for a USD quote `round(montoOriginal × subtotal / total)`, skipping MXN invoices.
  2. Walk the invoices from the earliest. For each, look for the smallest non-empty subset of lines whose sum equals the invoice amount. The lines are at most about 10, so 2^n is enumerated with a cap of 12 lines. Above the cap, only single lines are checked. For MXN the match must be exact. For USD a difference of up to 1% of the amount is accepted, for the rounding in the back-computed subtotal.
  3. The first match is pre-checked. With none, nothing is pre-checked.
- **Visibility**: `pendientes()` leaves out a *partidas* Sugerencia whose Cotización is not *aceptada*, and `responderEn` refuses one. So a rejected *vincular* (Cotización back to *enviada*) or a cancelled Cotización hides it with no extra write. If the Cotización becomes *aceptada* again, it reappears.
- **Answering** (`decidir` / a new `partidas(tx, s, decision)`):
  - `decidir` allows several `elegidas` when the kind is `varias`.
  - `aceptada` with the pre-check, or a `corregida` choice, sets `subtotal = total = Σ elegidas` and `iva = 0`. When nothing was pre-checked, `'aceptada'` alone is refused ("Elige qué aceptó") so the UI must send `elegidas`.
  - `rechazada` writes nothing.
  - No Ingreso, Costo or definition is created (ADR-0002).
- **Aceptar todas** already filters to `vincular`, so it is unchanged. A test pins it.
- **Logs UI**: a `varias` row renders checkboxes preset to the `sugerida` ids. Aceptar is disabled with none checked. It sends `'aceptada'` when the checked set equals the pre-check, else `{ elegidas }`.

*Alternative*: propose "¿Qué aceptó?" for every quote with several lines at import time, accepted or not. Rejected: the owner scoped it to accepted quotes, and 85 of the 401 quotes have several lines.

*Alternative*: store the pre-check when the Sugerencia is proposed. Rejected: during Reimportar desde cero the CFDIs do not exist yet at that point.

### 10. Logs and Vista previa

`LogCarpetas` gains:
- `cotizacionesIncompletas: { folio: string; archivo: string; falta: ('fecha' | 'precio' | 'pdf')[] }[]`
- `nuevos.cotizaciones: { folio: string; fecha: string; monto: number; moneda: Moneda; categoria: Categoria }[]`

Both are filled in `cotizacionesDeDisco` from the parser result. Logs renders both lists, collapsed when long, and a Vista previa shows them like the other `nuevos`.

### 11. `importado`, not items, marks an imported quote

`reimportar.ts` already uses `cotizaciones.importado` (migration `0018` used empty items only as a one-time backfill). Nothing new is needed. A scenario in `reimportar.test.ts` pins that imported Cotizaciones with items do not block.

## Risks / Trade-offs

- [PDF.js text order differs from PDFKit's, so price lines or labels split differently than in the survey] → Task 2.4 runs the parser over the real `Cotizaciones/` folder once and compares its coverage with the issue's table (fecha 396, prices 374 quotes, recurring 102, quoted names 297). The parser is tuned before the scan code is wired.
- [A wrong pre-check from an unrelated invoice of equal amount] → It only pre-checks. The user sees the lines and answers. Invoices before the quote's fecha are ignored.
- [An old *en curso* Proyecto now has a Monto, and *Completar* blocks until paid] → Accepted and tracked in #196.
- [Sin ingresos registrados lights up for many archived jobs] → Intended (issue #194). It clears as the owner enters Ingresos.
- [Scanning 401 PDFs makes Reimportar desde cero slower] → Only unimported Folios are read. The read happens before the Respaldo, and the UI already shows the run as pending.
- [Malicious or malformed PDF in `Cotizaciones/`] → Covered by the hardening in §1. `/security-review` covers the parser and the dependency.
- [The owner changes the categoría mapping in review] → It is one table and one test.

## Migration Plan

- No schema migration is expected. The enum additions are type-only and `items` is JSON. Task 1.1 confirms it with `npm run db:generate`.
- To apply the change to the real data after merge, the owner runs Vista previa desde cero, checks the incomplete-quote list, then runs Reimportar desde cero (which takes its Respaldo). Rollback is Restauración from that Respaldo.

## Open Questions

- How the ~50 `usd` mentions split between all-USD and mixed quotes. Task 2.4's survey reports it, and §6 covers both cases either way.
