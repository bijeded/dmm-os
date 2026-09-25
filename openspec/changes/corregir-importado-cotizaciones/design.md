# Design

## Context

See proposal.md, Why. Three facts shape the approach:

- **Where `"[]"` comes from.** The SQL default of `cotizaciones.items` is `'[]'` (migration 0001), which is correct. The bad value comes from drizzle-orm 0.45.2. When an insert omits a column, drizzle binds the schema's `.default(...)` value through the column's JSON mapping (`sql.param(col.default, col)` in `sqlite-core/dialect.js`). `.default('[]')` is the *string* `'[]'`, so what gets stored is `JSON.stringify('[]')`, which is `"[]"`. `costos_estimados` uses `.default([])` and stores `[]` correctly.
- **Why 0018 passed its test.** The 0018 test inserted rows with raw SQL, so they took the SQL default `[]`. The app's inserts go through drizzle and store `"[]"`.
- **How upgrades run.** Pending migrations run in one transaction with foreign keys off, checked before commit (ADR-0003). A Respaldo is taken first on an existing database.

## Goals / Non-Goals

**Goals:**
- A data-only migration that repairs existing rows. No DDL.
- The schema default fixed at its source, so new rows are right without relying on `partidasGuardadas`.

**Non-Goals:**
- Editing `0018_importado.sql`. Databases that already applied it would never re-run it.

## Decisions

- **New migration `0019_corregir_importado_cotizaciones.sql`, not an edited 0018.** The migrator applies each migration once, by journal time, so only a new entry reaches the live database. It is created with `drizzle-kit generate --custom --name corregir_importado_cotizaciones` so the journal and snapshot stay drizzle's. It holds two statements, in order:
  1. `UPDATE cotizaciones SET importado = 1 WHERE estado <> 'borrador' AND items IN ('[]', '"[]"')`
  2. `UPDATE cotizaciones SET items = '[]' WHERE items = '"[]"'`

  Marking first keeps the predicate simple. The normalisation runs over every estado, borradores included. `coalesce` is unneeded because `items` is `NOT NULL`.
- **Schema default `.default([])`.** This matches `costosEstimados`. The SQL default stays `'[]'`, so `drizzle-kit` should produce no DDL. Run `npm run db:generate` first to confirm there is no diff. If one appears, it goes in its own generated migration, not hand-merged into 0019. No `$type<PartidaCotizacion[]>()` is added: typing the column would ripple through every reader, and that is outside this fix.
- **Match only `[]` and `"[]"`, not "every row not made in the app".** An app-made Cotización outside *borrador* always has at least one item (`cotizar.ts` refuses zero), and importer-made rows already set `importado` since #190. So "empty items" is exact. There is no need to cross-check Contacto or Folio.

## Risks / Trade-offs

- [A legacy Cotización the user later edited in the app to add items] → It stays unmarked and blocks the reimport as made by hand. On the live database all 401 hold `"[]"`, so there are none today.
- [The migration runs on a database that never had the bug, e.g. a fresh install] → Both statements match nothing. That is harmless.

## Migration Plan

It ships with the app. On first launch after the update, the Respaldo is taken, then 0019 runs. Rollback is restoring that Respaldo.
