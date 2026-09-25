## Context

See proposal.md for the motivation and the specs for the behavior.

Where things stand:
- The Importación's writers are `escanearCarpetas` (`importacion/escaneo.ts`, through `carpetas.ts` and `rfcs.ts`) and `importarFacturas` (`importacion/facturas.ts`, through `comprobantes.ts`). Every run is keyed and idempotent.
- Nothing in the schema says who made a Contacto, Cotización or Proyecto. An Ingreso or Costo from a CFDI carries `cfdi_uuid`; a hand-entered one does not.
- `handlers.ts` wires `importacion.carpetas`, `facturas` and `vistaPrevia`. It keeps the last run of each importer in memory (`ultimo`). Vista previa scans `conexion.copiaEnMemoria()`, a serialized in-memory copy with foreign keys on.
- Respaldos carry a reason from `MOTIVOS_RESPALDO` (`semanal`, `migracion`, `manual`, `antes-de-restaurar`). Restaurar takes one first.
- The external HDD is the `hdd.root` setting. A scan counts it connected when `<hdd>/Proyectos` can be read, and otherwise marks its Proyectos No disponible.
- The live database today holds only imported records. All 401 Cotizaciones have no partidas and none is a borrador. All 133 Proyectos are `cliente` with no dates. No Contacto has empresa, email, phone, address or notes. Every Ingreso and Costo has a CFDI UUID, and there are no definiciones.

## Goals / Non-Goals

**Goals:**
- Tell imported records from hand-made ones by a stored fact, not by guessing from fields that later changes in the epic will start filling in (partidas, dates, categoría).
- One pure module decides what a reimport removes and what blocks it. The real reimport and Vista previa desde cero use that same module, so the preview cannot drift from the reimport.
- The reimport either removes nothing or removes everything it should.

**Non-Goals:**
- Making the whole reimport (remove, scan, Facturas run) one transaction. The scan already imports each file in its own transaction and reports file errors without stopping.
- Recording whether an imported record was edited in the app.

## Decisions

### 1. An `importado` flag on Contactos, Cotizaciones and Proyectos

Add `importado integer NOT NULL DEFAULT 0` (boolean) to `contactos`, `cotizaciones` and `proyectos`. Every insert the importers make sets it. A record the app creates keeps the default. When the scan matches a Contacto that already exists, it leaves that Contacto's flag alone, so a hand-made Contacto that later receives imported quotes still blocks a reimport. For Ingresos and Costos, `cfdi_uuid IS NOT NULL` already records the same fact.

The migration backfills existing rows as imported unless they show a sign the app made them:
- a Contacto with empresa, email, teléfono, dirección or notas
- a Cotización that is a borrador or has partidas
- a Proyecto that is `personal` or has a fecha de inicio or entrega

On today's database that marks every row imported (see Context). The migration runs with foreign keys off and after its Respaldo, as ADR-0003 and the standing Respaldo rule require.

*Alternatives considered:*
- Detect hand-made records at reimport time from those same signs. Rejected: the Cotización PDF change will give imported quotes partidas, and the Proyectos change will give imported Proyectos dates. The rule would need rewriting in each of those changes.
- A separate provenance table. Rejected: three columns are simpler, and every read that needs the fact already reads the row.

### 2. `importacion/reimportar.ts`: blocks and removal

A pure module with:
- `bloqueos(db, entorno)` returns the kinds of blocking records with their counts: Contactos, Cotizaciones and Proyectos with `importado = 0`, Ingresos and Costos with no `cfdi_uuid`, and definiciones de Ingreso or Costo. It also reports a map that cannot be read (from `leerMapa` / `esErrorMapa`, as the scan does) and an HDD that is set up but whose `Proyectos` cannot be read.
- `borrarImportado(tx)` deletes, in foreign-key order and inside the caller's transaction: every Sugerencia de importación, the Ingresos and Costos with a CFDI UUID, the `ubicaciones_archivo` of imported Proyectos, then imported Proyectos, Cotizaciones and Contactos. When `bloqueos` is empty, no hand-made record can reference an imported one, so every `restrict` holds.
- `reimportar(db, entorno)` is the orchestration. It checks `bloqueos` (and returns them if there are any), calls `entorno.respaldar()`, runs `borrarImportado` in one transaction, then `escanearCarpetas` and `importarFacturas`. It returns either `{ reimportado: false, bloqueos }` or `{ reimportado: true, carpetas, facturas }`.

The `entorno` argument carries the root, the HDD root, today and the Respaldo callback, so tests run the whole flow on the test database with a fake Respaldo.

*Alternative considered:* `DELETE` with `ON DELETE CASCADE` from Contactos. Rejected: the schema uses `restrict` on purpose (Borrar vs cancelar), and changing it would weaken that for the whole app.

### 3. Vista previa desde cero removes on the copy with foreign keys off

`vistaPreviaDesdeCero` opens `copiaEnMemoria()`, turns foreign keys off on the copy, runs `borrarImportado`, then `escanearCarpetas`, and returns `{ log, bloqueos }` (with `bloqueos` computed on the live database). Foreign keys are off because the preview must run even when hand-made records reference imported ones. On a throwaway copy, a dangling reference costs nothing, and the scan never follows those references. The live database is never touched.

*Alternative considered:* a scan against a freshly migrated empty database. Rejected: hand-made Contactos that a real reimport would keep (and match names against) would be missing, so the preview would diverge once the guard is relaxed in a later change.

### 4. IPC and Respaldo

In `src/shared/contrato.ts`:
- `importacion.reimportar: canal<[], ResultadoReimportar>()`
- `importacion.vistaPreviaDesdeCero: canal<[], VistaPreviaDesdeCero>()`
- `importacion.aceptarVincular: canal<[], Sugerencia[]>()`

`vistaPrevia` stays as it is. A separate channel keeps its current contract and tests untouched. `handlers.ts` passes `respaldos` in as the Respaldo callback and, after a reimport, stores both logs in `ultimo`.

`MOTIVOS_RESPALDO` gains `antes-de-reimportar`. Respaldo file names already encode the reason, and `listBackups` accepts any listed reason.

### 5. Aceptar todas reuses the one-at-a-time path

`responder` in `sugerencias.ts` splits into a transaction wrapper and an inner `responderEn(tx, s, respuesta, hoy)`. `aceptarVincular(db, hoy)` runs every pending *vincular* through `responderEn` inside one transaction and returns `pendientes`. If any throws, the whole batch rolls back.

### 6. Facturas run: received CFDIs are read, counted and left alone

`importarFacturas` still reads `Facturas/Recibidas`, so the count and the parse errors stay visible, but it passes only emitidas to `planearFacturas` and `importarCfdi`. `LogImportacion` gains `recibidas: number`. `registrarCosto` and the Costo branch of the Proyecto guess are deleted from `comprobantes.ts`, and `cancelarFacturas` only touches Ingresos. `CambioFactura` keeps its `entidad` field, so the log type and Logs rendering stay unchanged; a run just never emits a Costo entry.

Planning over emitidas only is safe because a received CFDI can't cancel or replace an issued one, and complementos de pago that date issued invoices are filed under Emitidas.

### 7. UI in Logs

The button row becomes: Re-escanear carpetas, Vista previa, Vista previa desde cero, Importar facturas, and a destructive **Reimportar desde cero** at the end.
- Reimportar uses the two-step confirmation Restaurar already uses in `Exportar.tsx`: the warning text, then **Sí, reimportar**.
- A refusal shows the blocks as a list in the section's Aviso.
- Vista previa desde cero renders with the existing `VistaPrevia` component under a "Desde cero" heading, with the blocks listed above it when there are any.
- Aceptar todas sits in the Sugerencias heading row, shown only while a pending *vincular* exists.

## Risks / Trade-offs

- [Crash between removal and the end of the scan leaves a half-imported ledger] → The guard still passes afterwards, because everything left is imported, so pressing Reimportar desde cero again repairs it. The Respaldo *antes de reimportar* restores the previous state.
- [A later importer path forgets to set `importado`] → Its records would block the next reimport rather than be lost. An `escaneo.test.ts` case asserts that every Contacto, Cotización and Proyecto a scan creates has `importado = 1`.
- [Answers to Sugerencias are lost on every reimport] → Aceptar todas makes re-answering *vincular* one click. Keeping answers across a reimport is a non-goal.
- [The backfill misreads a hand-made record as imported] → Not possible on today's data (see Context). On another database, a reimport would remove that record, and the Respaldo holds it.
- [Proyectos only on the HDD vanish if the HDD is forgotten in Configuración first] → Expected. Forgetting the HDD means its Proyectos are no longer a source.

## Migration Plan

1. `npm run db:generate` for the three columns, with the backfill `UPDATE`s appended to the generated SQL. It is checked under ADR-0003 by `migrations.test.ts`.
2. The next launch takes a Respaldo *migración* before migrating, as every migration does.
3. Rollback: restore that Respaldo. The columns are additive, so an older build reading the file ignores them.
