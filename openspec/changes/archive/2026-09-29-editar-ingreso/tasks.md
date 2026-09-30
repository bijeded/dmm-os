# Tasks

## 1. Money and lifecycle rules

- [x] 1.1 Add `subtotalEn(i, moneda)` to `src/main/dinero.ts`, the Ingreso's subtotal in its own currency, falling back to the total when the IVA split does not round-trip (design decision 3). Verify with cases in `src/main/dinero.test.ts`: MXN, USD `sin_factura`, USD `factura` with IVA.
- [x] 1.2 Add `'editar'` to `AccionIngreso` and `bloqueos(i, ctx)` to `src/main/ciclo-ingreso.ts` (design decision 1): refuse CFDI and *cancelado*, and lock fields by origin and by Reembolsos. Verify in `src/main/finanzas.test.ts` that `accionesIngresos` offers `'editar'` on manual, Completar con cobro, Plan de cobro, periodo, Incobrable and Reembolso rows, and not on a CFDI row.
- [x] 1.3 Add `exigirFechaFin` and the `'cambiarFechaFin'` action (`completado`, `cancelado`) to `src/main/ciclo-proyecto.ts`. Verify in `src/main/ciclo-proyecto.test.ts`: refused en curso, after today, before fecha de inicio, and empty.

## 2. Commands

- [x] 2.1 Implement `editarIngreso` in `src/main/movimientos.ts` for fecha: sets `fecha_registro`, sets `fecha_pago` when it is set, *pagado* not after today, `periodo` and `estado` untouched. Verify in `src/main/finanzas.test.ts`: Ingreso 884's case moves its revenue from 2026-09 to 2019-03, a generated Ingreso keeps its periodo and a later Al día adds no second one, a Reembolso counts on its new fecha, and Incobrable and *pendiente* keep no fecha de pago.
- [x] 2.2 Extend `editarIngreso` for amounts: MXN subtotal, USD amount plus tipo de cambio, recomputed only on change, floor at what was refunded, Reembolso amount through `reembolso()`. Verify in `src/main/finanzas.test.ts` with the spec's scenarios: $8,000 → $8,500; USD 260 → 250 at 19.2308 = $4,807.70; rate-only change; below-refunded refused; Reembolso $2,000 → $4,000 allowed and → $8,000 refused; USD Reembolso at the original's rate; an unchanged save leaves stored centavos identical.
- [x] 2.3 Extend `editarIngreso` for categoría, IVA, Estado de facturación and notas, and for Proyecto and Contacto on manual Ingresos, with Reembolsos following. Refuse a changed locked field. Verify in `src/main/finanzas.test.ts`: `factura` → `sin_factura` leaves *Por facturar*; categoría locked with a Reembolso; Proyecto move carries the Reembolso; a Plan de cobro Ingreso refuses a new Proyecto; estado never changes.
- [x] 2.4 Add `fechaFin` to `ProyectoNuevo` and write it in `guardarProyecto` for a completado Proyecto, refusing a fecha de inicio after an existing fecha de fin. Add `cambiarFechaFin(db, root, id, fecha, hoy)` in `src/main/proyectos.ts`. Verify in `src/main/proyectos.test.ts`: La Hora Zero to 2019-03-15, a cancelado Proyecto through `cambiarFechaFin` only (Editar still refused), an imported completado Proyecto with none gets one, and no estado or Ingreso changes.
- [x] 2.5 Verify in `src/main/asignacion-costo.test.ts` that a Proyecto AI whose fecha de fin moves from 2026-09-29 to 2019-03-15 is not Abierto en el mes from April 2019 on.
- [x] 2.6 Verify the derived figures follow edits in `src/main/proyectos.test.ts` and `src/main/cobranza.test.ts`: Sin ingresos registrados appears at $8,000 and clears at $9,000, a reduced pending Parcialidad changes Por cobrar and the Completar con cobro gap, and a USD Cotización compares the edited USD amount.

## 3. IPC

- [x] 3.1 Declare `finanzas.ingresoParaEditar`, `finanzas.editarIngreso` and `proyectos.cambiarFechaFin` in `src/shared/contrato.ts`, with `IngresoEditable` and `IngresoEditado` in `src/shared/dominio.ts`. Wire them in `src/main/handlers.ts` through `alDiaDb()`. Verify `src/main/handlers.test.ts` lists them in the every-entry Al día check and that "offered = accepted" covers `'editar'` for every seeded Ingreso kind.

## 4. UI

- [x] 4.1 Turn the Nuevo ingreso form in `src/renderer/src/components/NuevoMovimiento.tsx` into a form with an optional initial value and add the `EditarIngreso` route (`/finanzas/ingresos/:id/editar`) in `src/renderer/src/routes.tsx`: locked fields disabled, USD amount plus tipo de cambio for a USD Ingreso, no *Pagado en esa fecha*, *Guardar* returns to Finanzas. Verify in `src/renderer/src/components/Finanzas.test.tsx`: the form opens filled in for a USD `sin_factura` Ingreso, and closing without saving calls no edit.
- [x] 4.2 Add the **Editar** row action in `src/renderer/src/components/Finanzas.tsx` when `acciones` includes `'editar'`. Verify in `src/renderer/src/components/Finanzas.test.tsx` that a CFDI row shows none and a manual row opens the edit route.
- [x] 4.3 Show **Fecha de fin** in Editar Proyecto (`src/renderer/src/components/NuevoProyecto.tsx`) for a completado Proyecto, and a *Cambiar fecha de fin* dialog on the Ficha of a cancelado one (`src/renderer/src/components/FichaProyecto.tsx`). Verify in `src/renderer/src/components/Proyectos.test.tsx`: the field is absent en curso, the dialog saves the date, and closing it changes nothing.

## 5. Domain docs

- [x] 5.1 Update `CONTEXT.md`: add **Editar ingreso**. Amend **Reembolso** (its fecha and amount can be corrected), **Parcialidad** (an edited one may stop adding up), **Completar con cobro** (what it recorded, and the fecha de fin, can be corrected) and **Reimportar desde cero** (an edited fecha de fin of an imported Proyecto is lost the same way). Verify by reading the diff against the spec terms.

## 6. Review and checks

- [x] 6.1 Run `/code-review` on the branch diff and fix what it confirms.
- [x] 6.2 Run `/security-review`, since the change adds IPC channels (`contrato.ts`, `handlers.ts`) that write to the database, and fix what it confirms.
- [x] 6.3 Run `npm run typecheck`, `npm run lint` and `npm test`; all pass.
