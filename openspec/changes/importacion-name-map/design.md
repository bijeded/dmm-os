# Design

## Context

The folder scan (`src/main/importacion/escaneo.ts`) runs its passes in this order:

1. old-format Cotización PDFs
2. `Clientes/` folders
3. `Proyectos/` and `Archivo/Proyectos/` folders
4. the HDD's `Proyectos/`
5. new-format Cotización PDFs
6. Proyectos for accepted Cotizaciones with no folder

Names become Contactos in one place, `resolverContacto` in `carpetas.ts`. It matches by `clave` (`nombres.ts`), lets `mejorEscrito` pick the stored spelling, and proposes *fusionar* for near-duplicates.

A legacy Cotización's whole filename name goes to `resolverContacto` and is stored as `cotizaciones.nombre`. `repartirNombres` then reads that stored name to link the Cotización to a same-named folder (`vincularCotizacion`) and to name the Proyecto of an accepted quote with no folder (`proyectosDeCotizacionesAceptadas`). Every `Proyectos/` folder goes to `resolverContacto` under its own name.

Everything is keyed and idempotent. A Folio already imported is `duplicado`, and a folder whose location is known returns its Proyecto. The scan returns a `LogCarpetas` that Logs renders. There is no schema field the change needs that does not already exist: `proyectos.cliente_final` and `ubicaciones_archivo.ruta_relativa` are both present.

See proposal.md for the motivation, and the `importacion` spec delta for the behavior.

## Goals / Non-Goals

**Goals:**
- Keep every name decision in the one pure module that already makes them. The scan passes stay in their current order.
- Make Vista previa run the real scan code, so the preview cannot drift from what the scan does.

**Non-Goals:**
- A general CSV library. The parser handles only what the map needs.
- Changing how Contactos are merged. *fusionar* Sugerencias still come from `parecidos` for names the map does not cover.

## Decisions

### 1. `mapa.ts`: a pure parser and matcher, read once per run

This is a new module, `src/main/importacion/mapa.ts`, with no fs access:

- `leerMapa(texto): Mapa | ErrorMapa` parses the header and rows. It handles the delimiter (`,` or `;`, whichever the header line uses) and double-quoted fields with `""` escapes, and strips a BOM, because Numbers and Excel write one. A header missing `en disco` or `contacto` returns `ErrorMapa`. Unknown columns are dropped, and short rows are padded with empty fields. Row problems (a missing `contacto`, neither `en disco` nor `rfc`, a duplicate key) are collected with their 1-based line numbers, and the first row with a given key wins.
- `Mapa.buscar(nombre)` looks up rows keyed by `clave(en disco)`. `Mapa.subcarpetas(carpeta)` returns the declared subfolder rows of a folder, keyed by `clave(carpeta)` plus `clave(subcarpeta)`, split at the first `/`.
- Every hit marks its row used, and `Mapa.sinUso()` lists the rows never hit, for the Log. RFC-only rows (no `en disco`) are never "sin uso"; they are applied by the RFC pass (decision 8).

`escaneo.ts` reads `Clientes/_nombres.csv` once at the start of `escanearCarpetas` and passes the `Mapa` down. A missing file (ENOENT) gives an empty map and `log.mapa = 'ausente'`. Any other read error, or an `ErrorMapa`, returns a log carrying that error before any pass runs, so nothing is imported.

*Alternative considered:* a CSV dependency such as `csv-parse`. It was rejected because the map needs quoted fields and two delimiters, which is about 40 lines, and a new dependency for that is not worth it. JSON or YAML was also considered and rejected, since the user edits this file by hand in Numbers.

*Why `Clientes/_nombres.csv`:* `contactosDeDisco` reads only subfolders, so a file there is never taken for a Contacto. It also sits beside the folders it mostly describes.

### 2. One resolver for "which Contacto and Proyecto does this name mean"

`carpetas.ts` gains `atribuir(tx, mapa, nombre, origen)`. It returns `{ contactoId, proyecto: string | null, clienteFinal: string | null }` and applies the rules in this order:

1. A map row: `resolverContacto(tx, fila.contacto, { canonico: true })`. With `canonico` set, a `clave` match renames the Contacto to the map's spelling, bypassing `mejorEscrito`, and a new Contacto gets that spelling.
2. Legacy Cotización only, when the name contains ` - `: the part before the dash goes back through step 1 as a name (so `Sublime` → "Sublime Inspiración" applies), falling back to `resolverContacto`; `proyecto` is the part after the dash.
3. Otherwise, today's behavior.

`importarCotizacion` (old format) and `importarCarpetaProyecto` call `atribuir`. `contactosDeDisco` calls it only for the Contacto, and ignores `proyecto` and `clienteFinal` for a `Clientes/` folder.

### 3. A legacy Cotización stores its project name as `cotizaciones.nombre`

When the map or the split gives a `proyecto`, it is stored as the Cotización's `nombre`. The full filename name stays visible through `pdf_ruta_relativa`. That way `repartirNombres`, `vincularCotizacion` and `proyectosDeCotizacionesAceptadas` keep working unchanged: they already take the Proyecto name from `cotizaciones.nombre`. Their `+ / , y` multi-project split still applies to the stored name.

The quote's `cliente final` has nowhere to live on a Cotización. So it goes into the Sugerencia's `deshacer` payload, and onto the Proyecto when `vincularCotizacion` links it or `proyectosDeCotizacionesAceptadas` creates it. For that, `importarCotizacion` looks up the map row again by the Cotización's filename name, which is available from `pdf_ruta_relativa` through `leerNombreArchivo`. A folder's own row `cliente final` applies directly when its Proyecto is created. When both give one, the folder's wins, because the folder is the Proyecto.

*Alternative considered:* a new `cotizaciones.proyecto_nombre` column. It was rejected because it needs a migration for a value that only matters at import time, and the existing `nombre` already plays that role for new-format quotes.

### 4. Declared subfolders in `proyectosDeDisco`

For each folder in a Proyectos root, the scan asks `mapa.subcarpetas(nombre)`:

- **None declared:** the folder imports as today, through `atribuir`.
- **Some declared:** the scan lists the folder's subfolders. Each declared one goes to `importarCarpetaProyecto` with `rutaRelativa = rutaDeProyecto(tipo, `${carpeta}/${sub}`)`, the row's Contacto and a name. Each undeclared one is pushed to `log.subcarpetasSinProyecto`. The parent is never imported.

`rutaDeProyecto` already joins a relative name onto the root, so ADR-0001 holds. A declared Proyecto moved to `Archivo/` is found again by the existing match on Contacto plus `clave(nombre)`, and gets a second location.

### 5. The Log names what it created

`LogCarpetas` gains:

- `mapa: 'ausente' | 'leido' | { error: string }`
- `filasMapa: { linea: number; problema: 'sin uso' | 'incompleta' | 'duplicada'; enDisco: string }[]`
- `subcarpetasSinProyecto: string[]`
- `nuevos: { contactos: { nombre: string; origen: Origen }[]; proyectos: { nombre: string; contacto: string; origen: Origen }[]; rfcs: { contacto: string; rfc: string }[] }`, where `Origen` is `'clientes' | 'proyectos' | 'cotizacion' | 'mapa'` (`mapa` for a Contacto created by an RFC-only row)
- `filasMapa[].problema` also takes `'rfc invalido' | 'rfc generico' | 'rfc de otro contacto' | 'contacto con otro rfc'`

`nuevos` is collected through `Aportes`, the same way `contactosCreados` is today. Names are re-read by id at the end of the run, because a later file may rename a Contacto to a better spelling. The real scan fills these fields too. Logs shows `nuevos` only for Vista previa, to keep the scan result short.

### 6. Vista previa scans an in-memory copy

`Conexion` gains `copiaEnMemoria(): { db: Db; close(): void }`. It is implemented as `new Database(sqlite.serialize())` wrapped in `drizzle`, with `foreign_keys = ON`. The better-sqlite3 13 docs confirm that a Buffer argument opens an in-memory database. The copy has the live schema, so no migration runs.

The handler `importacion.vistaPrevia` does four things. It opens the copy, runs `escanearCarpetas(copia.db, root, hddRoot(), hoy())`, closes the copy in a `finally`, and returns the log. It does not write to `ultimo`, so the last real run shown in Logs is untouched. The HDD is only read, and `marcarHddNoDisponible` writes to the copy alone.

*Alternatives considered:*
- Running the scan inside a transaction on the live database and rolling it back. This was rejected because any code path that commits, or a future `db.transaction` misuse, would write live data, and the scan also holds a write lock for its whole run.
- `VACUUM INTO` a temp file, which is what `copiarA` does. It was rejected because it needs a temp path and cleanup, and an in-memory copy is simpler for a database this size.

### 7. IPC and UI

The new channel is `importacion.vistaPrevia: canal<[], LogCarpetas>()` in `src/shared/contrato.ts`. The preload exposes the whole contract through `crearApi`, so it needs no change. `handlers.ts` stays thin: it opens the copy, scans and closes.

`Logs.tsx` adds `Vista previa` as a secondary button beside `Re-escanear carpetas`. Its result renders below the buttons with the same counts `Corridas` shows. It adds the new Contactos and Proyectos grouped by origen, the map problems, the undeclared subfolders, and a note that nothing was saved. `Re-escanear carpetas` also shows the map error and the map problems when it gets them.

### 8. RFCs are applied in one pass at the end of the scan

After every pass (including the new-format quotes and the accepted-quotes pass), `asignarRfcs(db, mapa, usadas)` runs in one transaction:

1. It collects the rows with `rfc`. For a row with `en disco`, the Contacto is the one `atribuir` resolved when the name was found (recorded on the hit), and the row is skipped if the name was never found. For a row without `en disco`, the Contacto is `resolverContacto(tx, fila.contacto, { canonico: true })`, which creates it when missing, with `origen: 'mapa'`.
2. It normalises the RFC (uppercase, no spaces) and checks it against `^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$`. It rejects `XAXX010101000` and `XEXX010101000`.
3. It groups by Contacto and by RFC. The first row wins in each group, and later conflicting rows are reported.
4. It writes only where `contactos.rfc` is null and no other Contacto holds the RFC. The unique index `contactos_rfc_unique` is the backstop, and the check before it turns a would-be constraint error into a reported row.

Running it at the end means any name that resolves to the Contacto, in any pass, can carry its RFC. Applying it on every scan does not re-attribute anything: it only fills a null column, which is why the "first import only" rule can make this one exception.

*Alternative considered:* an RFC field in the Contacto form. That is still worth having, but the map covers the 46 historical RFCs in one file, and the preview checks them before anything is written.

*Why the Facturas run is unchanged:* `importarCfdi` already links by `contactos.rfc`. Ordering (folder scan, then Importar facturas) is enough for the first import. Re-linking invoices imported earlier is the follow-up change.

## Risks / Trade-offs

- **The split misreads a name that contains ` - ` but is not `Cliente - Proyecto`.** → Vista previa lists the resulting Contacto, and a map row overrides the split.
- **The map spelling renames an existing Contacto when a row's `contacto` differs only in accents or case.** → This is intended: the map is the user's word. Only `clave`-equal names are renamed. A different name creates a different Contacto, which the preview shows.
- **The in-memory copy doubles memory for the database's size.** → The database holds a small business's records (MBs). The copy lives only for one call.
- **A declared parent's undeclared subfolders are not imported, so files could look lost.** → They stay on disk untouched. The Log and the preview list each one, and adding a row imports it next scan.
- **Invoices imported before their Contacto had an RFC stay unlinked.** → Vista previa and the Logs make the order visible. The follow-up Facturas change re-links them. Today the database is empty, so the first run in the right order avoids it.
- **A Contacto that invoices under two RFCs keeps only one.** → The second is reported. Multiple RFCs per Contacto need a schema change and belong to the Facturas change.
- **The map is applied only at first import.** → That is accepted by design (spec). The preview is the way to iterate, and the database is empty today.

## Migration Plan

No schema change. The user's steps:

1. Write `Clientes/_nombres.csv`.
2. Run Vista previa until the counts look right.
3. Run Re-escanear carpetas once, then Importar facturas.

Rollback is the Respaldo taken before the scan, or Restauración.
