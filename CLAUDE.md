## Commands

- `npm run typecheck`, `npm run lint`, `npm test` (Vitest under Electron's Node; one file: `npm test -- <path>`)
- `npm run db:generate` after a schema change

## OpenSpec

Planned changes go through OpenSpec (`openspec/`, CLI `openspec`). Project context and per-artifact rules live in `openspec/config.yaml`.

- `/opsx:explore` to investigate, `/opsx:propose` to create a change with proposal, specs, design and tasks
- `/opsx:apply` to implement, `/opsx:verify` before `/opsx:archive`, which merges the delta specs into `openspec/specs/`
- Specs grow one change at a time; don't back-fill specs for code a change doesn't touch

## Domain docs

- `CONTEXT.md` is the glossary. Use its terms verbatim in specs, code, tests and commits; never the synonyms it lists under _Avoid_.
- `docs/adr/` holds decisions. If work contradicts an ADR, say so explicitly instead of overriding it.

## Issue tracker

GitHub Issues via the `gh` CLI. See `docs/agents/issue-tracker.md`.
