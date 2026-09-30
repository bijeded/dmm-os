# Design

## Context

See proposal.md (Why) and the specs for the rules.

- The Ingreso lifecycle (`ciclo-ingreso.ts`) holds what each Finanzas row offers (`accionesIngresos`) and what each command accepts (`exigirIngreso`), and both are judged by one `rechazo`. The handler tests pin "offered = accepted" for every Ingreso kind (`handlers.test.ts`, the seeded-rows block) and "every entry goes through `dbAlDia`" for every channel.
- `origenIngreso` already tells `cfdi`, `periodo`, `cotizacion` and `manual` apart. An Ingreso written by Completar con cobro has no Cotización link (Ingreso 884: `cotizacion_id` null), so it is `manual`.
- Amounts are only ever built by `montos()` (and `reembolso()` for Reembolsos) in `dinero.ts`. A USD Ingreso stores pesos plus `monto_original` (the USD total). The rate is derived (`tasaDe`), not stored.
- Generated Ingresos are keyed by `(definicion_id, periodo)`, unique; `generarPeriodos` fills missing keys only. The dates never take part in the key.
- A Proyecto's fecha de fin is written only by `completarProyecto`, `completarConCobro` and `cancelarProyecto`. Editar (`guardarProyecto`) is refused on a cancelado Proyecto (`REGLAS.editar`). `asignacion-costo.ts` is the only other reader.

## Goals / Non-Goals

**Goals:**
- One command that edits an Ingreso in place, with the same "offered = accepted" guarantee as the other row actions.
- Amounts recomputed through the existing money constructors only.

**Non-Goals:**
- No schema change and no migration: every edited value already has a column.
- No generic "patch any column" channel.

## Decisions

### 1. `editar` is an Ingreso lifecycle action, and the lifecycle also says which fields are locked

Add `'editar'` to `AccionIngreso`. `rechazo('editar', …)` refuses a CFDI Ingreso and a *cancelado* one. A new pure function in `ciclo-ingreso.ts`, `bloqueos(i, ctx)`, returns which fields that Ingreso cannot change:

| Ingreso | Locked |
|---|---|
| `manual` (Completar con cobro included) | categoría and IVA once it has Reembolsos |
| `cotizacion`, `periodo` | Proyecto, Contacto; categoría and IVA once it has Reembolsos |
| Reembolso | categoría, IVA, Estado de facturación, Proyecto, Contacto, tipo de cambio |

The row gets `'editar'` from `accionesIngresos` like any action. The form reads the locks, and the command refuses a locked field sent with a new value. The row and the command then agree without re-deriving the table in the renderer.

*Alternative:* one action per field (`cambiarFecha`, `cambiarMonto`…). Rejected: five row buttons for one form, and the same origin checks spread across them.

### 2. One command, `editarIngreso(db, id, cambios, hoy)`, in `movimientos.ts`

It sits beside `nuevoIngreso`, `reembolsar` and the others, and runs in one transaction:
1. `exigirIngreso(db, 'editar', id)` gives the Ingreso and what is left of it after its Reembolsos (`restante`).
2. Refuse any locked field whose value changed.
3. **Fecha:** set `fecha_registro`, and set `fecha_pago` too when it is non-null (*pagado* and Reembolsos). A *pagado* one's fecha must be ≤ `hoy`. `periodo` and `estado` are never written.
4. **Amounts:** recomputed only when the amount, tipo de cambio, categoría or IVA changed, so an unchanged amount keeps its exact stored centavos (no rounding drift on save).
   - Ingreso: `montos(subtotal, { iva, tasaUsd })`, with `tasaUsd` only for a USD one. The subtotal is in USD cents for a USD Ingreso and in centavos otherwise.
   - Floor: the new total in its own currency (`montoEn`) must be ≥ what its Reembolsos gave back (the negated sum of their `montoEn`). This is the existing `restante` arithmetic, and the refusal message is a new one.
   - Reembolso: `reembolso(monto, { de: original, queda: restante(original, otrosReembolsos), tasaUsd: tasaDe(original) })`. The existing constructor already refuses more than is left with `MENSAJE_REEMBOLSO_EXCEDIDO`.
5. **Categoría:** `sin_factura` clears IVA and `estado_facturacion`. `factura` sets `por_facturar` or `facturado`.
6. **Proyecto / Contacto** (manual only): the Contacto comes from the Proyecto, as in `nuevoIngreso`. The Reembolsos pointing at it get the same `proyecto_id` and `contacto_id`, as Asignar proyecto does for a CFDI.

*Alternative:* delete and re-insert. Rejected because it breaks `reembolso_de_id` links and changes ids.

### 3. The USD subtotal shown in the form

The stored original is the USD **total**. For a `sin_factura` Ingreso (no IVA) the USD subtotal is that total. For a `factura` one with IVA it is `montoOriginal − ivaDe(…)` solved back: `round(montoOriginal / 1.16)`, checked against `montos()` giving the same total, and falling back to the total when it does not. Since amounts are only recomputed on change (decision 2.4), a slightly off displayed subtotal is never written unless the owner edits it. This read belongs to `dinero.ts` (`subtotalEn(i, moneda)`), beside `montoEn`.

### 4. IPC: two channels in `contrato.ts`

- `finanzas.ingresoParaEditar(id) → IngresoEditable`: the current values in the Ingreso's own currency (subtotal, tipo de cambio, categoría, conIva, facturado, fecha, proyectoId, contactoId, notas, whether it is a Reembolso) plus its `bloqueos`.
- `finanzas.editarIngreso(id, cambios: IngresoEditado) → void`

Both go through `alDiaDb()` in `handlers.ts` and are added to the handler test's every-entry list.

### 5. UI reuses the Nuevo ingreso form

`NuevoIngreso` becomes a form component with an optional initial value, rendered by `NuevoIngreso` (as today) and a new `EditarIngreso` route (`/finanzas/ingresos/:id/editar`), with a *Guardar* button. Locked fields render disabled. A USD Ingreso shows "Monto (USD, antes de IVA)" and "Tipo de cambio" in place of the peso amount. The *Pagado en esa fecha* checkbox is not shown when editing, since estado is not editable. The Finanzas row gets an **Editar** button when `acciones` includes `'editar'`, and saving returns to Finanzas with its remembered filters and page (see paginacion).

### 6. Fecha de fin: one rule, two ways in

- A pure `exigirFechaFin(p, fecha, hoy)` in `ciclo-proyecto.ts`: estado *completado* or *cancelado*, not empty, ≤ `hoy`, ≥ `fecha_inicio` when set.
- `ProyectoNuevo` gains optional `fechaFin`. `guardarProyecto` writes it only on a *completado* Proyecto, through `exigirFechaFin`. It also checks that an edited `fecha_inicio` is not after an existing `fecha_fin`.
- A *cancelado* Proyecto stays refused by `REGLAS.editar`. A new `AccionProyecto` `'cambiarFechaFin'` (`en: ['completado', 'cancelado']`) and a channel `proyectos.cambiarFechaFin(id, fecha)` let the Ficha of a cancelado Proyecto open a small dialog with only that field.

*Alternative:* allow Editar on cancelado with every other field disabled. Rejected because it weakens `REGLAS.editar` for one field.

## Risks / Trade-offs

- [An edited Ingreso that has a pending *vincular* Sugerencia] → not possible: only CFDI Ingresos carry *vincular* Sugerencias, and those are not editable.
- [Editing a Plan de cobro Parcialidad breaks "adds up exactly"] → accepted by the spec. Completar con cobro already covers a gap.
- [A Reembolso's IVA proportion was taken from the original's amounts at the time; editing the original's amount leaves old Reembolsos in the old proportion] → accepted. Categoría and IVA are locked once Reembolsos exist, so the proportion stays the same kind (with or without IVA).
- [Reimportar desde cero is refused while hand-made records exist] → unchanged. Edits only touch non-CFDI Ingresos, which already block it. An edited fecha de fin of an imported Proyecto is an edit to an imported record, lost the same way (CONTEXT.md, Reimportar desde cero).
- [No history of what was edited] → out of scope (proposal Non-goals). A Respaldo is the way back.

## Migration Plan

None: no schema change. Ship behind nothing. Rollback is reverting the code, since the edited rows stay valid for the old code.
