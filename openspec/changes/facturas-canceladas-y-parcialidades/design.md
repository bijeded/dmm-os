# Design

## Context

Today `importarFacturas` walks `Facturas/Emitidas` and `Facturas/Recibidas` and hands each XML to `importarCfdi` on its own. Each file is decided without knowing the others. A cancellation (the folder), a sustitución (another CFDI's CfdiRelacionados) and a payment date (a separate tipo `P` complemento) all live outside the invoice's own file, so the current design cannot see any of them. `leerCfdi` throws the same "El archivo no es un CFDI" error for a CEP receipt as for a broken invoice. `ingresos.cfdi_uuid` is unique, so one CFDI can hold only one Ingreso.

Real data this must handle: 464 issued and 36 received XMLs; 16 cancel folders, all named `Canceladas` by the user before this change; 4 relación `04` links, 2 of them from cancelled complementos pointing at valid invoices; 6 CEP receipts; 12 complementos, some filed twice; one invoice whose complementos add up to $9.85 more than it.

## Goals / Non-Goals

**Goals:**
- Decide each CFDI with every file in the folders known.
- Keep the Facturas run idempotent: a second run over the same files changes nothing.
- Correct rows imported by earlier runs without touching anything the user edited.

**Non-Goals:**
- A general "reconcile" of hand-entered Ingresos against CFDIs.
- Parcialidades for Costos.

## Decisions

### 1. The run reads everything first, then decides
`importarFacturas` becomes two passes. Pass 1 reads every XML into a `Lectura`: its path, whether it sits under a cancel folder, and either "not a CFDI" or the parsed CFDI with its `metodoPago`, its relación `04` UUIDs and its payments (for tipo `P`). A pure module, `src/main/importacion/plan-facturas.ts`, turns the readings into a plan:
- `canceladas`: UUIDs in a cancel folder, plus UUIDs named by relación `04` from a CFDI that is not itself cancelled
- `pagos`: per invoice UUID, payments from complementos that are not cancelled, deduplicated by NumParcialidad and ordered by it
- the list of CFDIs to import, which excludes cancelled ones

Pass 2 applies the plan in `comprobantes.ts`, one transaction per CFDI as today, and then cancels already-imported rows whose UUID is in `canceladas`, including UUIDs whose file is no longer in the folders.

*Alternative:* keep one pass and look up related files on demand. Rejected, because a sustitución can point backwards or forwards in the walk order.

### 2. Cancel folder = any path segment starting with "cancel"
The check covers every segment between `Facturas/<Emitidas|Recibidas>` and the file. It normalizes case and accents with the same key function the folder scan uses (`nombres.ts`). A prefix match catches Canceladas / cancelados / Cancelaciones / Cancelación / cancelada, so the user's current `Canceladas` naming and any older variant both work. A misspelling (e.g. `canelados`) is not matched; the NumParcialidad dedup still neutralizes a duplicate complemento filed there.

*Alternative:* substring "cancel" anywhere in the path. Rejected: a client or project name could contain it.

### 3. `ingresos.cfdi_parcialidad`, not a second table
Add `cfdi_parcialidad integer NOT NULL DEFAULT 0`: 0 means the whole CFDI, and n its nth Parcialidad. The unique index becomes `(cfdi_uuid, cfdi_parcialidad)`. Every existing row gets 0, so the migration changes no data. A *pendiente* remainder takes the next number after the last payment. `releerSiImportado` and every other lookup by `cfdi_uuid` must read every row for the UUID, not `.get()` just one.

*Alternatives:* a `pagos_cfdi` table (another concept to maintain, and Finanzas would still need Ingresos per payment); a nullable column with an expression index (NULLs are distinct in SQLite, which breaks idempotence unless the index uses `ifnull`; the NOT NULL default is simpler). Costos keep their current index.

### 4. Shares come from the invoice, the last payment takes the remainder
The shares live in a pure function in `dinero.ts` (reused by the plan), next to `repartir` and `reembolso`. Each payment's share is `ImpPagado / invoice Total`, both in the invoice's own currency; `ImpPagado` is already in MonedaDR. Subtotal, IVA, retenciones and the USD original are each multiplied by the share and rounded to the centavo. The payment whose `ImpSaldoInsoluto` is 0 takes the exact remainder of each part. If no payment reaches 0, a *pendiente* remainder takes it. The parts always add up to the invoice, even when the complementos overshoot (the $9.85 case). Each part goes through `montos()` so the total check still holds.

*Alternative:* use `ImpPagado` as the Parcialidad's total directly. Rejected: the parts would not add up to the invoice, and IVA and retenciones have no amount per payment in a CFDI 3.3 complemento.

### 5. Correcting earlier imports only touches rows that are still "as imported"
A row counts as untouched when its subtotal, IVA, retenciones and total equal what the import stores for that CFDI (or that Parcialidad), its `fecha_pago` equals the CFDI's date (or the Parcialidad's FechaPago), and no Reembolso points at it.
- **Re-date:** the row stays whole (parcialidad 0), and only `fecha_pago` changes.
- **Split:** the row becomes Parcialidad 1 with its share. New rows copy `contacto_id`, `proyecto_id`, `cotizacion_id`, `notas`, `categoria`, `estado_facturacion` and `fecha_registro`.
- **Later complementos:** Parcialidades already *pagado* are never rewritten. The *pendiente* remainder is updated in place into the new payment, and a new remainder is added only if a balance is still open.
- **Cancel:** set `estado = 'cancelado'` directly, whatever the current estado. This bypasses `cancelarIngreso`, whose guard only accepts *pendiente*, and relies on ADR-0002. Reembolsos are the one exception, because cancelling would orphan money already given back.

Rows that fail the check are reported, not changed.

### 6. "Not a CFDI" is a reading, not an error
`leerCfdi` gains a distinct result for a parsed document whose root is not `Comprobante`: the run records its path under `noCfdi` and keeps going. A `Comprobante` without a timbre still throws. The existing test that feeds `<html>no</html>` and expects an error moves to the new outcome, and a new test pins a Comprobante without a timbre as the error case. Before relying on how `fast-xml-parser` reports malformed input, check the installed version's docs via context7.

### 7. Sugerencias for fresh Parcialidades
A PPD invoice imported fresh, with several payments, guesses its Proyecto once. It proposes the same Sugerencia de importación *vincular* for each Parcialidad, since each is its own Ingreso and is accepted or rejected on its own. Split rows copy the link they already had, with no new Sugerencia.

### 8. Log shape
`LogImportacion` gains `cancelados`, `sustituidos` and `noCfdi: string[]`, plus `cambios` with four lists: `cancelados`, `refechados`, `divididos` and `intactos`, each `{ entidad, id, fecha, total, motivo }`. `Logs.tsx` renders the counts on the existing summary line and the lists under the run, in Spanish copy.

## Risks / Trade-offs

- [A file moved into a cancel folder by mistake cancels a real Ingreso] → It is listed in Logs as cancelled on that run. Moving the file back does not un-cancel it, because un-cancelling is out of scope. The user reactivates it by hand, and the log line tells them which record.
- [Rounding the shares moves a centavo between Parcialidades] → The remainder rule keeps the invoice total exact, which is what KPIs read.
- [Changing the unique index needs a table rebuild] → Generated by drizzle-kit, run under ADR-0003 after a Respaldo, and covered by `migrations.test.ts`.
- [A misspelled cancel folder that holds invoices, not only complementos, would import them] → None exists today: the user renamed every cancel folder to `Canceladas`. A cancelled invoice in a misspelled folder would show up as a double in Finanzas, and the log lists what each run imported.

## Migration Plan

1. `npm run db:generate` produces `drizzle/0017_*.sql`, which adds `cfdi_parcialidad` with a default of 0 and rebuilds `ingresos_cfdi_unique` on `(cfdi_uuid, cfdi_parcialidad)`.
2. The app takes its Respaldo *migración* before running it, as for every migration.
3. Nothing is corrected at migration time. The user's next Importar facturas applies the corrections and reports them. Rolling back means restoring the Respaldo.
