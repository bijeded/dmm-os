# Tasks

## 1. Answer shape and opciones

- [x] 1.1 In `src/shared/dominio.ts`, add `Eleccion`, `OpcionSugerencia`, and `opciones` / `varias` on `Sugerencia`, and widen `RespuestaSugerencia` to `'aceptada' | 'rechazada' | Eleccion` (design.md §1–2). In `src/main/db/schema.ts`, add `corregida` to the `estado` enum. Run `npm run db:generate` and confirm it writes no migration. If it does write one, check that it survives a rebuild under ADR-0003 in `src/main/db/migrations.test.ts`. Verify `npm run typecheck` passes.
- [x] 1.2 In `src/main/sugerencias.ts`, make `pendientes()` fill `opciones` and `varias` per design.md §2. Read Contactos and Proyectos once per call. Pinned in `src/main/sugerencias.test.ts`:
  - a Cotización *vincular* offers its Contacto's Proyectos with no Cotización, plus the guess
  - an Ingreso *vincular* offers all of its Contacto's Proyectos and none of another Contacto's
  - *fusionar* offers every Contacto but the duplicate
  - *ubicación* and a Costo *vincular* offer none
  - only the guess is `sugerida`, and the list is sorted by `nombre`
  - once the Sugerencia holding "3 Moon Wishes" is rejected, the other Cotización's Sugerencia offers it

## 2. Answering with a choice

- [x] 2.1 Extract the Cotización rejection branch of `vincular` into `deshacerCotizacion(tx, s)` with no change in behavior. Verify the existing rejection cases in `src/main/sugerencias.test.ts` still pass.
- [x] 2.2 In `responderEn`, validate the answer and check an `Eleccion` against the opciones recomputed in the transaction (design.md §3). Record `aceptada` when `elegidas` equals the `sugerida` set, and `corregida` otherwise. Pinned in `sugerencias.test.ts`: an id not offered, an empty or duplicated `elegidas`, two ids for a single choice, an `Eleccion` on *ubicación*, and a malformed value (a string other than the literals, `elegidas` holding a non-integer) are each refused with the Sugerencia still pending and nothing changed. Choosing the guess records `aceptada`.
- [x] 2.3 Cotización correction: `deshacerCotizacion`, then set the Cotización *aceptada* and link it to the chosen Proyecto (design.md §5). Pinned in `sugerencias.test.ts`:
  - the guessed Proyecto has no Cotización and its notes and Cliente final are restored
  - the chosen Proyecto holds the Cotización with its own notes and Cliente final unchanged
  - the Cotización is *aceptada*
  - no Ingreso or Costo is created (ADR-0002)
  - the Sugerencia is `corregida`
  - a chosen Proyecto that gained a Cotización after the read is refused
- [x] 2.4 Ingreso correction: link the Ingreso to the chosen Proyecto. Pinned in `sugerencias.test.ts` with an MXN Ingreso, and with a USD Ingreso whose original amount, rate and peso amounts are unchanged, and with a *cancelado* Ingreso that stays *cancelado*. Pin in the same file that `estadoCobro` of the chosen Proyecto (what Sin ingresos registrados reads) loses its faltante when the corrected paid Ingreso covers the quote total, and that `resumenFinanzas().cobros` names the chosen Proyecto for a pending Ingreso.
- [x] 2.5 *fusionar* correction: call `fusionar` with the chosen Contacto. Pinned in `sugerencias.test.ts`:
  - the duplicate's Cotizaciones, Proyectos and Ingresos move to the chosen Contacto, and the guessed Contacto is unchanged
  - another pending *fusionar* that named the duplicate now names the chosen Contacto
  - the chosen Contacto stops being a cold lead in Estado de Contacto
  - a chosen Contacto merged away after the read is refused
- [x] 2.6 Pin in `sugerencias.test.ts` that `aceptarVincular` still accepts every pending guess, and in `src/main/importacion/escaneo.test.ts` that a `corregida` Cotización Sugerencia is not asked again by a second scan, with the Cotización still linked to the chosen Proyecto.

## 3. IPC

- [x] 3.1 Update the `importacion.responder` doc comment in `src/shared/contrato.ts`; the signature is unchanged. Pinned in `src/main/handlers.test.ts`: `responder(id, { elegidas: [otroProyecto] })` returns the remaining pending Sugerencias, and the Ingreso is linked to the chosen Proyecto.

## 4. Logs UI

- [x] 4.1 In `src/renderer/src/components/Logs.tsx`, give each *vincular* or *fusionar* row with more than one opción a `<select>` preset to the `sugerida` opción (design.md §7). Aceptar sends `'aceptada'` while the guess is selected and `{ elegidas: [id] }` otherwise. After a refresh, a selection that is no longer offered resets to the guess. Pinned in `src/renderer/src/components/Logs.test.tsx`:
  - Aceptar with the guess still calls `responder(1, 'aceptada')`
  - selecting another Proyecto and clicking Aceptar calls `responder(1, { elegidas: [id] })`
  - a row with only the guess shows no selector
  - *ubicación* rows are unchanged
  - Aceptar todas after changing a selection calls only `aceptarVincular`
  - a refused answer shows its message in the Aviso

## 5. Domain docs

- [x] 5.1 Update `CONTEXT.md` **Sugerencia de importación**: it is answered once, by accepting the guess, rejecting it, or choosing another of its opciones (another Proyecto of the Contacto, or another Contacto to merge into), and a choice records the Sugerencia as *corregida*. Update **Importación** ("A rejected Sugerencia undoes exactly what its guess changed") so that it covers a corrected one too. Verify the wording matches the spec delta.

## 6. Review and checks

- [ ] 6.1 Run `/code-review` on the branch diff and fix what it confirms.
- [ ] 6.2 Run `/security-review`, since the change widens what `importacion.responder` accepts over IPC, and fix what it confirms.
- [ ] 6.3 Run `npm run typecheck`, `npm run lint`, `npm test` and `openspec validate sugerencias-con-eleccion --strict`. All pass.
