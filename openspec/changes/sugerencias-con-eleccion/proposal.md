## Why

A Sugerencia de importación can only be accepted or rejected. When the guess is close but wrong, the user either keeps a wrong link or loses the link entirely: "either I accept what the importer believes or it doesn't import it, so it's not that helpful if I can't correct or edit the suggestion." The first real Importación left 297 Sugerencias to answer one by one.

## What Changes

A *vincular* or *fusionar* Sugerencia can be answered with a choice other than the guess.

- **vincular** a Cotización or an Ingreso: accept the guessed Proyecto, reject it, or pick another Proyecto of the same Contacto. For a Cotización, picking another Proyecto first undoes everything the guess wrote, exactly as rejecting does, and then links the Cotización to the chosen Proyecto. Proyectos that already have a Cotización are not offered.
- **fusionar**: merge into the guessed Contacto, keep the two separate, or merge into another Contacto.
- **ubicación** is unchanged. It already asks the user to choose between Archivado and No disponible.
- Each pending Sugerencia now carries its **opciones**: the choices it offers, with the guess marked. An answer names the opciones it chose. A Sugerencia says whether several opciones may be chosen at once. None does yet, but #194's "¿Qué aceptó?" (tick several of a Cotización's price lines) can use this without another redesign.
- An answer is still final: a Sugerencia is asked once. A Sugerencia answered with another choice is recorded as *corregida*. Aceptar todas still accepts every pending *vincular* guess as it is.

This is change [5] of the import-quality epic (#191), issue #193. Its blocker, `reimportar-desde-cero`, has shipped and been archived.

CONTEXT.md terms touched: Sugerencia de importación (no longer "a one-time accept/reject"), Importación, Nombre canónico, Proyecto, Contacto, Cotización, Ingreso, Parcialidad, Estado de Contacto, Cobros, Sin ingresos registrados. New term: **opciones** of a Sugerencia, and the answer **corregida**.

Nothing here contradicts an ADR. ADR-0002 still applies: a Cotización linked to a chosen Proyecto is set *aceptada* directly and creates no Ingresos or Costos.

## Non-goals

- Creating a new Proyecto or Contacto from a Sugerencia. The choice is always an existing record. To link a record to a Proyecto that does not exist yet, the user rejects the Sugerencia and links the record by hand.
- Offering Proyectos of another Contacto. Wrong attribution of Proyectos folders is #195.
- Taking a Cotización away from a Proyecto that already has one. The user first rejects or corrects the Sugerencia that holds it, and that Proyecto is then offered.
- Changing an answer after it is given, or asking an answered Sugerencia again (other than through Reimportar desde cero).
- Choosing for many Sugerencias at once. Aceptar todas accepts guesses only.
- The "¿Qué aceptó?" kind itself, which is #194.
- Carrying the guess's notes or the Mapa de nombres' Cliente final to a chosen Proyecto (see design).
- Leftover *vincular* Sugerencias for Costos from before `reimportar-desde-cero`. They keep accept/reject only.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `importacion`: adds a requirement that a *vincular* or *fusionar* Sugerencia de importación can be answered with another Proyecto or Contacto. The existing Aceptar todas requirement is unchanged. The new requirement pins that Aceptar todas ignores choices the user has not sent.

## Impact

- `src/shared/dominio.ts`: `Sugerencia` gains `opciones` and `varias`. `RespuestaSugerencia` gains an `{ elegidas }` form. The stored estado gains `corregida`.
- `src/shared/contrato.ts`: `importacion.responder` keeps its signature and accepts the new answer form. No new channel.
- `src/main/sugerencias.ts`: works out each Sugerencia's opciones, checks an answer against them, and writes a corrected link or merge. The Cotización undo is extracted so rejecting and correcting share it.
- `src/main/db/schema.ts`: the `estado` enum gains `corregida`. The column has no CHECK, so no migration is expected. `npm run db:generate` confirms it.
- `src/renderer/src/components/Logs.tsx`: *vincular* and *fusionar* rows get a selector preset to the guess.
- `CONTEXT.md`: the Sugerencia de importación entry.
