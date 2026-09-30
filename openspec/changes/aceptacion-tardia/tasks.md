# Tasks

## 1. Lifecycle rule

- [ ] 1.1 Add `aceptarTarde` to `AccionCotizacion` (`src/shared/dominio.ts`) and to `REGLAS` in `src/main/ciclo-cotizacion.ts`: allowed on `expirada` and `rechazada`, refused when the Cotización already has a Proyecto. Verify in `src/main/ciclo-cotizacion.test.ts`: expirada and rechazada offer `['aceptarTarde', 'cambiarContacto']`, borrador/enviada/aceptada/cancelada never offer it, and a Cotización with a Proyecto refuses it with its message

## 2. Shared pieces

- [ ] 2.1 Extract `registrarAceptacion` from `aceptarCotizacion` in `src/main/cotizar.ts` (plan, transaction, folder), leaving `aceptarCotizacion` as guard + call. Verify: `npm test -- src/main/cotizar.test.ts` passes unchanged
- [ ] 2.2 Extract `proyectoDeCotizacionAceptada(tx, c, mapa)` and `preguntarPartidas(tx, c)` from `src/main/importacion/carpetas.ts`, and export both. Verify: `npm test -- src/main/importacion/escaneo.test.ts` passes unchanged

## 3. Aceptación tardía

- [ ] 3.1 Add the `OpcionesAceptacionTardia` and `EleccionAceptacionTardia` types to `src/shared/dominio.ts`, and `opcionesAceptacionTardia` to the new `src/main/aceptacion-tardia.ts`. Verify in `src/main/aceptacion-tardia.test.ts`: an imported Cotización lists its Contacto's Proyectos with no Cotización and not cancelled; one made in the app lists none
- [ ] 3.2 Implement `aceptarTarde` for a Cotización made in the app, with guard + `registrarAceptacion` dated hoy. Verify in `src/main/aceptacion-tardia.test.ts` (temp `DMM OS` folder removed after each test):
  - MXN one-off: aceptada, Proyecto en curso, folder and pending Ingreso of $46,400.00
  - USD at 18.50: $37,000.00 with the USD original
  - USD without tipo de cambio: refused, nothing written
  - mensual: September Periodo generado exists
- [ ] 3.3 Implement `aceptarTarde` for an imported Cotización, in one transaction. Verify in `src/main/aceptacion-tardia.test.ts`:
  - Link to an existing Proyecto: estado kept, categoría inherited over `other`, no Ingresos or Costos
  - Proyecto nuevo: completado, named after its project, `importado`, *ubicación* proposed, no folder
  - 2+ prices propose *partidas*
  - USD needs no tipo de cambio
  - A `proyectoId` that is not an option is refused, changing nothing
- [ ] 3.4 Pin that it stays aceptada and derived facts follow. Verify in `src/main/aceptacion-tardia.test.ts`:
  - `dbAlDia` on the next day keeps it aceptada
  - The Estado de Contacto becomes Cliente activo
  - `listarCotizaciones` conversion rises
  - Cobros lists the Ingreso under *Por facturar*
  - Sin ingresos registrados shows for a linked archived Proyecto, and clears once the Ingresos are entered
- [ ] 3.5 Pin cancellation. Verify in `src/main/aceptacion-tardia.test.ts`: a late-accepted Cotización made in the app cancels with Cancelación con pagos and does not return to expirada; an imported one with Proyecto nuevo does not offer `cancelar`
- [ ] 3.6 Pin Reimportar desde cero. Verify in `src/main/importacion/reimportar.test.ts`: after an Aceptación tardía of an imported Cotización with Proyecto nuevo, the reimport is not refused, removes that Proyecto, and the Cotización comes back expirada

## 4. IPC

- [ ] 4.1 Declare `cotizaciones.opcionesAceptarTarde` and `cotizaciones.aceptarTarde` in `src/shared/contrato.ts`, and wire them in `src/main/handlers.ts` on `alDiaDb()` and `hoy()`, with `idValido` and a validated `eleccion`. Verify in `src/main/handlers.test.ts`: both entries are added to "Every ledger command works Al día", and the round trip works through handlers for an expirada Cotización

## 5. Ficha de la Cotización

- [ ] 5.1 Add the `AceptacionTardia` dialog and the **Marcar como aceptada…** button to `src/renderer/src/components/FichaCotizacion.tsx`. The dialog has a Plan de cobro text and a tipo de cambio field for USD for a Cotización made in the app, and a Proyecto select with "Proyecto nuevo" for an imported one. Closing it changes nothing. Verify in `src/renderer/src/components/Cotizaciones.test.tsx`: the button shows only on expirada/rechazada; confirming calls `aceptarTarde` with the choice; closing makes no call

## 6. Domain docs

- [ ] 6.1 Update `CONTEXT.md`: add **Aceptación tardía**, and add it to the corrections Reimportar desde cero loses. Verify by reading the entries
- [ ] 6.2 Write `docs/adr/0004-late-acceptance-follows-the-cotizacion-origin.md`: an in-app transition on imported history follows ADR-0002's exemption. Verify that the file exists and references ADR-0002

## 7. Review and final checks

- [ ] 7.1 Run `/code-review` on the branch diff, and fix what it confirms
- [ ] 7.2 Run `/security-review`, since the change touches the IPC surface (`src/shared/contrato.ts`, `src/main/handlers.ts`), and fix what it confirms
- [ ] 7.3 Run `npm run typecheck`, `npm run lint` and `npm test`. All three must pass
