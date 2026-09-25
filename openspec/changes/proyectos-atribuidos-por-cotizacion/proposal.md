## Why

A `Proyectos/` folder that no Mapa de nombres row names is attributed under its own name, and a Contacto of that name is created when none exists. Project folders are usually named after the project, not the client, so 66 of the 182 Contactos exist only because of a folder (3 Moon Wishes, Alisha, Avansa…). Their Proyectos sit under that phantom Contacto instead of the client: 3 Moon Wishes belongs to Sublime, whose Cotizaciones 308 and 320 name it. Imported Proyectos also have no dates and are all categoría `other`.

## What Changes

A `Proyectos/` folder (in `Proyectos/`, `Archivo/Proyectos/` or on the external HDD) is attributed by these rules, in order:

1. **Mapa de nombres row**: unchanged, and it always wins. A name the map spells as a Contacto still resolves to that Contacto.
2. **An existing Contacto of the folder's name**: matched as today, but a `Proyectos/` folder **never creates** a Contacto. `Proyectos/AVC Noticias` matches the Contacto from `Clientes/AVC Noticias`.
3. **The Cotizaciones that deliver a Proyecto of the folder's name**: the stored Cotización name (the PDF's `“…”` name from #194, a map row's `proyecto`, or the `Cliente - Proyecto` split). When all of them belong to one Contacto, the folder becomes that Contacto's Proyecto. It links to the oldest unlinked one through a *vincular* Sugerencia, as today. Its Cliente final is the map's Cliente final for that Cotización, else the folder's name ("3 Moon Wishes" under Sublime).
4. **Otherwise, a Proyecto with no Contacto**. This also covers Cotizaciones of several Contactos naming the project. Its location is recorded, and no Contacto is created. Logs, Vista previa and Vista previa desde cero list it under **Proyectos sin Contacto**, with the Contactos whose Cotizaciones name it, so the owner adds map rows before the real run.

Settled with the owner:
- Rule 2 comes before rule 3. Existing Contactos come from `Clientes/` folders, legacy quote filenames or the map, so they are mostly real clients.
- Cotizaciones of different Contactos naming the same project are ambiguous. The folder falls to rule 4.
- A completed Proyecto gets **no fecha de fin or fecha de entrega**. A fecha de fin taken from file dates would often fall before the final invoice, and CFDI → Proyecto guessing only considers Proyectos whose fecha de fin is on or after the invoice.
- Cliente final under rule 3 is the project's name unless the map gives one.

**Dates and categoría from the linked Cotización**: when the folder scan links a Cotización to a Proyecto (by *vincular*, under any rule), a Proyecto whose categoría is `other` takes the Cotización's categoría. A Proyecto with no fecha de inicio takes the Cotización's fecha. A Proyecto created for an accepted Cotización with no folder takes its fecha de inicio too; it already takes its categoría. Rejecting the *vincular* Sugerencia restores both, unless they were edited since.

**Estado is unchanged** (ADR-0002): `Proyectos/` → *en curso*; `Archivo/` and the HDD → *completado*.

**A Proyecto with no Contacto in the app**: the Proyectos list and the Ficha show *Sin Contacto* for a client Proyecto with none, instead of a blank cell or "Personal". The list's Contacto filter offers *Sin Contacto*. Editing it through the Ficha requires choosing a Contacto, which is how the owner assigns one.

This is change [3] of the import-quality epic (#191), issue #195. Its blocker, #194 (`cotizaciones-desde-pdf`), has shipped and been archived.

CONTEXT.md terms touched: Contacto, Proyecto, Cliente final, Cotización, Sugerencia de importación, Importación, Mapa de nombres, Vista previa. New term: **Proyecto sin Contacto**, a client Proyecto the Importación could not attribute to any Contacto.

This change contradicts no ADR. ADR-0002 holds: linking by import creates no Ingresos or Costos, and the estado a folder implies is written directly.

## Non-goals

- Moving Proyectos and Cotizaciones already imported. The map and these rules apply on first import. Existing phantom Contactos go away through Reimportar desde cero.
- Removing Contactos that come from a legacy Cotización's filename or a `Clientes/` folder. Quote-only leads remain Contactos.
- A fecha de fin or fecha de entrega for imported Proyectos, from file dates or anything else.
- Completing old *en curso* Proyectos. That is #196 (Completar con cobro).
- Comparing CFDI totals with a Cotización's Monto before IVA when guessing a Proyecto. Only the new fecha de inicio changes that guess.
- A new-format Cotización naming a Proyecto sin Contacto. It still cannot tell whose it is and lands in the run's errors, as today.
- An in-app action to assign Proyectos sin Contacto in bulk. The map and the Ficha's edit cover it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `importacion`:
  - adds requirements for attributing a `Proyectos/` folder with no map row (existing Contacto, then the Cotizaciones naming it, then no Contacto), for listing Proyectos sin Contacto in Logs, Vista previa and Vista previa desde cero, for a Proyecto's categoría and fecha de inicio from its linked Cotización, and for how a Proyecto sin Contacto shows in the Proyectos list and Ficha
  - modifies the requirement for a *vincular* Sugerencia answered with another Proyecto, so rejecting or correcting also restores the categoría and fecha de inicio the link wrote

## Impact

- `src/main/importacion/carpetas.ts`: `atribuir` gets a `proyectos` path that matches without creating, then looks up Cotizaciones by name. `importarCarpetaProyecto` allows a null Contacto and matches an existing Proyecto sin Contacto by name. `vincularCotizacion` writes categoría and fecha de inicio and records them for undo. `proyectosDeCotizacionesAceptadas` sets fecha de inicio.
- `src/main/importacion/escaneo.ts`: collects the Proyectos sin Contacto into the log.
- `src/main/sugerencias.ts`: `deshacerCotizacion` restores categoría and fecha de inicio.
- `src/shared/dominio.ts`: `LogCarpetas` gains `proyectosSinContacto`.
- `src/renderer/src/components/Logs.tsx`, `Proyectos.tsx`, `FichaProyecto.tsx`: the new list, the *Sin Contacto* label and filter.
- `src/main/importacion/comprobantes.ts`: unchanged, but its guesses now see real fecha de inicio.
- No schema change: `proyectos.contacto_id` is already nullable and `proyectos_personal_sin_contacto` already allows a client Proyecto with no Contacto.
- `CONTEXT.md`: Proyecto sin Contacto, and the Importación entry.
