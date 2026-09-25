# Proposal

## Why

The Facturas run counts money that never arrived and dates money on the wrong day. It imports every XML under `Facturas/`, including 13 issued invoices the user filed under `Canceladas/`-style folders (about $133k subtotal, e.g. a $104,000 Appleseed invoice from 2019-08-28). It also imports an invoice that another CFDI replaced (relación `04`), which double-counts a $13,200 job, and it marks a PPD invoice paid on the day it was issued even when its complementos de pago show it was paid in parts months later. Six bank CEP receipts sit among the invoices and come back as errors on every run, and nothing in the app can clear them.

Intent: **the Facturas run records an invoice's money only if the invoice stands, and on the days it was actually paid.**

## What Changes

- A CFDI filed under a folder whose name starts with "cancel" (Canceladas, cancelados, Cancelaciones, Cancelación…) is not imported. It is counted in the run's log.
- A CFDI that another CFDI in the folders replaces (CfdiRelacionados with TipoRelacion `04`) is not imported. Only a CFDI the run keeps can replace another, so a cancelled complemento that points at a valid invoice does not knock it out.
- An Ingreso or Costo already imported from a CFDI that is now known to be cancelled or replaced becomes *cancelado* on the next run. It stays visible and stops counting.
- A PPD invoice with complementos de pago in the folders becomes one paid Ingreso per payment, each dated on its FechaPago. The invoice's own amounts are split between the payments, so together they add up exactly to the invoice. An invoice already imported as a single Ingreso is split on the next run.
- A PPD invoice with no complemento keeps today's behavior: it is paid on its own date.
- An XML that is not a CFDI at all (e.g. a CEP bank receipt) is skipped and counted, not reported as an error. A CFDI without a timbre is still an error.
- Logs shows the new counts and lists the Ingresos and Costos the run cancelled or split.

## Capabilities

### New Capabilities
- `facturas`: what the Facturas run imports from `Facturas/Emitidas` and `Facturas/Recibidas`. Covers cancelled and replaced CFDIs, complementos de pago and parcialidades, files that are not CFDIs, and what Logs reports.

### Modified Capabilities
_None._ `importacion` covers the folder scan. Its only Facturas requirement (a Contacto's RFC links issued CFDIs) is unchanged.

## Terms

- Touches: **Importación**, **Ingreso** / **Costo**, **Montos**, **Borrar vs cancelar**, **Cobros**, **Cobranza vencida**, **Sin ingresos registrados**, **Sugerencia de importación**.
- Introduces: **Factura cancelada** (a CFDI filed under a cancel folder, or replaced by relación `04`) and **Parcialidad** (one payment of a PPD invoice recorded as its own Ingreso). The CONTEXT.md entry for Plan de cobro already uses "parcialidad" for one of several pending Ingresos that add up to a Cotización total. This change gives the word the same meaning for an invoice.

## ADRs

This change contradicts none of them. ADR-0002 exempts imported history from the lifecycle guards, and the Facturas run relies on that when it cancels a *pagado* Ingreso it imported. In the app, "Solo se cancela un ingreso pendiente" still applies. Splitting an Ingreso into Parcialidades adds a column, so the migration runs under ADR-0003 and after a Respaldo.

## Non-goals

- Asking the SAT whether a CFDI is cancelled. The folder the user filed it in, and relación `04`, are the only signals.
- A clean-slate re-import, or correcting a Sugerencia de importación instead of only accepting or rejecting it. Both belong to a later change about the folder scan.
- Complementos de pago for received invoices (Costos). None exist in the folders; a PPD Costo is still paid on its date.
- Notas de crédito (tipo `E`), which stay ignored as today.
- Moving or renaming files in `Facturas/`.

## Impact

- `src/main/cfdi.ts`: reads `MetodoPago`, CfdiRelacionados and complementos de pago, and tells "not a CFDI" apart from "a CFDI without a timbre".
- `src/main/importacion/facturas.ts`, `comprobantes.ts`: the run reads every file first, then decides what to import, cancel or split.
- `src/main/db/schema.ts` and a new migration: `ingresos.cfdi_parcialidad`, and the CFDI unique index moves to `(cfdi_uuid, cfdi_parcialidad)`.
- `src/shared/dominio.ts` (`LogImportacion`) and `src/renderer/src/components/Logs.tsx`: new counts and lists.
- Real data on the first run after this change: 14 Ingresos become *cancelado*, 2 Ingresos are split into 2 Parcialidades each, and 2 are re-dated to their payment day.
