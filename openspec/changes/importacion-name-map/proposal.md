# Proposal

## Why

The history on disk is not organised by Contacto. A dry run of the folder scan over the current `DMM OS` folder would create 248 Contactos from 56 `Clientes/` folders. The other 192 come from `Proyectos/` folder names with no `Clientes/` folder (54) and from legacy quote names written after the project rather than the Contacto (138), e.g. "Appleseed Plataforma", "Sublime - Citli Tours" and "Zamora Live Newsletter". Some `Proyectos/` folders also hold several Proyectos, e.g. `DMM Studios/Web 2023` and `Web 2027`, but each imports as one. The Facturas run links an invoice to its Contacto only by RFC, and nothing sets a Contacto's RFC: a dry run of it after the folder scan imports 446 Ingresos, none linked to a Contacto, from 46 issuing RFCs. The database is still empty, so this is the moment to get the first Importación right.

Intent: before the first folder scan, the user can tell it which Contacto, Proyecto and RFC each name on disk means, and see what it would create without writing anything.

## What Changes

- The folder scan reads a **Mapa de nombres**, `DMM OS/Clientes/_nombres.csv`, which the user edits in Numbers or any text editor. Each row maps a name found on disk (a legacy Cotización name, a `Clientes/` folder or a `Proyectos/` folder) to a Contacto and, optionally, a Proyecto name, a Cliente final and the Contacto's RFC. Columns the scan does not know (e.g. `nota`) are ignored.
- A row whose key is a subfolder path (`DMM Studios/Web 2023`) declares that subfolder a Proyecto of its own. The parent folder then no longer imports as a Proyecto, and its subfolders that no row declares are listed in the Log instead of being imported.
- With no matching row, a legacy Cotización named `Cliente - Proyecto` (split at the first ` - `) belongs to the Contacto before the dash, itself looked up in the map, and delivers the Proyecto named after it. Today the whole name becomes a Contacto.
- A row's `rfc` gives its Contacto that RFC, so a Facturas run after the folder scan links that Contacto's invoices. A row may carry only `contacto` and `rfc`, for a Contacto known only from its invoices. Unlike names, an RFC is also applied on a later scan to a Contacto that has none yet. It never replaces a Contacto's RFC, never takes one another Contacto holds, and never assigns the generic RFCs `XAXX010101000` and `XEXX010101000`. Each refusal is reported.
- The Log reports map rows that matched nothing on disk and rows it could not read, with their line numbers, so typos show up. A map that exists but cannot be read stops the scan rather than letting it import without the map.
- Configuración → Logs gets **Vista previa**. It runs the folder scan on a throwaway copy of the database and shows what a real scan would add: the counts plus the names of the Contactos and Proyectos it would create, and where each comes from. The live database, and the Sugerencias de importación waiting in it, are not touched.

## Non-goals

- Re-attributing records that are already imported. The map applies when a file is first imported. A map edit after the real scan affects only files not seen before. Iterating happens through Vista previa before the scan.
- Undoing or resetting a finished Importación.
- New-format quotes (`YYMMDD - DMM 475 - Nombre`). They already name the Proyecto and take the Contacto from it. None exist on disk today.
- Changing the Facturas run (CFDI XML). Linking invoices imported before their Contacto had an RFC, invoices to the generic RFCs (e.g. foreign clients), and a Contacto that invoices under more than one RFC (e.g. Walden Dos A.C. and Walden Dos S. de R.L.) are a separate change. Until then, run the folder scan before Importar facturas.
- Ignoring folders that are not Proyectos (e.g. a theme download). They can be moved out of `Proyectos/` on disk.
- Importing `.docx` quotes. The one on disk (`DMM - 272 - Sublime.docx`) will be exported to PDF by hand.
- Editing the map from inside the app.

## Capabilities

### New Capabilities

- `importacion`: the folder scan's use of the Mapa de nombres, the `Cliente - Proyecto` split, subfolder Proyectos, RFCs from the map, and Vista previa. There is no `importacion` spec yet. This change specifies only the behavior it adds or changes, not the rest of the existing scan.

### Modified Capabilities

None.

## Terms

- Touches: **Importación**, **Sugerencia de importación**, **Contacto**, **Nombre canónico**, **Proyecto**, **Cliente final**, **Cotización**, **Folio**.
- Introduces: **Mapa de nombres**, the user-edited file that tells the folder scan which Contacto, Proyecto and RFC a name on disk means. **Vista previa**, a folder scan run on a copy of the database that reports and writes nothing.

## Impact

- `src/main/importacion/`: a new pure module that parses and matches the Mapa de nombres. `carpetas.ts` and `escaneo.ts` resolve Contactos and Proyectos through it. The scan also walks declared subfolders.
- `src/main/handlers.ts`, `src/shared/contrato.ts`, `src/preload`: a new `importacion.vistaPrevia` channel. `src/shared/dominio.ts`: new Log fields and the preview result type.
- `src/renderer/src/components/Logs.tsx`: the Vista previa button and its result.
- There is no schema change. `contactos.rfc` (unique), `proyectos.cliente_final` and `ubicaciones_archivo.ruta_relativa` already hold what is needed.
- ADR-0001 still holds: a subfolder Proyecto stores its path relative to the `DMM OS` root. ADR-0002 still holds: map-attributed imports stay exempt from the lifecycle guards.
- CONTEXT.md gains the two new terms.
