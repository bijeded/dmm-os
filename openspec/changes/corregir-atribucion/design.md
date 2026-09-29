# Design

## Context

See proposal.md, Why. Current state:

- `contactoId` lives on `cotizaciones`, `proyectos`, `ingresos` and `definiciones_ingreso`. Costos reach a Contacto only through their Proyecto or Cotización. `contactos.rfc` is unique.
- `sugerencias.ts` `fusionar(tx, duplicadoId, originalId)` already merges two Contactos: it repoints the four tables, repoints pending Sugerencias that name the duplicate as `contactoId`, settles a reverse *fusionar*, deletes the duplicate before updating the original (the RFC is unique), keeps `mejorEscrito` of the two names, and fills the original's empty details (not `notas`). It is private to the module and runs only from `responderEn`.
- `proyectos.ts` `guardarProyecto` lets Editar change `contactoId` of a Proyecto with no Cotización, but moves none of its Ingresos, so they keep the old Contacto. A Proyecto from a Cotización keeps the quote's Contacto.
- `cotizar.ts` `guardarCotizacion` changes a draft's Contacto; a draft has no Proyecto or Ingresos.
- `completar-con-cobro.ts` `registrarCobro` already links one CFDI to a Proyecto: all Ingresos of the UUID plus their Reembolsos (`reembolsosDe`), answering pending *vincular* Sugerencias with `responderEn(tx, s, { elegidas: [id] })`.
- An *ingreso* *vincular* Sugerencia changes nothing until accepted (`vincular` sets `proyectoId` then). Its opciones are the Proyectos of the Ingreso's Contacto.
- The Facturas run never rewrites `contactoId` or `proyectoId` of an Ingreso it already imported (`releerSiImportado` only re-reads IVA and retenciones).
- `db/cancelacion.ts` `borrar` deletes and maps a FOREIGN KEY failure to `RegistroVinculadoError`.
- `sugerencias_importacion.contacto_id` cascades on delete; `entidad_id` is not a foreign key, so a *fusionar* whose `entidad` is a deleted Contacto would dangle.
- Row actions come from lifecycle modules (`ciclo-ingreso.ts` `accionesIngresos`, `accionesCotizacion`, `AccionProyecto`), and the renderer shows what `acciones` lists.

## Goals / Non-Goals

**Goals:**
- One pure module owns every attribution rule; handlers stay thin.
- Each command is one transaction: it moves everything or nothing.
- Reuse the existing merge and CFDI-link code instead of writing a second copy.

**Non-Goals:**
- A general "move any Ingreso" action; only CFDI Ingresos (see proposal Non-goals).
- Recording corrections anywhere for Reimportar desde cero to replay.

## Decisions

### 1. A new module `src/main/atribucion.ts`
Holds `fusionarContacto(db, id, destinoId)`, `cambiarContacto(db, entidad, id, contactoId)`, `asignarProyecto(db, ingresoId, proyectoId | null, hoy)`, and the read functions the dialogs need (`opcionesAsignar`, what Cambiar contacto would move and whether the old Contacto would be deleted). Each command opens its own transaction and exports a `…En(tx, …)` form where another command needs it.
*Alternative*: spread them over `contactos.ts`, `proyectos.ts` and `movimientos.ts`. Rejected: the three share the "move these records and settle their Sugerencias" logic and the empty-Contacto rule.

### 2. One merge for Sugerencias and the manual action
Move `fusionar` out of `sugerencias.ts` into `atribucion.ts` as `fusionarEn(tx, duplicadoId, originalId, { nombre })`, where `nombre` is `'mejorEscrito'` for the Sugerencia path (unchanged behaviour) and `'destino'` for Fusionar en…. Only the manual path also fills an empty `notas`, so the Sugerencia path stays exactly as its tests pin it. `sugerencias.ts` imports it back.
Added for the manual path, inside the same transaction and before the delete:
- Refuse when both RFCs are set and differ.
- Pending *fusionar* Sugerencias with `entidad = 'contacto'`, `entidadId = duplicado`: set `aceptada` when `contactoId = destino`, else `corregida`. Written directly, not through `responderEn`, since the merge has already happened and `decidir` would try to merge again.
*Alternative*: keep two merge functions. Rejected: they would drift on which tables move.

### 3. Cambiar Contacto moves by Cotización and Proyecto ids
Resolve the pair (Cotización id, Proyecto id, either may be null) from the entry point, then update `contactoId` on: the Cotización; the Proyecto; `ingresos` where `proyectoId` is the Proyecto or `cotizacionId` is the Cotización (this includes Reembolsos, Parcialidades, Periodos generados and Incobrable ones); `definiciones_ingreso` with either id. Refusals, checked before any write:
- the chosen Contacto is the current one or does not exist;
- the Proyecto is personal, or the Cotización is a draft (Editar handles drafts);
- any of those Ingresos has `cfdiUuid`;
- a pending Sugerencia has `entidad`/`entidadId` equal to the Cotización, the Proyecto or one of those Ingresos, or `proyectoId` equal to the Proyecto.
The pending-Sugerencia refusal avoids re-deciding what a *vincular* guess means once its record changes Contacto.
*Alternative*: move CFDI Ingresos too. Rejected in exploration: it breaks "a CFDI Ingreso's Contacto is its receptor", and Fusionar covers the same-company case.

### 4. The empty-Contacto rule
`borrarSiVacio(tx, contactoId)` runs at the end of Cambiar Contacto: when no Cotización, Proyecto, Ingreso or definición de ingreso names the Contacto, delete pending *fusionar* Sugerencias whose `entidad = 'contacto'` and `entidadId` is it (they propose merging something that no longer exists), then `borrar(tx, 'contacto', id)`. The FK cascade removes Sugerencias that name it as `contactoId`. The dialog learns in advance from the read function, which runs the same check without writing. Fusionar en… always deletes the merged Contacto (Decision 2), so it does not need this.
Not applied to the Editar forms: a Contacto created by hand as a cold lead must not disappear because a draft was pointed elsewhere.

### 5. Editar locks the Contacto once set
`guardarProyecto` keeps the stored `contactoId` whenever the Proyecto already has one (today it does so only for Proyectos with a Cotización). When the Proyecto had none and gets one, the same transaction sets that Contacto on its Ingresos with `contactoId IS NULL`. `NuevoProyecto.tsx` shows the Contacto read-only in that case. The Ficha offers Cambiar contacto instead, through a new `AccionProyecto` `'cambiarContacto'`, offered for client Proyectos with a Contacto in any estado. `AccionCotizacion` gains `'cambiarContacto'` for every estado but `borrador`.

### 6. Asignar proyecto reuses the CFDI link
Extract from `registrarCobro` a `vincularCfdiEn(tx, uuid, proyectoId | null, hoy)` that gathers the UUID's non-cancelled Ingresos and their Reembolsos, answers their pending *vincular* Sugerencias, and sets `proyectoId`. Completar con cobro calls it with its own filters unchanged (same Contacto, no Proyecto yet). Asignar proyecto adds:
- The target is a client Proyecto. When the Ingresos have a Contacto, the target's `contactoId` must equal it; when they have none, any client Proyecto is allowed and its `contactoId` is written onto the Ingresos and Reembolsos in the same step.
- Sugerencia answers: the chosen Proyecto via `responderEn(tx, s, { elegidas: [id] })` (it records *aceptada* or *corregida* itself); `null` via `responderEn(tx, s, 'rechazada')`. A Contacto-less Ingreso has no opciones, so its Sugerencias are none (the Facturas run only guesses with a Contacto).
- `ingresos.cotizacionId` is left as it is: no CFDI Ingreso carries one today, and cobro reads Ingresos by `proyectoId`.
`AccionIngreso` gains `'asignarProyecto'`, offered by `ciclo-ingreso.ts` when `cfdiUuid` is set, `reembolsoDeId` is null and estado is not `cancelado`.

### 7. IPC
New channels in `src/shared/contrato.ts`, wired in `handlers.ts` through `alDiaDb()` with payload checks at the boundary:
- `contactos.fusionar(id, destinoId) → number` (the destino id to navigate to)
- `cotizaciones.cambiarContacto(id, contactoId) → FichaCotizacion`, `proyectos.cambiarContacto(id, contactoId) → FichaProyecto`, and `contactos.previaCambio(entidad, id, contactoId) → { mueve: {cotizaciones, proyectos, ingresos}, borraContacto: string | null }` for the dialog text
- `finanzas.opcionesAsignar(ingresoId) → { actual: number | null, proyectos: { id, nombre, contacto, estado }[] }` and `finanzas.asignarProyecto(ingresoId, proyectoId | null) → void`

### 8. Dialogs
Hand-rolled `role="dialog"` elements following `FormContacto.tsx` and the Completar con cobro dialog: a Contacto `<select>` (Fusionar en…, Cambiar contacto) and a Proyecto `<select>` with Sin proyecto (Asignar proyecto). Main's refusals show in place; closing writes nothing.

## Risks / Trade-offs

- [Reimportar desde cero discards every correction] → Already true of every edit to imported records; the owner chose to fix in place. The confirmation Reimportar already shows covers it.
- [A Contacto-less CFDI assigned to a Proyecto gets a Contacto whose RFC differs from its receptor] → Intended (a parent company paying). Later Cambiar Contacto on that Proyecto is refused because it has a CFDI; the owner can set the invoice to Sin proyecto first.
- [Moving `fusionar` could change the Sugerencia path] → The `nombre`/`notas` options keep it byte-for-byte; its existing tests in `sugerencias.test.ts` must pass unchanged.
- [Deleting the emptied Contacto loses its email, teléfono and notas] → The dialog names the Contacto that will be deleted before confirming. Fusionar en… is the alternative that keeps them.
- [A sent Cotización's printed PDF still names the old Contacto] → Out of scope; the PDF is history.

## Migration Plan

No schema change and no data migration. The owner fixes Cantina 48 by hand after release: Cambiar contacto (or Fusionar en…) to Omar Rodriguez, then Asignar proyecto on its CFDI Ingresos.
