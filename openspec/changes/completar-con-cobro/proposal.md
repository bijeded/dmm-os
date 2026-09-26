# Proposal

## Why

Imported Cotizaciones now carry real Montos (#194), so every old job in `Proyectos/` without a CFDI has a gap to its quote total. The guard keeps refusing Completar until the owner enters the missing Ingresos by hand in Finanzas (#196, parent #191). Completar should record the payment it asks for.

## What Changes

- **Completar con cobro**: when Completar finds a gap, the Ficha del Proyecto opens a dialog instead of refusing. The dialog asks for the **Fecha de pago** (defaults to today) and **¿Con factura?**:
  - The Proyecto's pending Ingresos (from its Plan de cobro) are each marked *pagado* on that date or *incobrable*. No new Ingreso is created for them.
  - For what is still missing after them, *No* records a paid `sin_factura` Ingreso (no IVA) on the Proyecto.
  - *Sí* lists the Contacto's CFDI Ingresos that are on no Proyecto, those whose subtotal matches the Cotización's first, and links the chosen one to the Proyecto. A pending one is marked paid on the date. Any Sugerencia de importación still waiting to *vincular* it is answered. A `factura` Ingreso is created by hand only when the owner says the invoice is not on disk.
  - **The amount is editable.** When less than the gap is received, the rest is recorded as an **Incobrable** Ingreso on the Proyecto.
  - Everything is written in one transaction together with the Proyecto becoming *completado*. The Proyecto completes only when paid + incobrable reaches the Cotización total.
- **Incobrable** becomes a written Ingreso estado. It counts toward a Proyecto being fully paid, but never as income. The rule "which estados count as income" is stated once, next to "when an Ingreso counts" (#168).
- A USD Cotización's gap is in USD. The dialog asks for the tipo de cambio (defaulting to the Cotización's), and each Ingreso keeps its USD amount and rate.
- An Incobrable Ingreso can be deleted from Finanzas like any hand-entered Ingreso (Borrar vs cancelar). A completed Proyecto does not reopen. Its gap shows again as Sin ingresos registrados.
- The guard is unchanged: Completar without the payment is still refused for every Proyecto, imported or not. A Proyecto with no Cotización, or with a `mensual` one, completes as today.

CONTEXT.md terms touched: Proyecto, En curso, Cotización, Ingreso, Plan de cobro, Cobros, Sin ingresos registrados, Sugerencia de importación (*vincular*), Estado de facturación, Borrar vs cancelar, Cancelación con pagos (which already says "uncollectible"). New terms: **Incobrable**, **Completar con cobro**.

ADR-0002 is not contradicted. The guard keeps governing transitions made in the app. This change gives the owner a way to satisfy the guard; it does not exempt anything.

## Capabilities

### New Capabilities
- `proyectos`: completing a Proyecto, including Completar con cobro and the guard that a Proyecto completes only once fully paid.
- `finanzas`: which Ingresos count as income, and how Incobrable Ingresos show and are undone in Finanzas.

### Modified Capabilities
- None. `facturas` and `importacion` keep their requirements: a CFDI Ingreso is still imported the same way, and linking it from the dialog uses the existing *vincular* answer.

## Non-goals

- Relaxing or bypassing the Completar guard for imported Proyectos.
- Reopening a completed Proyecto, or any new Proyecto transition.
- Splitting a pending Ingreso into a paid part and an incobrable part. Each pending Ingreso is paid or incobrable as a whole.
- Unlinking a CFDI Ingreso from a Proyecto.
- Reconciling a hand-made `factura` Ingreso with a CFDI a later Facturas run imports.
- Marking an Ingreso incobrable anywhere other than Completar con cobro.
- `mensual` Cotizaciones, and Proyectos without a Cotización.

## Impact

- `src/main`: `cobranza.ts` (counts Incobrable toward fully paid), `ledger.ts` (one rule for which estados count as income), `finanzas.ts`, `proyectos.ts` (the new command), a new pure module for the Completar con cobro plan, reusing `movimientos.ts` `pagarIngreso` and `sugerencias.ts` `responderEn`.
- `src/shared/contrato.ts` and `dominio.ts`: two new `proyectos` channels (what the dialog offers, and completing with the cobro) and their types.
- `src/renderer`: the Completar con cobro dialog in `FichaProyecto.tsx`.
- No schema change: `incobrable` is already in `ESTADOS_INGRESO`.
- CONTEXT.md: define Incobrable and Completar con cobro, and update Sin ingresos registrados.
