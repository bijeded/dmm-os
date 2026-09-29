# Proposal

## Why

The Importación attributes some records to the wrong Contacto or leaves them without a Proyecto, and the app offers no way to correct that short of editing `_nombres.csv` and running Reimportar desde cero, which discards every correction and answer made since. For example, "DMM - 190 - Cantina 48.pdf" created a Contacto "Cantina 48" of its own, though the job was for Zamora Live (now the Contacto "Omar Rodriguez"). All 21 of that Contacto's CFDI Ingresos sit on no Proyecto, and 37 CFDI Ingresos have no Contacto at all because the parent company that paid holds an RFC no Contacto has. The owner wants to fix imported records in place, not import them again.

Intent: let the owner correct, in the app, which Contacto a Cotización and Proyecto belong to and which Proyecto an invoice belongs to.

## What Changes

- **Fusionar Contacto**: from the Ficha del Contacto, merge it into another Contacto the owner chooses. Everything it has (Cotizaciones, Proyectos, Ingresos, recurring Ingreso definitions) moves to the chosen Contacto, the chosen Contacto keeps its name and fills its empty details from the merged one, and the merged Contacto is deleted. It is refused when both hold different RFCs.
- **Cambiar Contacto**: from the Ficha of a Cotización or of a Proyecto, move the pair (the Cotización and the Proyecto it led to) to another Contacto, with their Ingresos and recurring Ingreso definitions. It is refused while any of their Ingresos comes from a CFDI (the invoice names its receptor, so Fusionar is the tool for that) and while a Sugerencia de importación about them is pending. The Contacto field of the Editar form of a Proyecto with no Cotización moves the same records under the same rules.
- **A Contacto left empty is deleted**: after Cambiar Contacto, the Contacto it left behind is deleted when it no longer has any Cotización, Proyecto or Ingreso (Borrar vs cancelar allows it). The dialog says so before confirming.
- **Asignar proyecto to an invoice**: from a CFDI Ingreso's row in Finanzas, choose another Proyecto of its Contacto, or none. All Ingresos of that CFDI (its Parcialidades) and their Reembolsos move together, and any pending *vincular* Sugerencia de importación for them is answered. A CFDI Ingreso with no Contacto can be given any client Proyecto and takes that Proyecto's Contacto; the Contacto's own RFC is untouched.
- Derived facts (Estado de Contacto, the Ficha del Contacto's cobrado and por cobrar, the Ficha del Proyecto's Cobrado, Por cobrar and Completar, Cobros, Sin ingresos registrados) are read from the moved records; nothing is stored for them.

CONTEXT.md terms touched: Contacto, Cotización, Proyecto, Ingreso, Parcialidad, Reembolso, Sugerencia de importación (*vincular*, *fusionar*), Estado de Contacto, Borrar vs cancelar, Proyecto sin Contacto, Importación, Reimportar desde cero, Sin ingresos registrados. New terms: **Fusionar Contacto**, **Cambiar Contacto**, **Asignar proyecto**.

No ADR is contradicted. ADR-0002 governs lifecycle transitions; these commands change no estado. The Importación rule that a map edit reaches imported records only through Reimportar desde cero stays true: these are edits in the app, and like any edit to imported records they are lost if the owner ever runs Reimportar desde cero.

## Capabilities

### New Capabilities
- `contactos`: correcting which Contacto records belong to: Fusionar Contacto, Cambiar Contacto of a Cotización and its Proyecto, and deleting the Contacto a correction leaves empty.

### Modified Capabilities
- `finanzas`: Asignar proyecto on a CFDI Ingreso's row in the Finanzas Ingresos list.

## Non-goals

- Moving or renaming anything on disk: the `Clientes/` folder of a merged or emptied Contacto, the Proyecto's folder, and a Cotización's printed PDF stay as they are.
- Editing `_nombres.csv` from the app, or suggesting a map row for a correction.
- Moving a CFDI Ingreso to another Contacto's Proyecto, or changing a CFDI Ingreso's Contacto except by Fusionar or by giving a Contacto-less one a Proyecto.
- Giving a Contacto the RFC of an invoice assigned to it.
- Asignar proyecto for hand-entered Ingresos or Periodos generados; they belong to their Plan de cobro or definition.
- Moving a Costo between Proyectos.
- Undoing a Fusionar Contacto, or bringing back a deleted empty Contacto.
- Reopening or completing a Proyecto because its Ingresos changed: its estado stays as it was.

## Impact

- `src/main`: a new pure module for the corrections (Fusionar Contacto, Cambiar Contacto, Asignar proyecto) reusing the Contacto merge in `sugerencias.ts`, `responderEn`, `reembolsosDe`, and `borrar`; `proyectos.ts` `guardarProyecto` routes a Contacto change through Cambiar Contacto; `contactos.ts`, `cotizar.ts`, `proyectos.ts` and `finanzas.ts` report whether each action is offered.
- `src/shared/contrato.ts` and `dominio.ts`: new channels under `contactos`, `cotizaciones`, `proyectos` and `finanzas`, and their types.
- `src/renderer`: a Fusionar dialog in `FichaContacto.tsx`, a Cambiar Contacto dialog in `FichaCotizacion.tsx` and `FichaProyecto.tsx`, and an Asignar proyecto dialog in `Finanzas.tsx`.
- No schema change.
- CONTEXT.md: define the three new terms; note under Proyecto sin Contacto and Reimportar desde cero how they relate.
