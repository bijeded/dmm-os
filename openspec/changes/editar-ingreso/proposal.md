# Proposal

## Why

Correct a payment recorded wrongly, after the fact. Completar con cobro on "La Hora Zero" left its Fecha de pago at the default, today (2026-09-29), so Ingreso 884 ($5,000.01, USD 260.00) counts in September 2026 instead of March 2019, and the Proyecto's fecha de fin is 2026-09-29. No Ingreso can be edited and no fecha de fin can be changed. The only way out is to delete the Ingreso and enter it again, which loses its USD original and leaves the fecha de fin wrong.

## What Changes

- **Editar ingreso**: a new action on every Finanzas Ingreso row that did not come from a CFDI. It opens the Ingreso's fields filled in and saves them in place:
  - fecha, on every such Ingreso; a *pagado* one's fecha de pago moves with it
  - amount, as the subtotal or, for a USD Ingreso, the USD amount and its tipo de cambio; never below what its Reembolsos already gave back
  - categoría (`factura` / `sin_factura`), IVA and Estado de facturación, until it has Reembolsos
  - Proyecto and Contacto, only on a hand-entered Ingreso; its Reembolsos move with it
  - notas
  - a Reembolso: only its amount (within what was paid) and fecha
- Editar ingreso never changes estado: Marcar pagado, Cancelar and Eliminar stay the only ways to change it. A generated Ingreso's periodo never changes.
- **Fecha de fin**: Editar on a *completado* Proyecto shows its fecha de fin and saves it. A *cancelado* Proyecto, which otherwise cannot be edited, allows changing only its fecha de fin.
- Everything derived from these dates and amounts (revenue by period, Cobros, Sin ingresos registrados, Completar availability, Abierto en el mes, Asignación de costo) is read from the corrected records; nothing is stored.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `finanzas`: adds Editar ingreso, which Ingresos offer it and what it may change.
- `proyectos`: adds changing the fecha de fin of a completado or cancelado Proyecto.

## Non-goals

- Editing an Ingreso imported from a CFDI: the invoice and its complementos de pago are its record (ADR-0002), and Asignar proyecto already moves it.
- Changing an Ingreso's estado from Editar ingreso, including putting a *pagado* one back to *pendiente*.
- Changing an Ingreso's currency (MXN to USD or back).
- Editing Costos.
- Changing how Completar or Cancelar date the fecha de fin (still today). The Completar con cobro dialog is unchanged.
- An audit trail of edits.

## Terms

- Introduces **Editar ingreso** (CONTEXT.md).
- Touches **Reembolso** (no longer always dated the day it is recorded), **Parcialidad** (a Plan de cobro's Parcialidades may stop adding up exactly to the total once one is edited), **Completar con cobro** (what it recorded can be corrected), **Abierto en el mes** and **Sin ingresos registrados** (read from the corrected dates and amounts).
- No ADR is contradicted: CFDI Ingresos stay excluded.

## Impact

- `src/main`: a new command next to `movimientos.ts`, a new `editar` action in `ciclo-ingreso.ts`, the Reembolso and amount rules in `dinero.ts`, `proyectos.ts` (fecha de fin in `guardarProyecto`, and a cancelado Proyecto's own path), `ciclo-proyecto.ts`.
- `src/shared`: `contrato.ts` (a `finanzas.editarIngreso` channel and what it reads to fill the form), `dominio.ts` (`AccionIngreso`, the edit payload, `ProyectoNuevo.fechaFin`).
- `src/renderer`: `Finanzas.tsx` (row action), `NuevoMovimiento.tsx` (the form, reused for editing), `NuevoProyecto.tsx` and `FichaProyecto.tsx` (fecha de fin), routes.
- No schema change and no migration.
