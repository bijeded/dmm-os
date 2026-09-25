## Why

The Mapa de nombres only applies when a file is first imported, so once the real folder scan has run, a map fix can neither be previewed (Vista previa reports nothing new) nor applied (Re-escanear carpetas counts everything as already imported). The user wants to throw the imported records away and import again from a clean slate, whenever the map or the importers improve.

## What Changes

- Configuración → Logs gets **Reimportar desde cero**: after a confirmation, it takes a Respaldo, removes every record the Importación made, then runs the folder scan and the Facturas run on the empty ledger. It is refused while the database holds anything made by hand, and it refuses before removing anything if the Mapa de nombres cannot be read.
- **Vista previa** gains a *desde cero* mode: the folder scan on a throwaway copy with the Importación's records removed, so it shows what Reimportar desde cero would create with the current map.
- The Sugerencias de importación list gets **Aceptar todas** for the pending *vincular* Sugerencias.
- **BREAKING** The Facturas run stops creating Costos. CFDIs under `Facturas/Recibidas` are read and counted, not imported. Costos are entered by hand in Finanzas. Costos an earlier run imported stay until Reimportar desde cero removes them.

This is change 1 of the import-quality epic. Reading Cotización PDFs, attributing Proyectos folders through the Cotización that names them, Sugerencias with a choice, and Completar con cobro are later changes. Each becomes visible on the user's data by pressing Reimportar desde cero again.

CONTEXT.md terms touched: Importación, Vista previa, Mapa de nombres, Sugerencia de importación, Respaldo, Factura cancelada. Introduced: **Reimportar desde cero**.

Nothing here contradicts an ADR. ADR-0002 (imported history exempt from the lifecycle guards) is untouched: the wipe removes imported history outright rather than moving it through a lifecycle. It does reopen a non-goal of the `importacion-name-map` change ("Undoing or resetting a finished Importación"). A map that cannot reach records already imported turned out to leave the user unable to fix them.

## Non-goals

- Keeping answers to Sugerencias de importación, or edits to imported records, across a reimport. They are keyed by row ids that the wipe discards; the confirmation says they will be lost.
- Reimporting while hand-made records exist, or telling an edited imported record from an untouched one. The button is for the setup phase and is refused once hand-made records exist.
- Improving what the importers read (Cotización dates, Montos, categorías, Proyecto attribution). Those are later changes in the epic.
- Removing Costos an earlier run imported, other than through Reimportar desde cero.
- AI token usage (CC Usage, `rtk gain`), Tareas, Catálogo and settings, which the wipe leaves alone.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `importacion`: adds Reimportar desde cero, the *desde cero* mode of Vista previa, and Aceptar todas for *vincular* Sugerencias. The first-import rule for the map now names Reimportar desde cero as the way a map edit reaches records already imported.
- `facturas`: received CFDIs are counted, not imported as Costos. The requirements on cancelled and replaced CFDIs, and on what Logs reports, lose their Costo cases.

## Impact

- Schema: an `importado` flag on Contactos, Cotizaciones and Proyectos, with a migration that backfills today's rows.
- `src/main/importacion/`: a new pure module that removes the Importación's records and checks for hand-made ones. The importers set `importado`. `facturas.ts` and `comprobantes.ts` stop writing Costos.
- `src/main/sugerencias.ts`: accepting every pending *vincular* Sugerencia in one transaction.
- `src/main/handlers.ts`, `src/shared/contrato.ts`: new `importacion.reimportar`, `importacion.vistaPreviaDesdeCero` and `importacion.aceptarVincular` channels.
- `src/main/backup.ts`: a Respaldo reason for before a reimport.
- `src/shared/dominio.ts`: the reimport result and the counts of received CFDIs in `LogImportacion`.
- `src/renderer/src/components/Logs.tsx`: the button, its confirmation, the preview mode and Aceptar todas.
- `CONTEXT.md`: the new term, and the Importación, Vista previa and Respaldo entries.
- The live database: the next Reimportar desde cero removes today's 182 Contactos, 401 Cotizaciones, 133 Proyectos, 448 Ingresos, 36 Costos and 297 answered Sugerencias.
