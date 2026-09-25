# Design

## Context

See proposal.md, Why. The facts that shape the approach:

- **Pass order already fits.** `escanearCarpetas` imports legacy Cotizaciones first, then `Clientes/`, then `Proyectos/`, `Archivo/Proyectos/` and the HDD, then new-format quotes. When a Proyectos folder is imported, every legacy Cotización and every `Clientes/` Contacto already exists, so rules 2 and 3 can read them.
- **The stored Cotización name is already the project name.** `importarCotizacion` stores, in order, the map row's `proyecto`, the PDF's `“…”` name, the `Cliente - Proyecto` split, or the filename name. `vincularCotizacion` already matches a folder against it through `repartirNombres`, which also handles one name listing several projects.
- **The schema allows a Proyecto with no Contacto.** `proyectos.contacto_id` is nullable, and `proyectos_personal_sin_contacto` only forbids a *personal* Proyecto from having one. No migration is needed.
- **Where null is handled today.** `fichaProyecto`, `listarProyectos`, `crearCarpeta`, `contactos.ts` (`agrupar` skips null) and `nombrarNuevos` already tolerate a null `contactoId`. `FichaProyecto.tsx` renders null as "Personal". `Proyectos.tsx` renders it as an empty cell and has no filter for it. `guardarProyecto` refuses a client Proyecto with no Contacto, which is what makes editing assign one. `adivinarProyecto` filters by `contactoId`, so it never guesses a Proyecto sin Contacto.
- **Undo is data-driven.** A *vincular* on a Cotización records `DeshacerSugerencia` (a JSON column typed in `schema.ts`). `deshacerCotizacion` restores only what is still what the link wrote.

## Goals / Non-Goals

**Goals:**
- Attribution stays one pure decision in `carpetas.ts`, testable without the disk.
- A Proyectos folder never mints a Contacto unless the map names it.
- The link step (`vincularCotizacion`) stays the single place that writes what a linked Cotización implies: estado, link, notes, Cliente final, and now categoría and fecha de inicio.

**Non-Goals:**
- Changing how `Clientes/` folders or legacy Cotizaciones are attributed.
- Changing `adivinarProyecto`. Its Monto comparison (CFDI total with IVA against a Monto before IVA) stays as it is.

## Decisions

- **Split `atribuir` by origin instead of adding flags.** `importarCarpetaProyecto` calls a new `atribuirCarpetaProyecto(tx, mapa, nombre)` returning `{ contactoId: number | null, proyecto, clienteFinal, ambiguos: string[], ...Aportes }`:
  1. `mapa.buscar(nombre)` → `contactoDeFila`, as today.
  2. A name the map spells as a Contacto (`resolverSinFila`'s map branch) → that Contacto, created with `canonico` if missing, as today. This is the map's word, so it counts as rule 1.
  3. A Contacto whose `clave` equals the folder's → that Contacto. Keep `mejorEscrito` renaming, as `resolverContacto` does. No `parecidos` check and no insert.
  4. The Contactos of every Cotización for which `repartirNombres(c, nombre).nombre !== undefined`. Exactly one → that Contacto, and `clienteFinal = clienteFinalDeCotizacion(mapa, c) ?? basename(nombre)`, using the oldest such Cotización.
  5. Otherwise `contactoId: null`, and `ambiguos` holds the names of the Contactos found in step 4 when there were several.

  `atribuir` keeps serving `cotizacion` and `clientes`. Its `proyectos` branch goes away. Alternative: a `crear: false` option on `resolverContacto`. Rejected because the Cotización lookup and the null result have nothing to do with resolving a name.
- **Rule 3 counts every Cotización of that name, linked or not, whatever its estado.** Attribution asks whose project it is. A linked one is still evidence, and a second root's copy of the same folder must reach the same Contacto (and then match the existing Proyecto by name). Which Cotización gets *linked* stays `vincularCotizacion`'s rule: the oldest unlinked one of that Contacto.
- **Cliente final is decided at attribution, not by the link.** Rule 3 writes it on insert, so `vincularCotizacion` sees a Cliente final and writes none. Rejecting the link therefore keeps the Cliente final and the Contacto. Both come from attribution, which the map and the Ficha correct. Alternative: record it as `clienteFinalEscrito` so rejecting clears it. Rejected because a rejected link leaves the Proyecto under the same Contacto, and the project name is still its best Cliente final.
- **A Proyecto sin Contacto is found again by name among Proyectos sin Contacto.** `importarCarpetaProyecto` matches `existente` with `isNull(proyectos.contactoId)` and `etiqueta = 'cliente'` when `contactoId` is null. A personal Proyecto is never merged with an imported folder. `importadoSinMapa` is unchanged: it only finds folders imported under their own name before this change. `vincularCotizacion` is skipped when `contactoId` is null.
- **Categoría and fecha de inicio are written by `vincularCotizacion` and recorded for undo.** It sets `categoria` when the Proyecto's is `other`, and `fechaInicio` when null. `DeshacerSugerencia.proyecto` gains optional `categoriaEscrita` and `fechaInicioEscrita`, which are only present when written. `deshacerCotizacion` puts back `other` / null when the current value still equals what was written. Old Sugerencias without these fields undo as before. The correction branch in `sugerencias.ts` applies the same fill-if-empty to the chosen Proyecto, with no undo record, since a corrected answer is final. `proyectosDeCotizacionesAceptadas` adds `fechaInicio: c.fecha`. The JSON column's type changes, but no DDL does.
- **The log gets `proyectosSinContacto: { nombre: string; ruta: string; contactos: string[] }[]`.** `importarCarpetaProyecto` returns `sinContacto` and `ambiguos` on `ResultadoCarpeta`. `proyectosDeDisco` pushes only Proyectos it *created*, so Vista previa after a real scan lists nothing new. Vista previa and Vista previa desde cero already run `escanearCarpetas` on a copy, so they get the list for free. `nombrarNuevos` shows the Contacto as `''` → the renderer shows *sin Contacto*.
- **Renderer.** `FichaProyecto.tsx`: *Sin Contacto* when `contactoId === null && etiqueta === 'cliente'`, "Personal" otherwise. `Proyectos.tsx`: the same label, plus a `sin_contacto` filter value beside `personal`. `NuevoProyecto.tsx` already requires a Contacto for a client Proyecto, so the Ficha edit is how one gets assigned.
- **No new IPC channel.** `LogCarpetas` travels through the existing scan and preview channels.

## Risks / Trade-offs

- [A Contacto created by a legacy quote's filename that is really a project name (e.g. a quote filed as "Ruba") captures the folder by rule 2] → The owner fixes it with a map row, and Vista previa desde cero shows the result first. This is accepted: rule 2 before rule 3 was the owner's call.
- [A generic quoted name ("Sitio web") matches an unrelated folder of the same name] → Rule 3 needs one Contacto. A generic name quoted by several Contactos falls to Sin Contacto instead of guessing.
- [A new-format Cotización whose Proyecto is sin Contacto lands in the run's errors] → That is the existing refusal ("no se sabe de qué Contacto es el Proyecto"). It clears once the owner assigns a Contacto and re-scans.
- [Old phantom Contactos stay until the owner reimports] → By design: the map and these rules apply on first import. Reimportar desde cero is the path, previewed with Vista previa desde cero.
- [The Ficha shows *Sin Contacto* but its Proyecto still counts nowhere under a Contacto (Estado de Contacto, Contacto filter)] → Intended until assigned. The *Sin Contacto* filter makes them easy to find.

## Migration Plan

No schema migration. The change ships with the app. Existing data changes only when the owner runs Reimportar desde cero, which takes its Respaldo first. Rollback is restoring that Respaldo.
