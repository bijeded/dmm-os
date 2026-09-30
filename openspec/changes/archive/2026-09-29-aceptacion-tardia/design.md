# Design

## Context

- `src/main/ciclo-cotizacion.ts` holds the Cotización lifecycle as a `REGLAS` table. `aceptar` is allowed only on `enviada`, and expirada/rechazada allow only `cambiarContacto`. `accionesCotizacion` feeds `FichaCotizacion.acciones`, which the renderer reads to show buttons.
- `aceptarCotizacion` (`src/main/cotizar.ts`) checks the rule, builds the `planCobro`, and writes the estado, the Proyecto, Ingresos, definitions and Costos in `transaccionConPeriodos`. Once that commits, it calls `crearCarpeta`.
- `expirarCotizaciones` (run by Al día) touches only `enviada` rows, so an aceptada Cotización is never re-expired. Nothing needs to change there.
- Imported Cotizaciones carry `importado: true` and come in as `enviada`. The folder scan builds a *completado* Proyecto for an accepted Cotización with no folder in `proyectosDeCotizacionesAceptadas` (`importacion/carpetas.ts`), and proposes *ubicación* there. `vincularCotizacion` asks *partidas* when an imported Cotización has 2+ prices. Both write through `proponer`, which asks each Sugerencia once.
- `heredarDeCotizacion` (`ciclo-proyecto.ts`) already states what a linked Proyecto takes from its Cotización.
- The handler tests pin that every `cotizaciones` channel runs on an Al día db (`handlers.test.ts`, "Every ledger command works Al día").

## Goals / Non-Goals

**Goals:**
- One new lifecycle action, `aceptarTarde`, decided by the same `REGLAS` table, so the Ficha and the guard cannot disagree
- The Plan de cobro path is shared with `aceptarCotizacion`, not copied
- The imported path reuses the scan's own Proyecto builder and *partidas* proposal, so a late-accepted imported Cotización looks exactly like one the scan accepted

**Non-Goals:**
- No schema change or migration
- No change to `aceptar` on enviada Cotizaciones, imported or not

## Decisions

**A separate action `aceptarTarde`, not a wider `aceptar`.** `REGLAS.aceptarTarde = { en: ['expirada', 'rechazada'] }`, and `rechazo` also refuses when `ctx.proyecto` is not null. That can only happen through a data anomaly, but a Cotización leads to at most one Proyecto. Widening `aceptar` would change the enviada button, the handler tests' `llevarA` table and the imported-enviada behaviour, which is a non-goal. A separate action also lets the Ficha label it differently (Marcar como aceptada…) and open a dialog.

**Origin decides the path, read from `cotizaciones.importado`.** The flag already exists and is what Reimportar desde cero reads, so it is the single definition of "imported". A Cotización created in the app has `importado = false`.

**Split `aceptarCotizacion`.** Extract `registrarAceptacion(db, root, c, hoy, tipoCambio)`, which does the plan, the transaction and the folder. `aceptarCotizacion` becomes guard + `registrarAceptacion`. The late path for a Cotización made in the app is `exigirCotizacion('aceptarTarde', …)` + `registrarAceptacion`. `planCobro` already refuses a USD Cotización without `tipoCambio`, and it throws before the transaction, so nothing is written.

**New module `src/main/aceptacion-tardia.ts`** (pure domain; handlers stay thin):
- `opcionesAceptacionTardia(db, id)` returns `{ importado, moneda, proyectos: { id, nombre, estado }[] }`, where `proyectos` holds the Contacto's Proyectos with `cotizacionId IS NULL` and `estado != 'cancelado'`. It is empty for a Cotización made in the app.
- `aceptarTarde(db, root, id, hoy, eleccion)` takes `eleccion: { tipoCambio?: number } | { proyectoId: number | 'nuevo' }`. It checks the guard, then branches on `importado`. The imported branch runs in one transaction. It sets the estado to `aceptada`, then either links the chosen Proyecto with `heredarDeCotizacion`, or builds the Proyecto nuevo. It then asks *partidas* when there are 2+ prices. It checks that a chosen `proyectoId` is among the options; otherwise it refuses.

**Extract from `carpetas.ts`, don't duplicate.**
- `proyectoDeCotizacionAceptada(tx, c, mapa)` is the body of the `proyectosDeCotizacionesAceptadas` loop. It inserts the completado Proyecto with `importado: true` and proposes *ubicación*.
- `preguntarPartidas(tx, c)` is the tail of `vincularCotizacion`.

The late path passes `mapaVacio()`, so the Proyecto nuevo gets no Cliente final, a recorded non-goal. Reading `Clientes/_nombres.csv` from a Ficha action would add a file read and a failure mode (an unreadable map) for a label the owner can set in Editar.

**The Proyecto nuevo is `importado: true`.** Alternative: `importado: false`, a truthful "made by hand". It would make Reimportar desde cero refuse forever over a Proyecto that exists only because of imported history. Marking it imported matches the documented rule for Fusionar Contacto and Cambiar Contacto: corrections to imported records are lost on reimport. A linked existing Proyecto keeps its own flag.

**IPC.** In `contrato.ts`, under `cotizaciones`:
- `opcionesAceptarTarde: canal<[id: number], OpcionesAceptacionTardia>()`
- `aceptarTarde: canal<[id: number, eleccion: EleccionAceptacionTardia], FichaCotizacion>()`

Both handlers use `alDiaDb()` and `hoy()`, and validate ids with `idValido`. The types live in `src/shared/dominio.ts`. The preload builds its API from the contract (`crearApi`), so it needs no edit.

**Renderer.** `FichaCotizacion.tsx` shows **Marcar como aceptada…** when `acciones` includes `aceptarTarde`, and opens an `AceptacionTardia` dialog. The dialog loads `opcionesAceptarTarde`.
- Made in the app: text saying that the Plan de cobro will be recorded, dated hoy, with a Proyecto en curso; a tipo de cambio field for USD.
- Imported: a Proyecto select with the options plus "Proyecto nuevo (completado)", and text saying that no Ingresos or Costos are recorded.

Confirm calls `aceptarTarde` and replaces the Ficha. Its layout follows the `CambiarContacto` / `AsignarProyecto` dialogs in `Atribucion.tsx`.

## Risks / Trade-offs

- [An imported *enviada* Cotización accepted with Aceptada still records a Plan de cobro, while an expirada one does not] → Out of scope by choice. It is recorded in the proposal's Non-goals and can become its own change.
- [An Aceptación tardía of an imported Cotización with a Proyecto nuevo cannot be undone in the app: the Proyecto is completado, so Cancelar is not offered] → The dialog says so before confirming. Reimportar desde cero remains the undo, as for other edits to imported records.
- [Extracting code from `carpetas.ts` could change what the scan does] → The existing `escaneo.test.ts` cases for accepted Cotizaciones without a folder and for *partidas* must pass unchanged. They pin the extraction.
- [A Proyecto chosen in the dialog gains a Cotización between loading the options and confirming] → The server re-checks that the Proyecto is still an option inside the transaction and refuses otherwise.
