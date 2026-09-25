# Tasks

## 1. Schema

- [ ] 1.1 Add `cfdiParcialidad` (integer, NOT NULL, default 0) to `ingresos` in `src/main/db/schema.ts` and move `ingresos_cfdi_unique` to `(cfdi_uuid, cfdi_parcialidad)`. Run `npm run db:generate` and check that the generated `drizzle/0017_*.sql` survives the rebuild in `src/main/db/migrations.test.ts`: existing rows read 0, and two rows sharing a UUID with different parcialidades are accepted.

## 2. Reading CFDIs

- [ ] 2.1 Check the installed `fast-xml-parser` docs via context7 for how it parses malformed and non-CFDI XML and for how repeated elements come back, before changing `leerCfdi`.
- [ ] 2.2 In `src/main/cfdi.ts`, return a distinct "not a CFDI" result for a parsed document whose root is not `Comprobante`. Keep the error for a Comprobante without a timbre. Pin both in `src/main/cfdi.test.ts` with a CEP-shaped fixture and an unstamped Comprobante.
- [ ] 2.3 Read `MetodoPago`, the relación `04` UUIDs from CfdiRelacionados, and the payments of a tipo `P` complemento (Pagos 1.0 and 2.0: IdDocumento, NumParcialidad, FechaPago, ImpPagado, ImpSaldoInsoluto). Extend `cfdiXml` in `src/main/test-cfdi.ts` with `metodoPago`, `relacionados` and a `pagos` helper, and pin the readings in `src/main/cfdi.test.ts`.

## 3. Money split

- [ ] 3.1 Add the share split to `src/main/dinero.ts`: invoice Montos and payments in, one Montos per payment out, with the paid-off payment (or a *pendiente* remainder) taking the exact remainder of subtotal, IVA, retenciones and USD original. Pin it in `src/main/dinero.test.ts`: the $254,340.44 case with its $9.85 overshoot, an open balance, and a USD invoice paid 400/600.

## 4. Plan

- [ ] 4.1 Create the pure `src/main/importacion/plan-facturas.ts` from design decision 1. It finds cancel folders by path segment with `clave` from `nombres.ts`, finds sustituciones only from CFDIs that are not cancelled, and groups payments by invoice, deduplicated by NumParcialidad, with complementos in cancel folders ignored. Pin it in `src/main/importacion/plan-facturas.test.ts`: accented `Cancelación`, a cancelled complemento with relación `04` that does not knock out its invoice, and the same parcialidad filed twice.

## 5. Applying the plan

- [ ] 5.1 Rework `importarFacturas` (`src/main/importacion/facturas.ts`) into the two passes. Record `noCfdi` paths instead of errors, and count `cancelados` and `sustituidos`. Update `LogImportacion` in `src/shared/dominio.ts`. Pin it in `src/main/importacion/facturas.test.ts`: a CEP file gives no error, and cancelled and replaced CFDIs create no Ingreso or Costo, including a USD one and a received one. Replace the `<html>no</html>` error test with an unstamped-Comprobante one.
- [ ] 5.2 In `comprobantes.ts`, import a PPD invoice with complementos as one re-dated Ingreso or as Parcialidades, with a *pendiente* remainder when a balance is open. Propose the Sugerencia *vincular* per Parcialidad. A PPD invoice with no complemento stays *pagado* on its date. Make every lookup by `cfdi_uuid` read all of the UUID's rows. Pin it in `src/main/importacion/facturas.test.ts`.
- [ ] 5.3 Correct earlier imports per design decision 5. Cancel rows from Facturas canceladas (including a *pagado* one and one whose file is gone), re-date or split untouched PPD rows while copying their links, and leave hand-edited rows and rows with a Reembolso unchanged, reporting them in `cambios`. Pin it in `src/main/importacion/facturas.test.ts`, including that a second run changes nothing and lists no cambios. Pin in `src/main/cobranza.test.ts` that Cobros drops a remainder once a later complemento pays it. Pin in `src/main/proyectos.test.ts` that Sin ingresos registrados reappears when the only covering Ingreso is cancelled.
- [ ] 5.4 Pin in `src/main/importacion/facturas.test.ts` (with `resumenFinanzas`) that a cancelled Ingreso no longer counts in its month, and that a split invoice counts in each payment's month.

## 6. Logs

- [ ] 6.1 Show the counts for cancelled, replaced and not-a-CFDI files on the Facturas line in `src/renderer/src/components/Logs.tsx`, and list `cambios` (cancelados, re-fechados, divididos, sin cambiar) with date and total, in Spanish. Pin it in `src/renderer/src/components/Logs.test.tsx`.

## 7. Docs

- [ ] 7.1 Add **Factura cancelada** and **Parcialidad** (for an invoice) to `CONTEXT.md`. In **Importación**, note that the Facturas run cancels imported Ingresos and Costos from a Factura cancelada, under ADR-0002. Check that no _Avoid_ synonym is used.

## 8. Reviews and checks

- [ ] 8.1 Run `/code-review` on the branch diff and fix what it confirms.
- [ ] 8.2 Run `/security-review`, because this change parses external CFDI XML, walks `Facturas/` and adds a migration. Fix what it confirms.
- [ ] 8.3 Run `npm run typecheck`, `npm run lint` and `npm test`, and quote their results.
