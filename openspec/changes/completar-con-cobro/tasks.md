# Tasks

## 1. Which Ingresos count

- [x] 1.1 Add `cuentaComoIngreso` (`pendiente | pagado`) and `saldaCotizacion` (`pagado | incobrable`) to `src/main/ledger.ts` beside `fechaIngreso`. Make `finanzas.ts` `cuentaIngreso` use the first. Verify in `src/main/finanzas.test.ts` that an `incobrable` Ingreso (MXN and USD) adds nothing to revenue, IVA, the chart, Cobrado, Cobranza or Cobros, but is still listed in `ingresos` with estado `incobrable`
- [x] 1.2 Make `cobranza.ts` `cobro` compute `faltante` from `saldaCotizacion` Ingresos, while `cobrado` stays paid-only. Verify in `src/main/cobranza.test.ts`: $8,000 pagado + $1,000 incobrable on a $9,000 Cotización is `pagadoCompleto`; USD 900 + USD 100 on a USD 1,000 quote likewise; a `mensual` quote and no quote are unchanged
- [x] 1.3 Verify in `src/main/ai.test.ts` that an `incobrable` Ingreso on a Proyecto AI is not in Ingreso AI
- [x] 1.4 Verify in `src/main/proyectos.test.ts` that Sin ingresos registrados clears when paid + incobrable reaches the total, and shows again after the incobrable Ingreso is deleted (`borrarIngreso`), with the Proyecto still `completado`

## 2. Completar con cobro in main

- [x] 2.1 Declare `OpcionesCobro` and `CobroAlCompletar` in `src/shared/dominio.ts`, and `proyectos.opcionesCobro` / `proyectos.completarConCobro` in `src/shared/contrato.ts`. Verify with `npm run typecheck`
- [x] 2.2 Write `opcionesCobro` in `src/main/completar-con-cobro.ts`: pending Ingresos, the gap after them in the Cotización currency, subtotal/total/tipo de cambio, and CFDI candidates. Candidates are grouped by UUID, on this Contacto, on no Proyecto, not cancelled, same currency, subtotal matches first, then newest. Verify in `src/main/completar-con-cobro.test.ts`, including that a CFDI already on a Proyecto, a cancelled one and a USD one for an MXN quote are left out
- [x] 2.3 Write the pure `planCobro` in the same module. It covers sin factura, con factura (link), factura fuera de disco (IVA inside the total, balancing exactly), partial amount → Incobrable rest, pending Ingresos as Cobrado/Incobrable, and USD via `montos(…, { tasaUsd })`. It refuses a future fecha, an amount ≤ 0 or above the gap, a missing or non-positive tipo de cambio for USD, and a CFDI not among the candidates. Verify each case and refusal in `src/main/completar-con-cobro.test.ts`
- [x] 2.4 Write `completarConCobro` in `src/main/proyectos.ts`. In one transaction it applies the plan, pays pending Ingresos with `pagarIngreso(tx, id, fecha)`, links the CFDI and answers its pending *vincular* Sugerencias via `responderEn(tx, s, { elegidas: [proyectoId] })`, then runs `exigirProyecto('completar', …)` on the fresh `estadoCobro` and sets `completado` + `fechaFin`. Verify in `src/main/proyectos.test.ts`: Lukka's $9,000 sin factura example; linking a CFDI creates no Ingreso and records the Sugerencia *aceptada*/*corregida*; a refused answer rolls back every write (the guard is judged again inside the same transaction); a cancelled Proyecto is refused
- [x] 2.5 Verify in `src/main/proyectos.test.ts` that plain `completarProyecto` still refuses any Proyecto with a gap, imported or made in the app, with `MENSAJE_SIN_PAGAR`
- [x] 2.6 Wire both channels in `src/main/handlers.ts` through `alDiaDb()`, checking the payload shape at the boundary, and expose them in the preload. Verify in `src/main/handlers.test.ts` (the Al día entry list included) and `src/main/ipc.test.ts`
- [x] 2.7 Verify in `src/main/importacion/facturas.test.ts` that a Facturas run over the same XML after linking creates no second Ingreso and asks no new *vincular* for it

## 3. The dialog

- [x] 3.1 In `src/renderer/src/components/FichaProyecto.tsx`, enable Completar when `falta` is set and open a `role="dialog"` Completar con cobro dialog (following `FormContacto.tsx`). It has Fecha de pago, pending Ingresos as Cobrado/Incobrable, ¿Con factura?, the CFDI list with "La factura no está en Facturas/Emitidas", the editable amount with the Incobrable rest shown, and a tipo de cambio for USD. It shows main's refusals in place and writes nothing on close. Verify in `src/renderer/src/components/Proyectos.test.tsx` (where the FichaProyecto tests live): sin factura MXN, USD with rate, con factura link, invoice not on disk, partial amount, pending Ingresos, future fecha, main's refusal, close without writing
- [x] 3.2 Run the app and complete an imported Proyecto with a gap through the dialog. Check Proyectos, Finanzas and Inicio afterwards (ask before using browser automation)

## 4. Domain docs

- [x] 4.1 Update `CONTEXT.md`: define **Incobrable** (settles a Cotización, never income, deleted in Finanzas) and **Completar con cobro**. Amend **En curso** and **Sin ingresos registrados** (paid + Incobrable). Align **Cancelación con pagos**'s "uncollectible" with Incobrable. Verify by reading the diff

## 5. Review and checks

- [x] 5.1 Run `/code-review` on the branch diff and fix what it confirms
- [x] 5.2 Run `/security-review`, since the change touches `src/shared/contrato.ts`, `src/main/handlers.ts` and the preload, and fix what it confirms
- [x] 5.3 Run `npm run typecheck`, `npm run lint` and `npm test`, and confirm all three pass
