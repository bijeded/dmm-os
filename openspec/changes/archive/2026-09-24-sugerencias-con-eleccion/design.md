## Context

Sugerencias de importación live in `src/main/sugerencias.ts`, and their rows are in `sugerencias_importacion`. Each row stores the guess: `proyecto_id` for *vincular* and `contacto_id` for *fusionar*. The `sugerencias_destino` CHECK ties each destination to its kind. `estado` is `pendiente | aceptada | rechazada` and has no CHECK in SQLite, since drizzle's text enum is type-only. The unique index on `(entidad, entidad_id, accion)` holds for answered rows too, which is why a Sugerencia is asked only once.

The guesses behave differently:
- **Cotización *vincular*** is written at scan time (`vincularCotizacion` in `importacion/carpetas.ts`): the Cotización becomes *aceptada*, `proyectos.cotizacion_id` is set, notes are written, and sometimes a Cliente final. `deshacer` records what rejecting restores.
- **Ingreso *vincular*** writes nothing until it is accepted. Each Parcialidad of an invoice has its own Sugerencia (`copiarParte`).
- **Costo *vincular*** is no longer proposed since `reimportar-desde-cero`. Rows from an older database may remain.
- **fusionar** merges on acceptance through `fusionar(tx, duplicadoId, originalId)`.

`responder` is reached from `importacion.responder(id, respuesta)`. IPC arguments arrive unchecked (`src/main/ipc.ts`), so `responder` must validate the new object form itself.

## Goals / Non-Goals

**Goals:**
- One answer shape that covers the guess, a rejection, and a choice of one or several opciones, so #194's "¿Qué aceptó?" fits without another redesign.
- Rejecting and correcting a Cotización share one undo, so both restore exactly the same things.

**Non-Goals:**
- Storing which opción was chosen on the Sugerencia. The record itself holds the chosen link.
- Changing how guesses are made.

## Decisions

### 1. Answer shape: the two literals plus `{ elegidas }`

```ts
export interface Eleccion { elegidas: number[] }
export type RespuestaSugerencia = 'aceptada' | 'rechazada' | Eleccion
```

`'aceptada'` and `'rechazada'` keep their meaning, including Archivado / No disponible for *ubicación*, and Aceptar todas keeps using `'aceptada'`. `Eleccion` names the chosen opciones by id. If `elegidas` equals the set of opciones marked `sugerida`, the answer is recorded as *aceptada*. Otherwise it is *corregida*.

*Alternative*: only `{ elegidas }`, with *ubicación* and rejection expressed as opciones. Rejected: it gives *ubicación* fake ids and turns "none" into a special empty list, only to remove two literals that already work.

### 2. A Sugerencia carries its opciones, worked out when read

```ts
export interface OpcionSugerencia { id: number; nombre: string; sugerida: boolean }
// on Sugerencia:
opciones: OpcionSugerencia[]   // empty for ubicación and leftover Costo vincular
varias: boolean                // whether several may be chosen; false for every kind today
```

`sugerida` marks the guess. For a future `varias` kind it marks what is pre-checked. `pendientes()` computes opciones from the current records instead of storing them. The offer changes as other answers are given: a Proyecto becomes free when its Cotización's link is rejected, and a Contacto disappears when it is merged. `pendientes()` reads Contactos and Proyectos once per call and groups them in memory, not once per Sugerencia. The first run had about 300 pending Sugerencias against about 180 Contactos and 130 Proyectos.

- **vincular, Cotización**: the Cotización's Contacto's Proyectos with no Cotización, plus the guessed Proyecto, which holds this one.
- **vincular, Ingreso**: all of the Ingreso's Contacto's Proyectos. A Proyecto takes many Ingresos.
- **fusionar**: every Contacto except the duplicate.
- **ubicación**, and a leftover **Costo** *vincular*: no opciones. They are answered with the literals only.

Sorted by `nombre`. `sugerida` is true only for the guess.

*Alternative*: a separate `importacion.opciones(id)` channel, loaded when the user opens a selector. Rejected: it adds an IPC channel and a second round trip to save work that is cheap in synchronous SQLite.

*Why the same Contacto only*: the guessers only look within the Contacto. A Cotización linked to another Contacto's Proyecto would disagree with its own `contacto_id`. A Proyecto filed under the wrong Contacto is fixed by #195 and Reimportar desde cero, not here.

*Why not take a Cotización from another Proyecto*: `proyectos_cotizacion_unique` allows one Cotización per Proyecto. Taking it would silently undo another link, possibly one that another pending Sugerencia's `deshacer` describes. Leaving such Proyectos out means the user frees one explicitly by answering the Sugerencia that holds it. The list then refreshes and offers it.

### 3. Checking an answer inside the transaction

`responderEn` recomputes the Sugerencia's opciones in the transaction, then:
- It refuses an `Eleccion` for a Sugerencia with no opciones.
- It refuses an `elegidas` that is empty, has duplicates, names an id not offered, or holds more than one id when `varias` is false.
- It refuses anything that is neither literal nor `{ elegidas: number[] }` of integers. This is the IPC validation.

A refusal throws a Spanish message (e.g. `Ese Proyecto ya no se puede elegir`), and the transaction changes nothing. Logs shows it through `useAccion`'s error.

### 4. Stored estado `corregida`; the chosen link lives on the record

The `estado` enum gains `corregida`. `proyecto_id` / `contacto_id` keep the guess. The choice is where it matters: `ingresos.proyecto_id`, `proyectos.cotizacion_id`, or the merged Contacto. Nothing reads an answered Sugerencia except the unique index, and Reimportar desde cero removes them all, so a column recording the choice would have no reader. #194 may add storage if "¿Qué aceptó?" needs one.

The enum lives only in TypeScript, so `npm run db:generate` is expected to produce no migration. If it does, the migration follows ADR-0003 and the task list checks it.

### 5. Cotización correction = the rejection's undo, then a new link

The rejection branch of `vincular` becomes `deshacerCotizacion(tx, s)`. It restores the previous estado and the guessed Proyecto's `cotizacion_id`, notes and Cliente final under the existing "unless edited since" rules. Rejection calls it alone. Correction calls it, then sets the Cotización *aceptada* and `proyectos.cotizacion_id = elegido`. The undo must run first: until it clears the guessed Proyecto's `cotizacion_id`, linking the chosen one would break `proyectos_cotizacion_unique`. Setting *aceptada* directly skips `aceptarCotizacion`, which is ADR-0002's sanctioned exception for imported history, so no Ingresos or Costos are created.

The undo clears the guessed Proyecto's `cotizacion_id` only while it still holds this Cotización. One the user linked there by hand since stays, for rejection and correction alike (added in review).

The chosen Proyecto's notes and Cliente final are left alone. The guess's note ("Cotización N también incluye: …") is computed against the folder name it matched. The chosen Proyecto may already carry the user's notes. The Cliente final comes from the Mapa de nombres, which `responder` does not read. *Alternative*: recompute with `repartirNombres` and read the map. Rejected: it ties `sugerencias.ts` to the map reader and the file system, and it risks overwriting the user's notes. The user can edit the Proyecto.

### 6. Ingreso and fusionar corrections reuse the accept path

An Ingreso correction runs the same `update ingresos set proyecto_id` as accepting, with the chosen id. A *fusionar* correction calls `fusionar(tx, duplicadoId, elegidoId)` unchanged. It already moves every reference, redirects other pending merges that named the duplicate, and keeps the better-written Nombre canónico.

A correction can make another pending merge point a Contacto at itself: B merges Z into X, and A's duplicate X is merged into Z. `fusionar` then records B as *aceptada*, since Z and X are already one, and refuses to merge a Contacto into itself (added in review).

Each Parcialidad keeps its own Sugerencia. A choice answers only that one, as accepting does today.

### 7. Logs

Each *vincular* or *fusionar* row with more than one opción shows a native `<select>` (the `campoCls` pattern from `NuevoMovimiento.tsx`) in place of the `→ destino` text, preset to the `sugerida` opción. A row with only the guess looks as it does today. Selections are local state keyed by Sugerencia id.

Aceptar sends `'aceptada'` when the selection is still the guess and `{ elegidas: [id] }` otherwise. Rechazar sends `'rechazada'`. When the list refreshes after any answer, a selection that is no longer among its row's opciones resets to the guess, so the selector never shows an id it cannot send. Aceptar todas ignores local selections (spec: "Aceptar todas keeps the guesses"). UI copy is Spanish, and the button labels are unchanged.

## Risks / Trade-offs

- [A *fusionar* selector lists every Contacto (~180)] → a native select supports type-ahead on macOS. There are few *fusionar* rows (2 in the first run).
- [A corrected Cotización loses the guess's "también incluye" note, and the chosen Proyecto gets no Cliente final from the map] → both can be edited on the Proyecto, and Reimportar desde cero with a map row redoes them. This is recorded as a non-goal.
- [An invoice split into Parcialidades needs the same choice once per Parcialidad] → as accepting does today. Grouping them is a later change if it proves tedious.
- [`corregida` is a new estado value that older code does not expect] → every current read compares it with *pendiente* only: `pendientes()`, `aceptarVincular`, the "already answered" guard, and `copiarParte` in `comprobantes.ts`. A *corregida* row therefore behaves like any answered one. A Parcialidad added later does not copy its Sugerencia; it copies its first row's `proyecto_id`, which after a correction is the chosen Proyecto.

## Migration Plan

No data migration is expected (decision 4). Rollback is reverting the change: a *corregida* row read by older code is just not *pendiente*, so it is never asked again.
