# Tasks

## 1. Shared merge and CFDI link

- [x] 1.1 Create `src/main/atribucion.ts` and move `fusionar` from `sugerencias.ts` into it as `fusionarEn(tx, duplicadoId, originalId, { nombre })`, with `sugerencias.ts` calling it with `'mejorEscrito'`. Verify the existing *fusionar* tests in `src/main/sugerencias.test.ts` pass unchanged (`npm test -- src/main/sugerencias.test.ts`)
- [x] 1.2 Extract `vincularCfdiEn(tx, uuid, proyectoId, hoy)` from `completar-con-cobro.ts` `registrarCobro` into `atribucion.ts` (the UUID's non-cancelled Ingresos plus their Reembolsos, pending *vincular* answered, `proyectoId` set) and make `registrarCobro` use it. Verify `src/main/completar-con-cobro.test.ts` and `src/main/proyectos.test.ts` pass unchanged

## 2. Fusionar Contacto

- [x] 2.1 Write `fusionarContacto(db, id, destinoId)` in `atribucion.ts`: RFC conflict refused, destino keeps its name, empty details (notas included) filled, merged Contacto deleted, pending *fusionar* on the merged Contacto set *aceptada* (proposed the destino) or *corregida*. Verify in `src/main/atribucion.test.ts`: the Cantina 48 → Omar Rodriguez example, details filled, a USD Ingreso moved unchanged, recurring definitions moved, two different RFCs refused with nothing written, only-merged-has-RFC gives the destino that RFC, merging into itself refused, and both Sugerencia outcomes
- [x] 2.2 Verify in `src/main/contactos.test.ts` that after a merge the destino's Ficha shows the merged history, cobrado adds up, and Estado de Contacto is read from the moved Proyectos

## 3. Cambiar Contacto

- [x] 3.1 Write `cambiarContacto(db, entidad, id, contactoId)` and its read-only preview in `atribucion.ts` (Decision 3), ending with `borrarSiVacio` (Decision 4). Verify in `src/main/atribucion.test.ts`: from the Proyecto and from the Cotización the pair moves together; pending Plan de cobro Ingresos and a USD `mensual` definition with its Periodos generados follow; a cancelled imported pair keeps its estados; a CFDI Ingreso, a pending Sugerencia, a draft Cotización, a personal Proyecto and the same Contacto are each refused with nothing written; the emptied Contacto is deleted along with a pending *fusionar* about it; a Contacto with other records stays; the preview reports the same counts and deletion without writing
- [x] 3.2 Verify in `src/main/finanzas.test.ts` that a Periodo generado produced after Cambiar Contacto on a `mensual` Cotización belongs to the new Contacto
- [x] 3.3 Make `guardarProyecto` keep the stored Contacto whenever the Proyecto has one, and give a newly assigned Contacto to its Ingresos with none (Decision 5). Verify in `src/main/proyectos.test.ts`: the Proyecto sin Contacto "Bosque" example, and an edit that sends another `contactoId` for a Proyecto with a Contacto leaves it unchanged
- [x] 3.4 Add `'cambiarContacto'` to `AccionProyecto` and `AccionCotizacion` in `src/shared/dominio.ts` and offer it from their lifecycle modules. Verify in `src/main/ciclo-proyecto.test.ts` and `src/main/ciclo-cotizacion.test.ts`: offered in every estado for a client Proyecto with a Contacto and for every non-draft Cotización; not for a personal Proyecto, a Proyecto sin Contacto or a draft

## 4. Asignar proyecto

- [x] 4.1 Write `opcionesAsignar(db, ingresoId)` and `asignarProyecto(db, ingresoId, proyectoId | null, hoy)` in `atribucion.ts` (Decision 6). Verify in `src/main/atribucion.test.ts`: Ingreso 481 onto Cantina 48; moved between Proyectos; Sin proyecto keeps the Contacto; three Parcialidades move together; a Reembolso follows; a USD Ingreso keeps its amounts; a Contacto-less Ingreso lists every client Proyecto and takes the chosen one's Contacto while that Contacto's RFC stays; another Contacto's Proyecto, a personal Proyecto, a cancelled Ingreso, a Reembolso row and a hand-entered Ingreso are refused; pending *vincular* answered *aceptada*, *corregida* and *rechazada*
- [x] 4.2 Add `'asignarProyecto'` to `AccionIngreso` and offer it in `ciclo-ingreso.ts`. Verify in `src/main/finanzas.test.ts` that the Ingresos list offers it only on non-cancelled CFDI rows that are not Reembolsos
- [x] 4.3 Verify in `src/main/proyectos.test.ts` that Sin ingresos registrados clears when a $9,000 paid CFDI is assigned to a completed Proyecto with files, shows when its only paid Ingreso is taken away, and that neither changes the Proyecto's estado; and that a pending CFDI assigned to an en curso Proyecto shows in its Por cobrar and keeps Completar refused
- [x] 4.4 Verify in `src/main/importacion/facturas.test.ts` that a Facturas run over the same XML after Asignar proyecto keeps the Ingreso's Proyecto and Contacto and creates no second Ingreso

## 5. IPC

- [x] 5.1 Declare the channels of Decision 7 and their types in `src/shared/contrato.ts` and `src/shared/dominio.ts`, wire them in `src/main/handlers.ts` through `alDiaDb()` with payload checks (positive integer ids, `null` only where allowed, `entidad` one of the two literals), and expose them in the preload. Verify in `src/main/handlers.test.ts` (including a malformed payload refused for each channel and the Al día entry list) and `src/main/ipc.test.ts`

## 6. Dialogs

- [x] 6.1 Add Fusionar en… to `FichaContacto.tsx`: a `role="dialog"` with the Contacto `<select>` (not itself), the counts that move and that this Contacto will be deleted, main's refusal in place, navigation to the destino on success, nothing written on close. Verify in `src/renderer/src/components/FichaContacto.test.tsx`
- [x] 6.2 Add Cambiar contacto to `FichaProyecto.tsx` and `FichaCotizacion.tsx`, showing the preview (what moves, which Contacto will be deleted) and main's refusals. Make the Contacto field in `NuevoProyecto.tsx` read-only for a Proyecto that has one. Verify in `src/renderer/src/components/Proyectos.test.tsx` and `src/renderer/src/components/Cotizaciones.test.tsx`
- [x] 6.3 Add Asignar proyecto to the Ingresos rows in `Finanzas.tsx`: a `role="dialog"` with the Proyecto `<select>` (current marked, Contacto names shown when the Ingreso has none, Sin proyecto), main's refusal in place, list refreshed on success. Verify in `src/renderer/src/components/Finanzas.test.tsx`
- [ ] 6.4 Run the app against a copy of the live database and fix Cantina 48: Cambiar contacto to Omar Rodriguez (Contacto "Cantina 48" deleted), then Asignar proyecto on its CFDI Ingresos; check Contactos, Proyectos, Finanzas and Logs afterwards (ask before using browser automation)

## 7. Domain docs

- [x] 7.1 Update `CONTEXT.md`: define **Fusionar Contacto**, **Cambiar Contacto** and **Asignar proyecto**; note under **Proyecto sin Contacto** that Editar assigns a Contacto only while it has none, and under **Reimportar desde cero** that corrections made with these commands are lost like any edit to imported records. Verify by reading the diff

## 8. Review and checks

- [ ] 8.1 Run `/code-review` on the branch diff and fix what it confirms
- [ ] 8.2 Run `/security-review`, since the change touches `src/shared/contrato.ts`, `src/main/handlers.ts`, the preload and database writes, and fix what it confirms
- [ ] 8.3 Run `npm run typecheck`, `npm run lint` and `npm test`, and confirm all three pass
