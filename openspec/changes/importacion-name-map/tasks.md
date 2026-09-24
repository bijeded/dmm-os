# Tasks

## 1. Mapa de nombres parser

- [ ] 1.1 Create `src/main/importacion/mapa.ts` with `leerMapa(texto)`. It reads the header by `clave` in any column order, with a `,` or `;` delimiter, and strips a leading BOM. It handles double-quoted fields with `""` escapes. A header without `en disco` or `contacto` is an `ErrorMapa`. Verify with `src/main/importacion/mapa.test.ts` covering comma and semicolon files, a quoted field holding the delimiter, a BOM, reordered columns, and a broken header (`npm test -- src/main/importacion/mapa.test.ts`)
- [ ] 1.2 Add row problems and lookups. A row missing `en disco` or `contacto` is `incompleta`, and a repeated key is `duplicada`, both with 1-based line numbers, and the first row with a key wins. Add `buscar(nombre)` by `clave`, `subcarpetas(carpeta)` for `<carpeta>/<sub>` keys, and `sinUso()`. Verify in `mapa.test.ts` that `Sonrieme` finds `Sonríeme`, a duplicate reports the later line, `subcarpetas('DMM Studios')` returns both declared rows, and a row never looked up is in `sinUso()`

## 2. Attribution in the folder scan

- [ ] 2.1 Add `{ canonico: true }` to `resolverContacto`, so a `clave` match takes the given spelling instead of `mejorEscrito`. Add `atribuir(tx, mapa, nombre, origen)` to `carpetas.ts`, applying map row, then ` - ` split (legacy Cotización only), then today's behavior. Verify with new cases in `src/main/importacion/escaneo.test.ts`: "Map spelling wins" (`Audio Clinic` → `Audioclinic`), and a name without ` - ` such as `Anarco-guadalupano` not splitting
- [ ] 2.2 Make `escanearCarpetas` read `Clientes/_nombres.csv` once, setting `log.mapa` to `ausente`, `leido` or an error. When the map can't be read or has a broken header, it imports nothing. Verify in `escaneo.test.ts` with temp folders removed in `afterEach`: no map imports as today, a broken header leaves the database empty and the error in the log, and `_nombres.csv` never becomes a Contacto
- [ ] 2.3 Route old-format `importarCotizacion` through `atribuir`, storing the mapped or split `proyecto` as `cotizaciones.nombre`. Verify in `escaneo.test.ts` the scenarios "Quote named after a project", "Agency quote without a map row" (`Korova - Blog`) and "Row overrides the split"
- [ ] 2.4 Route `Clientes/` and `Proyectos/` folders through `atribuir`. A folder takes `proyecto` or its own name, and the row's `cliente final`. Carry a quote row's `cliente final` onto the Proyecto that `vincularCotizacion` links or `proyectosDeCotizacionesAceptadas` creates. Verify in `escaneo.test.ts` the scenarios "Project folder with no Clientes folder", "Agency quote linked to its end client's folder" (including the *vincular* Sugerencia and no "Citli Tours" Contacto), and "Accepted mapped quote with no folder" (Proyecto "Plataforma", Sugerencia *ubicación*, and no Ingresos or Costos created, per ADR-0002)
- [ ] 2.5 In `proyectosDeDisco`, import declared subfolders as their own Proyectos at `rutaDeProyecto(tipo, 'carpeta/sub')`, skip the parent, and list undeclared subfolders in `log.subcarpetasSinProyecto`. Verify in `escaneo.test.ts` the scenarios "Two websites in one folder" and "Declared Proyecto moved to Archivo" (one Proyecto with two locations)
- [ ] 2.6 Fill `log.filasMapa` from row problems and `sinUso()`, and `log.nuevos` from `Aportes`, with names re-read by id at the end of the run. Verify in `escaneo.test.ts` the scenarios "Typo in a key" and "Duplicate key", and that `nuevos` tags each Contacto `clientes`, `proyectos` or `cotizacion`
- [ ] 2.7 Verify in `escaneo.test.ts` the scenario "Map edited after the real scan": a second run with a new row leaves the Cotización on its original Contacto and counts it `duplicada`

## 3. Vista previa

- [ ] 3.1 Add `copiaEnMemoria()` to `Conexion` in `src/main/db/index.ts`, via `new Database(sqlite.serialize())` with `foreign_keys = ON` (check the better-sqlite3 docs through context7 first). Verify with a test in `src/main/db/dominio.test.ts`, or a new `src/main/db/copia.test.ts`, that a write to the copy leaves the live database unchanged
- [ ] 3.2 Declare `importacion.vistaPrevia: canal<[], LogCarpetas>()` in `src/shared/contrato.ts`, and add the handler in `src/main/handlers.ts`: open the copy, scan, close it in `finally`, and do not touch `ultimo`. Verify in `src/main/handlers.test.ts` that the preview reports the would-be counts, the live database keeps zero Contactos, Cotizaciones, Proyectos and Sugerencias, `estado()` still returns the previous run, and a second preview after a real scan reports nothing new
- [ ] 3.3 In `src/renderer/src/components/Logs.tsx`, add a secondary `Vista previa` button beside `Re-escanear carpetas`. Render its result: counts, new Contactos and Proyectos grouped by origen, map problems, undeclared subfolders, and a "Nada se guardó" note. Also show the map error and problems after a real scan. Verify in `src/renderer/src/components/Logs.test.tsx` that the button calls `vistaPrevia`, renders the lists and the note, and leaves the Corridas block unchanged

## 4. Docs

- [ ] 4.1 Add **Mapa de nombres** and **Vista previa** to `CONTEXT.md`, and note under **Importación** that the map applies only on first import. Verify by reading the diff: both terms are defined and every use in specs and code matches them
- [ ] 4.2 Run the real Vista previa against `~/Desktop/DMM OS` with a sample `_nombres.csv` (in a temp copy of the folder if the user prefers) and report the counts to the user. This task needs the app running or a script. Ask before using screen automation

## 5. Review and final checks

- [ ] 5.1 Run `/code-review` on the branch diff and fix what it confirms
- [ ] 5.2 Run `/security-review`. The change adds an IPC channel, reads and parses a user file (CSV) from the `DMM OS` folder, builds stored paths from subfolder names, and opens a database copy. Fix what it confirms
- [ ] 5.3 Run `npm run typecheck`, `npm run lint` and `npm test`; all pass
