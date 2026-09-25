# Tasks

## 1. Provenance flag

- [x] 1.1 Add `importado` (boolean, default false) to `contactos`, `cotizaciones` and `proyectos` in `src/main/db/schema.ts`, run `npm run db:generate`, and append the backfill `UPDATE`s from design.md §1. Verify with a `src/main/db/migrations.test.ts` case: a hand-made-looking row (Contacto with email, Cotización with partidas, `personal` Proyecto) stays `0`, a bare row becomes `1`, and the migration passes the ADR-0003 foreign-key check.
- [x] 1.2 Set `importado: true` on every Contacto, Cotización and Proyecto insert in `importacion/carpetas.ts` and `importacion/rfcs.ts`. Leave the flag untouched when the scan matches an existing Contacto. Pinned by a `src/main/importacion/escaneo.test.ts` case: after a scan every created record has `importado = 1`, and a Contacto created through `contactos.guardar` that receives an imported quote keeps `0`.

## 2. Facturas run stops creating Costos

- [x] 2.1 In `importacion/facturas.ts`, read `Facturas/Recibidas`, count its CFDIs in a new `LogImportacion.recibidas`, and plan and import emitidas only. Delete `registrarCosto` and the Costo Sugerencia path from `comprobantes.ts`, and make `cancelarFacturas` touch Ingresos only. Pinned in `src/main/importacion/facturas.test.ts`: a received CFDI creates no Costo and counts in `recibidas` (MXN and USD); a Costo imported before stays unchanged when its CFDI moves into `Canceladas`; issued invoices import as before.
- [x] 2.2 Update the existing `facturas.test.ts` and `handlers.test.ts` cases that expected Costos from `Recibidas`, and show `recibidas` among the Facturas run's counts in `Logs.tsx`. Verify `npm test -- src/main/importacion/facturas.test.ts src/main/handlers.test.ts src/renderer/src/components/Logs.test.tsx` passes.

## 3. Reimport module

- [ ] 3.1 Create `src/main/importacion/reimportar.ts` with `bloqueos(db, entorno)`: counts of Contactos, Cotizaciones and Proyectos with `importado = 0`, Ingresos and Costos without `cfdi_uuid`, definiciones de Ingreso and Costo, an unreadable map, and a set-up HDD whose `Proyectos` cannot be read. Pinned in `src/main/importacion/reimportar.test.ts`: one case per spec scenario under "Reimportar desde cero is refused when it would lose data", plus an edited imported Contacto that does not block.
- [ ] 3.2 Add `borrarImportado(tx)` to the same module, deleting in the order of design.md §2. Pinned in `reimportar.test.ts`: after it, no Contacto, Cotización, Proyecto, `ubicaciones_archivo` row, CFDI Ingreso or Costo, or Sugerencia remains, while `uso_tokens`, `ahorro_tokens`, `tareas`, `catalogo` and `settings` are unchanged.
- [ ] 3.3 Add `reimportar(db, entorno)`: guard, then Respaldo callback, then `borrarImportado` in one transaction, then `escanearCarpetas` and `importarFacturas`. Pinned in `reimportar.test.ts` on a fixture root:
  - a map fix reaches an imported quote (Frida)
  - an accepted *vincular* comes back pending
  - a USD Ingreso is reimported with its original amount
  - a Factura cancelada stays out
  - an archived Proyecto comes back completed with no Ingresos from its Cotización (ADR-0002)
  - Estado de Contacto follows the new attribution
  - a throwing Respaldo callback leaves every record in place
  - a blocked call takes no Respaldo

## 4. Aceptar todas

- [ ] 4.1 Split `responder` in `src/main/sugerencias.ts` into a wrapper and `responderEn(tx, …)`, and add `aceptarVincular(db, hoy)`. Pinned in `src/main/sugerencias.test.ts`: with *vincular*, *fusionar* and *ubicación* pending, only the *vincular* are accepted and their links kept; a failure in one leaves all of them pending.

## 5. IPC and Respaldo

- [ ] 5.1 Add `antes-de-reimportar` to `MOTIVOS_RESPALDO`. Pinned by `src/main/backup.test.ts`: a Respaldo with that reason is listed.
- [ ] 5.2 Declare `importacion.reimportar`, `importacion.vistaPreviaDesdeCero` and `importacion.aceptarVincular` in `src/shared/contrato.ts`, with `ResultadoReimportar`, `VistaPreviaDesdeCero` and `Bloqueo` types in `src/shared/dominio.ts`, and wire them thinly in `src/main/handlers.ts`. The reimport passes `respaldos` as the callback and stores both logs in `ultimo`. Vista previa desde cero removes on `copiaEnMemoria()` with foreign keys off (design.md §3). Pinned in `src/main/handlers.test.ts`:
  - a reimport takes a Respaldo *antes de reimportar* and updates `estado()`
  - Vista previa desde cero leaves the live database, its pending Sugerencias and `estado()` unchanged, and lists "Appleseed Plataforma" no more after a map fix
  - with a hand-entered Ingreso it still returns a preview, plus the block

  Also check that `src/main/ipc.test.ts` covers the new channels.

## 6. Logs UI

- [ ] 6.1 In `src/renderer/src/components/Logs.tsx`, add Vista previa desde cero (rendered with `VistaPrevia` under "Desde cero", blocks listed above it) and Reimportar desde cero with the two-step confirmation ("Sí, reimportar") used in `Exportar.tsx`. A refusal lists the blocks in the Aviso. Pinned in `src/renderer/src/components/Logs.test.tsx`: declining calls nothing, confirming calls `reimportar` and refreshes runs and Sugerencias, and a refusal shows each block with its count.
- [ ] 6.2 Show Aceptar todas beside the Sugerencias heading only while a pending *vincular* exists, calling `aceptarVincular`. Pinned in `Logs.test.tsx`: hidden with only *fusionar* and *ubicación* pending, and clicking it replaces the list with the returned Sugerencias.

## 7. Domain docs and checks

- [ ] 7.1 Update `CONTEXT.md`:
  - add **Reimportar desde cero**
  - Importación: a map edit reaches imported records only through a reimport
  - Vista previa: its *desde cero* mode
  - Respaldo: the *antes de reimportar* reason
  - the Facturas run no longer imports Costos

  Verify each term reads as used in the specs.
- [ ] 7.2 Run `npm run typecheck`, `npm run lint` and `npm test`, and `openspec validate reimportar-desde-cero --strict`. All pass.
