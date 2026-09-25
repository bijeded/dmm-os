# Tasks

## 1. Types

- [x] 1.1 In `src/shared/dominio.ts`, add `proyectosSinContacto: { nombre: string; ruta: string; contactos: string[] }[]` to `LogCarpetas`. In `src/main/db/schema.ts`, add optional `categoriaEscrita` and `fechaInicioEscrita` to `DeshacerSugerencia.proyecto` (design.md, Decisions). Run `npm run db:generate` and confirm it writes no migration. Confirm `npm run typecheck` passes.

## 2. Attribution of a Proyectos folder

- [x] 2.1 Add `atribuirCarpetaProyecto` to `src/main/importacion/carpetas.ts` with the five steps from design.md, and remove the `proyectos` branch of `atribuir`. Pin each rule in `src/main/importacion/escaneo.test.ts` through `escanearCarpetas` on a temp root, removed in `afterEach`:
  - a map row wins over a Contacto of the folder's name and over a Cotización naming it
  - `Proyectos/AVC Noticias` matches the Contacto from `Clientes/AVC Noticias`
  - an existing Contacto wins over another Contacto's Cotización naming the folder
  - `Proyectos/Avanza` beside the Contacto "Avansa" creates no Contacto and no *fusionar*
  - a legacy quote `DMM - 280 - Alisha.pdf` with no folder still creates the Contacto "Alisha"
- [x] 2.2 Rule 3 in `importarCarpetaProyecto`. Pinned in `escaneo.test.ts`:
  - issue #195's acceptance case: the map row `Sublime,Sublime Inspiración,,`, Cotizaciones 308 and 320 naming “3 Moon Wishes”, and `Proyectos/3 Moon Wishes` → a Proyecto of "Sublime Inspiración" with Cliente final "3 Moon Wishes", *en curso*, a *vincular* for 308, 320 still *enviada*, and no Contacto "3 Moon Wishes"
  - a map row's `cliente final` for the Cotización wins over the folder's name
  - `Archivo/Proyectos/Ruba` attributed through a Cotización is *completado*
  - the same folder in `Proyectos/` and on the HDD → one Proyecto, two locations
  - the Cotización accepted by the link creates no Ingreso or Costo (ADR-0002)
  - the Contacto's Estado de Contacto counts the new *en curso* Proyecto (assert through `src/main/contactos.ts`)
- [x] 2.3 Rule 4, the Proyecto sin Contacto. `importarCarpetaProyecto` accepts a null Contacto, matches an existing client Proyecto sin Contacto by `clave`, never a personal one, and skips `vincularCotizacion`. Pinned in `escaneo.test.ts`:
  - a folder nothing names → an *en curso* Proyecto with no Contacto, its location recorded, no Contacto created
  - Cotizaciones of "Lukka" and "Sublime" both naming “Tingo” → a Proyecto sin Contacto, neither Cotización linked
  - `Archivo/Proyectos/Art Insights` → *completado*, no Contacto
  - the same name in two roots → one Proyecto sin Contacto with two locations
  - a personal Proyecto of the same name is not reused
  - after the Contacto is assigned by hand, a re-scan keeps it
  - a re-scan leaves a folder imported under its own name before this change where it was
- [x] 2.4 Return `sinContacto` and `ambiguos` on `ResultadoCarpeta`, and have `proyectosDeDisco` in `src/main/importacion/escaneo.ts` fill `log.proyectosSinContacto` for the Proyectos it created. Pinned in `escaneo.test.ts`: the Activista and Tingo entries (Tingo with `["Lukka", "Sublime"]`), and an empty list on a second scan. Pin in `src/main/handlers.test.ts`, where Vista previa desde cero is tested, that it lists "Tingo", and no longer lists it once the map gains `Tingo,Lukka,,Tingo`.

## 3. Categoría and fecha de inicio from the linked Cotización

- [x] 3.1 In `vincularCotizacion`, set `categoria` when the Proyecto's is `other` and `fechaInicio` when null, and record what was written in `deshacer`. In `proyectosDeCotizacionesAceptadas`, set `fechaInicio: c.fecha`. Pinned in `escaneo.test.ts`: 3 Moon Wishes gets `ecommerce` and 2021-03-10 with no fecha de fin or fecha de entrega; a Proyecto already holding a categoría or fecha de inicio keeps them; the accepted quote with no folder gets 2019-06-03 and `website`.
- [x] 3.2 In `deshacerCotizacion` (`src/main/sugerencias.ts`), restore `other` and a null fecha de inicio when they are still what the link wrote. In the correction branch, fill the chosen Proyecto's `other` categoría and empty fecha de inicio. Pinned in `src/main/sugerencias.test.ts`:
  - rejecting restores both
  - a fecha de inicio edited before rejecting is kept while the categoría reverts
  - a Sugerencia recorded without the new fields undoes as before
  - a correction reverts the guessed Proyecto and fills only the chosen one's empty fields ("Citli Tours 2" keeps 2023-06-01 and takes `website`)
- [x] 3.3 Pin in `src/main/importacion/facturas.test.ts` that with "3 Moon Wishes" (fecha de inicio 2021-03-10) and "Citli Tours" (2023-05-02) both *en curso* under one Contacto, an invoice dated 2022-02-01 matching no Monto proposes a *vincular* to "3 Moon Wishes" by fecha.

## 4. UI

- [x] 4.1 In `src/renderer/src/components/Logs.tsx`, list `proyectosSinContacto` under "Proyectos sin Contacto" (name, location, and the Contactos naming it) after a scan and in both Vista previa modes. Show a Proyecto nuevo with an empty Contacto as "sin Contacto". Pinned in `src/renderer/src/components/Logs.test.tsx`.
- [x] 4.2 In `src/renderer/src/components/Proyectos.tsx`, show *Sin Contacto* for a client Proyecto with no Contacto, and add a *Sin Contacto* filter that shows only those, excluding personal ones. In `FichaProyecto.tsx`, show *Sin Contacto* instead of "Personal" for such a Proyecto. Pinned in `src/renderer/src/components/Proyectos.test.tsx`, including that saving the edit without a Contacto shows the required-Contacto error and that choosing one calls `guardar` with it.
- [x] 4.3 Confirm Inicio and Finanzas list a Proyecto sin Contacto. Pin it in `src/main/proyectos.test.ts` through `listarProyectos`, which Inicio uses, and in `src/main/finanzas.test.ts` for an Ingreso linked to one.

## 5. Domain docs

- [x] 5.1 Update `CONTEXT.md`:
  - add **Proyecto sin Contacto**: a client Proyecto the Importación could not attribute, listed in Logs and Vista previa, and assigned from its Ficha
  - **Importación**: how a `Proyectos/` folder is attributed (map, a Contacto of its name, the Cotizaciones naming it, else sin Contacto), that such a folder never creates a Contacto, and that a linked Cotización gives its Proyecto categoría and fecha de inicio

  Verify that the wording matches the spec delta.

## 6. Review and checks

- [x] 6.1 Run `/code-review` on the branch diff and fix what it confirms.
- [x] 6.2 Run `/security-review`, since the change touches importacion's folder attribution and `sugerencias.ts`'s writes. Fix what it confirms.
- [x] 6.3 Run `npm run typecheck`, `npm run lint`, `npm test` and `openspec validate proyectos-atribuidos-por-cotizacion --strict`. All pass.
