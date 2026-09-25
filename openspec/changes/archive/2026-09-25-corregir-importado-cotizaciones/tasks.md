# Tasks

## 1. Schema default

- [x] 1.1 In `src/main/db/schema.ts`, change the `items` default from `.default('[]')` to `.default([])`. Run `npm run db:generate` and confirm it reports no schema changes. If it does generate DDL, keep that as its own migration and note it in design.md.
- [x] 1.2 Test in `src/main/db/migrations.test.ts`: a Cotización inserted through drizzle without `items` stores the text `[]` (read with raw SQL) and reads back as an empty array.

## 2. Data migration

- [x] 2.1 Create `drizzle/0019_corregir_importado_cotizaciones.sql` with `npx drizzle-kit generate --custom --name corregir_importado_cotizaciones`. Add a short SQL comment explaining the cause, then the two statements from design.md: mark non-*borrador* rows with `items IN ('[]','"[]"')` as imported, then rewrite `"[]"` to `[]`. Verify `drizzle/meta/_journal.json` gains entry 19.
- [x] 2.2 Test in `src/main/db/migrations.test.ts`, modelled on the 0018 test. Build a database at migration 0018 holding:
  - an *aceptada* and an *expirada* Cotización with items `"[]"`
  - a USD Cotización with items `"[]"`
  - a sent Cotización with one item
  - a *borrador* with items `"[]"`

  Open it with `createDatabase(...).abrir(file)` and assert:
  - the first three become `importado = 1`, with currency, rate and totals unchanged
  - the other two stay `0`
  - every `"[]"` is now `[]`
  - `foreign_key_check` is empty
- [x] 2.3 Test in `src/main/importacion/reimportar.test.ts`: with legacy Cotizaciones stored as `"[]"` and migrated, the reimport's bloqueos name no Cotización made in the app, and a Cotización sent from Cotizaciones still blocks.

## 3. Docs

- [x] 3.1 CONTEXT.md needs no change: no term changes. Confirm the Importación and Reimportar desde cero entries still read correctly.

## 4. Review and checks

- [x] 4.1 Run `/code-review` on the branch diff and fix what it confirms.
- [x] 4.2 Run `/security-review`, since the change touches migrations and the database, and fix what it confirms.
- [x] 4.3 `npm run typecheck`, `npm run lint` and `npm test` all pass. `openspec validate corregir-importado-cotizaciones --strict` passes.
