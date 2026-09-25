## Why

A legacy Cotización is imported from its filename only, so all 401 have the date `<year>-01-01`, the categoría `other`, no items and no Monto. The PDF is never opened. Every PDF from 2017 to 2026 uses one template with extractable text, so the importer can read the real quote.

## What Changes

The folder scan reads each legacy Cotización's PDF and imports its fecha, items, Monto, categoría and project name from it. Where the PDF lacks a field, it falls back to what the filename gives today.

- **Fecha**: the `Ciudad de México, D de <mes>, AAAA.` line. With no parseable date, or a date outside the folder's year and the year before, it stays `<year>-01-01`.
- **Items**: every `Costo:` / `Costo especial:` price line becomes an item, labeled with the service line above it (`Video “Curso” : Elaboración de video`) and marked one-off or recurring (`mensual`, `mensuales`, `por mes`, `x 1 año`, `por 1 año`, `anual`).
- **Monto** (subtotal and total, `iva = 0`, since every quote price is before IVA):
  - one one-off line: that line
  - several one-off lines: their sum, or the lowest when the PDF says *Opción* or *Paquete*
  - an **accepted** quote with several lines: that provisional Monto, plus a new **"¿Qué aceptó?"** Sugerencia de importación. It shows one checkbox per line, and several may be checked. Lines are pre-checked when an issued CFDI to the same Contacto has a subtotal equal to one line or to a combination of lines. The answer sets the Monto.
  - only recurring lines: facturación `mensual`, with the recurring amount as the Monto. No Ingresos or definitions are created (ADR-0002).
- **Categoría** from the service label. **The owner needs to confirm this mapping:**
  - `ecommerce`: eCommerce, Tienda en línea
  - `app`: Web App, App, Plataforma
  - `website`: Sitio web, Website, Portal, Landing, Webmaster, Rediseño
  - `marketing`: Campaña, Marketing, Redes Sociales, Newsletter
  - `other`: eBook, Video, Capacitación, and anything else

  The rules are checked in that order, so "Web App" is `app` and "Plataforma Web" is `app`.
- **Project name**: the first `“…”` name on a price line becomes the Cotización's `nombre`. That name decides which folder the quote links to. A map row's `proyecto` still wins. The `Cliente - Proyecto` split only applies when the PDF gives no `“…”` name.
- **USD**: a quote whose price lines are all in `usd` imports as a USD Cotización. Its tipo de cambio comes from the MXN amount the PDF prints beside the USD one (`$ 260.00 USD ($5,000.00 MXN)`). When no MXN amount is printed, the tipo de cambio is left empty.
- **Logs and Vista previa** list the Cotizaciones whose PDF gave no fecha or no price, including PDFs that could not be read.
- A new dependency on a PDF text library (`unpdf`, a serverless build of Mozilla's PDF.js). PDF text is extracted before the scan's transactions, so the scan becomes asynchronous. Re-escanear carpetas, Vista previa, Vista previa desde cero and Reimportar desde cero wait for it.

This is change [2] of the import-quality epic (#191), issue #194. Its blocker, #193 (`sugerencias-con-eleccion`), has shipped and been archived.

Once Montos exist, **Sin ingresos registrados** appears for accepted, completed jobs with no matching Ingresos. That is intended: it clears once the owner enters the uninvoiced Ingresos (or uses #196 Completar con cobro).

CONTEXT.md terms touched: Cotización, Folio, Importación, Sugerencia de importación (a fourth kind, *partidas*, shown as "¿Qué aceptó?", the first whose opciones may be several), Sin ingresos registrados, Vista previa, Mapa de nombres, Subtotal / IVA. No new term beyond the Sugerencia kind.

This change contradicts no ADR. ADR-0002 still holds: an imported accepted Cotización, and an answered "¿Qué aceptó?", create no Ingresos, Costos or definitions.

## Non-goals

- New-format quotes (`<YYMMDD>-DMM<folio>-<Proyecto>.pdf`) keep importing from their filename. They are the app's own template, not the legacy one.
- Setting up the recurring services that are still active. The owner does that by hand in Finanzas.
- Letting *Completar* go through for old *en curso* jobs that now have a Monto. That is #196.
- Attributing `Proyectos/` folders through the Cotización that names them. That is #195.
- Giving folder-imported Proyectos the categoría of their linked Cotización. A Proyecto created for an accepted quote with no folder already copies it.
- Reading costs, terms, Stack or Atención/Asunto into other fields. Only fecha, items, Monto, categoría, project name and currency are read.
- Fetching a tipo de cambio from outside the PDF.
- Changing an already imported Cotización on a later re-scan. As with the Mapa de nombres, the PDF applies when the Folio is first imported. Existing records get the PDF data through Reimportar desde cero.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `importacion`:
  - adds requirements for reading a legacy Cotización's PDF (fecha, items, Monto, categoría, project name, USD), for the "¿Qué aceptó?" Sugerencia, and for listing quotes the PDF could not fully read in Logs and Vista previa
  - modifies the `Cliente - Proyecto` split requirement so the PDF's `“…”` name comes before the split

## Impact

- `package.json`: adds `unpdf`.
- `src/main/cotizaciones.ts` (or a new pure module `src/main/importacion/pdf-cotizacion.ts`): parses extracted text into fecha, lines, Monto, categoría, project name and currency. The parser is pure and pinned on text fixtures.
- `src/main/importacion/carpetas.ts`: `importarCotizacion` takes the parsed PDF. `vincularCotizacion` proposes "¿Qué aceptó?".
- `src/main/importacion/escaneo.ts`: reads the PDFs up front (async), and adds the incomplete quotes to `LogCarpetas`.
- `src/main/importacion/reimportar.ts`, `src/main/handlers.ts`: await the scan.
- `src/main/sugerencias.ts`: the *partidas* kind: its opciones, its CFDI-based pre-check, `varias: true`, answering, and closing it when its Cotización's *vincular* is rejected.
- `src/shared/dominio.ts`: `ACCIONES_SUGERENCIA` gains `partidas`. `PartidaCotizacion` gains an optional `recurrente`. `LogCarpetas` gains `cotizacionesIncompletas`.
- `src/main/db/schema.ts`: enum-only changes (no CHECK), so no migration is expected.
- `src/renderer/src/components/Logs.tsx`: checkboxes for a `varias` Sugerencia, and the incomplete-quote list. `FichaCotizacion.tsx`: marks recurring items.
- `CONTEXT.md`: the Sugerencia de importación and Importación entries.
