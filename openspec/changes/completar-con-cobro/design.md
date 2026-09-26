# Design

## Context

See proposal.md, Why. Current state:

- `ciclo-proyecto.ts` `rechazoProyecto` refuses `completar` with `MENSAJE_SIN_PAGAR` unless `ContextoProyecto.pagadoCompleto`. `proyectos.ts` `completarProyecto` only checks and sets `completado` + `fechaFin`.
- `cobranza.ts` `cobro` builds `EstadoCobro`. `faltante` is the Cotización total minus paid Ingreso **totals** (`montoEn`, in USD for a USD quote), and `falta` also counts pending Ingresos. It ignores `incobrable`.
- `incobrable` is in `ESTADOS_INGRESO` and `NOMBRES_ESTADO_INGRESO`, but nothing writes it. Readers today:
  - `finanzas.ts` `cuentaIngreso` already keeps only `pendiente | pagado`. The Ingresos list (line 236) excludes only `cancelado`.
  - `ai.ts` `ingresosAi` and `contactos.ts` read `pagado` / `pendiente` explicitly. `tipoCambioReciente` reads any USD Ingreso's rate, and an Incobrable one's rate is a real rate.
  - `asignacion-costo.ts` reads no Ingresos. The issue's worry about it does not apply.
- `movimientos.ts` `nuevoIngreso` is MXN only and has no USD path. `pagarIngreso` always dates the payment `hoy`.
- A CFDI Ingreso reaches a Proyecto only through `sugerencias.ts` `vincular`, which sets `proyectoId`. `responderEn` answers a Sugerencia inside a transaction.
- `FichaProyecto.tsx` shows Completar disabled while `f.falta` is set. Dialogs are hand-rolled `role="dialog"` elements (`FormContacto.tsx`); there is no dialog primitive in `ui/`.

## Goals / Non-Goals

**Goals:**
- Completing and recording the payment happen as one atomic command.
- One rule, in one place, for which Ingreso estados count as income, and another for which ones settle a Cotización.
- The guard stays the only gate. The new command satisfies it rather than skipping it.

**Non-Goals:**
- A general "marcar incobrable" action in Finanzas.
- A reusable dialog primitive. This dialog follows `FormContacto`'s pattern.

## Decisions

### 1. Two estado rules in `ledger.ts`, beside `fechaIngreso`
Add `cuentaComoIngreso(i)` (`pendiente | pagado`) and `saldaCotizacion(i)` (`pagado | incobrable`) next to the #168 "when an Ingreso counts" rule. `finanzas.ts` `cuentaIngreso` builds on the first. `cobranza.ts` `cobro` uses the second for `faltante`, while `cobrado` stays paid-only, so the Ficha's Cobrado never includes Incobrable.
*Alternative*: a `!== 'cancelado' && !== 'incobrable'` filter at each reader. Rejected: it is the scattered rule #168 removed.

### 2. The Finanzas Ingresos list keeps showing Incobrable
The issue suggests excluding Incobrable wherever `cancelado` is excluded. The list at `finanzas.ts:236` sums nothing, and the Ficha del Proyecto lists no Ingresos, so it is the only place to see and delete an Incobrable Ingreso. It stays, labelled. Every *sum* goes through `cuentaComoIngreso`.

### 3. A pure planner, then one transaction
New module `src/main/completar-con-cobro.ts`:
- `opcionesCobro(db, proyectoId)` returns what the dialog shows. That is the `EstadoCobro`, the pending Ingresos, the remaining gap after them (in the Cotización currency), the Cotización subtotal, total and `tipoCambio`, and the CFDI candidates. Candidates are grouped by `cfdiUuid`: same Contacto, `proyectoId IS NULL`, not `cancelado`, same currency as the quote. They are ordered with subtotal-equal-to-the-Cotización-subtotal first, then newest.
- `planCobro(opciones, cobro)` is pure. It validates the dialog's answer (`CobroAlCompletar`: fecha, per-pending decision, `conFactura`, amount, tipo de cambio, chosen `cfdiUuid` or `facturaFueraDeDisco` + `conIva`) and returns the writes. Those are ids to pay, ids to mark incobrable, rows to insert (built with `dinero.montos`, passing `tasaUsd` for USD), the CFDI to link, and pending Sugerencias to answer. It throws the dialog's refusals.
- `completarConCobro(db, root, id, cobro, hoy)` in `proyectos.ts` runs the plan in one `db.transaction`. It then re-checks `estadoCobro` inside the transaction, and `exigirProyecto('completar', …)` there throws (rolling everything back) if the plan left a gap. Then it sets `completado`. The guard itself is unchanged.
*Alternative*: let the renderer call `nuevoIngreso`, `pagarIngreso` and `completar` in sequence. Rejected: a failure midway leaves paid Ingresos on an unfinished Proyecto.

### 4. Amount semantics: what the bank saw
The dialog amount is a **total** in the Cotización currency, matching how `faltante` is computed. For `sin_factura` and Incobrable, subtotal = total (no IVA). For the hand-made `factura` fallback with IVA on, subtotal = round(total / 1.16), and IVA = total − subtotal is passed as a number to `montos`, so it balances exactly. USD goes through `montos(…, { tasaUsd })`, so the Ingreso keeps `montoOriginal` and its rate is `tasaDe`.

### 5. Paying on a date
`pagarIngreso(db, id, hoy)` already takes the payment date as its third argument. Completar con cobro passes the Fecha de pago there, and it stays guarded by `exigirIngreso('pagar')`. Marking incobrable is a direct update inside the planner's transaction, allowed only on a `pendiente` Ingreso of this Proyecto. `AccionIngreso` gets no new action (a Non-goal).

### 6. Linking a CFDI answers its Sugerencia
Linking sets `proyectoId` on every non-cancelled Ingreso with that `cfdiUuid`, and pays the pending ones on the Fecha de pago. Each pending `vincular` Sugerencia for one of those Ingresos is answered through `responderEn(tx, s, { elegidas: [proyectoId] })`, so it goes through the same `vincular` as Logs. An Ingreso Sugerencia's opciones are every Proyecto of the Ingreso's Contacto, and candidates are filtered to this Proyecto's Contacto, so this Proyecto is always an opción. `decidir` records *aceptada* when it was the guess and *corregida* otherwise.

### 7. Channels
In `contrato.ts` `proyectos`:
- `opcionesCobro: canal<[id: number], OpcionesCobro>()`
- `completarConCobro: canal<[id: number, cobro: CobroAlCompletar], FichaProyecto>()`

`completar` stays as it is. The Ficha enables Completar when `falta` is set and opens the dialog instead of calling it. The handler validates the payload shape at the boundary; `planCobro` validates the meaning.

### 8. Undo: no reopen
Deleting the `sin_factura` or Incobrable Ingreso goes through the existing `borrarIngreso` (origen `manual`, no Reembolso). There is no Proyecto transition out of `completado` today, and adding one is out of scope. The honest signal is the derived Sin ingresos registrados, which already reads completed Proyectos with a gap.

## Risks / Trade-offs

- [An app Cotización's total includes IVA, so "No factura" defaults to recording the IVA-inclusive amount as uninvoiced revenue] → the amount is editable, and the rest goes Incobrable. The dialog shows the Cotización subtotal beside the total.
- [A hand-made `factura` Ingreso double-counts once the real CFDI is imported] → it is offered only behind "La factura no está en Facturas/Emitidas". A later *vincular* Sugerencia can be rejected. Reconciling them is a Non-goal.
- [Marking a pending CFDI Parcialidad paid by hand may disagree with a later complemento de pago] → `conciliar` already leaves an edited invoice *intacto* and reports it in Logs. This is the same as marking it paid in Finanzas today.
- [Pending Ingresos can't be split] → each is Cobrado or Incobrable as a whole. This is recorded as a Non-goal.

## Migration Plan

No schema change and no migration. `incobrable` is already an allowed value of `ingresos.estado`. No existing row is `incobrable`, so the new counting rule changes no current figure.
