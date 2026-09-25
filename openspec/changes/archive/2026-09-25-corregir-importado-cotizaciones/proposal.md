# Proposal

## Why

Every legacy Cotización reads as made in the app, so Reimportar desde cero is refused ("401 Cotizaciones creadas en la app") even with the external HDD connected. The upgrade that marked imported records (migration `0018_importado`) looked for Cotizaciones whose items are an empty list `[]`. The importer never stored that. drizzle's runtime default for the `items` column JSON-encodes the string `'[]'`, so what it stored is the text `"[]"`, and the backfill matched none of them. Contactos and Proyectos were marked correctly: on the live database 182 of 182 and 133 of 133 are marked imported, but 0 of 401 Cotizaciones are.

## What Changes

- A new migration marks as imported every sent Cotización (any estado but *borrador*) whose items are empty, whether stored as `[]` or as `"[]"`. A Cotización made in the app can't be sent without at least one item, so none of them match.
- The same migration rewrites every stored `"[]"` to `[]`, so no Cotización keeps the malformed empty list.
- The `items` column's drizzle default becomes the empty list `[]` instead of the string `'[]'`, so later inserts that omit items store `[]`.

## Non-goals

- Changing what Reimportar desde cero checks, or how it reports a block.
- Removing `partidasGuardadas`. It still guards reads against any malformed value.
- Checking other columns. The only other JSON columns are `costos_estimados`, which already defaults to `[]`, and `deshacer`, which has no default.
- Re-running the Contactos and Proyectos backfills. Both worked.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `importacion`: legacy Cotizaciones imported before the imported mark existed count as imported, so they don't block Reimportar desde cero.

## Impact

- CONTEXT.md terms touched: Cotización, Importación, Reimportar desde cero, Respaldo. No new terms.
- ADRs: none contradicted. The migration runs under ADR-0003 (foreign keys off, checked before commit) and, like every migration, after its Respaldo.
- Code:
  - `drizzle/0019_*.sql` (new, hand-written data migration) and its journal entry
  - `src/main/db/schema.ts`: the `items` default
  - `src/main/db/migrations.test.ts`
- Data: on the live database, the 401 existing Cotizaciones become imported and their `items` become `[]`.
