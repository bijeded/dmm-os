# Design

## Context

Every covered table already receives its whole list over IPC and filters it in the renderer with `useMemo`/`filter`. Only `Contactos.tsx` pages. It keeps `POR_PAGINA = 10` and `pagina` in `useState`, clamps with `Math.min(pagina, paginas - 1)`, calls `setPagina(0)` inside each filter's `onChange`, and renders the footer inline. Search, filter and Periodo state is `useState` in every screen, so it is lost on unmount.

The router is `createHashRouter` (`main.tsx`). Nobody returns to a list through history: the header path uses `<Link to={current.path}>` (`AppShell.tsx:41`), the sidebar uses `NavLink`, and records have no back button. Every return is a fresh mount of the section's route.

Tests render screens on their own, outside `AppShell`, with `window.dmm` stubbed. Vitest isolates modules per test file.

## Goals / Non-Goals

**Goals:**
- One pager (logic and footer) shared by every covered table, with no per-screen copy.
- State that is kept across remounts, is a drop-in replacement for `useState`, and works in tests without a provider.
- Page resets on a filter change that cannot fire by accident when a screen mounts with restored filters.

**Non-Goals:**
- Paging in the main process or changing any IPC shape.
- A generic table component. Each screen keeps its own `<table>` markup and only swaps the rows it maps over.

## Decisions

### D1. Kept state lives in a module-level map, read through `useRecordado`
A renderer module (`components/recordado.ts`) holds `Map<string, unknown>`. `useRecordado<T>(clave, inicial)` returns `[valor, fijar]` like `useState`. The value is the map's entry for `clave`, or `inicial` when there is none. `fijar` writes the map and re-renders the caller. The value is read from the map on every render instead of copied into `useState` once. Then when `clave` changes, as with `historial.<id>` while moving between two Fichas without unmounting, the hook returns the new key's value with no effect or sync step. `olvidarRecordado()` clears the map. Test files call it in `beforeEach`.

Each screen replaces its filter `useState`s with `useRecordado` under a dotted key: `cotizaciones.busqueda`, `finanzas.periodo`, `historial.<contactoId>.filtro`, and so on.

Alternatives:
- **URL search params**: rejected. Every way back is a plain link to `/<sección>`, so the params are dropped on exactly the path we need.
- **React context in `AppShell`**: works in the app, but every screen test would need a provider, and it adds nothing over a module.
- **`localStorage`**: survives restart, which the spec forbids.
- **A state library (zustand, jotai)**: a new dependency for one map.

### D2. `usePaginacion` derives the page reset from a signature instead of an effect
`usePaginacion(filas, clave, filtros)` keeps `{ pagina, firma }` under `clave` through `useRecordado`. `firma` is `JSON.stringify(filtros)`, the values that narrow this table: search text, filters and, for Finanzas and AI, the Periodo. On each render:

```
actual  = kept.firma === firma(filtros) ? kept.pagina : 0
paginas = max(1, ceil(filas.length / POR_PAGINA))
mostrar = min(actual, paginas - 1)        // derived, never written back
visibles = filas.slice(mostrar * 20, mostrar * 20 + 20)
```

Paging writes `{ pagina, firma: firma(filtros) }`. A changed filter makes the signature differ, so the table shows page 1 with no handler calling `setPagina(0)`. A screen that mounts with restored filters has a matching signature and keeps its page.

The clamp is never stored. While a list is still loading, `filas` is empty and page 1 shows with an empty footer. When the rows arrive, the kept page comes back. Writing the clamp back would lose the page on every return.

Alternatives:
- **`useEffect(() => setPagina(0), [filtros])`**: runs on mount, so it would reset the restored page, which is the bug this change exists to avoid.
- **`setPagina(0)` in every `onChange`** (today's Contactos pattern): works, but it is five calls per screen and easy to forget on a new filter.

### D3. One `Paginacion.tsx` holds the hook, the footer and `POR_PAGINA = 20`
`<PiePaginacion>` takes what `usePaginacion` returns and renders today's Contactos footer markup unchanged: range on the left, ghost `Anterior`/`Siguiente` buttons on the right, `text-[12px] text-on-surface-muted`. Contactos moves onto it and drops its inline copy.

### D4. Keys and signatures per table

| Table | Page key | Signature (resets page) |
|---|---|---|
| Contactos | `contactos` | busqueda, estado |
| Cotizaciones | `cotizaciones` | busqueda, cliente, anio, categoria, estado |
| Proyectos | `proyectos` | busqueda, contacto, anio, categoria, estado, soloSinIngresos |
| Finanzas: Cobrado, Costos pendientes, Ingresos del periodo, Costos del periodo | `finanzas.<tabla>` | periodo, busqueda |
| Finanzas: Por cobrar | `finanzas.porCobrar` | periodo, busqueda, vencidas |
| Lab | `lab` | carpeta, consulta |
| Historial | `historial.<contactoId>` | filtro |
| Proyectos AI | `ai.proyectos` | periodo, busqueda, cliente, anio, etiqueta, uso, estado |

`TablaIngresos` and `TablaCostos` in Finanzas take `clave` and `filtros` props and page themselves, so the five Finanzas call sites each pass their own key.

### D5. Lab re-reads its kept folder and search on mount
`leer()` currently picks `c[0]` on arrival. It will pick the kept `lab.carpeta` when that folder is still in `api.carpetas()`, and otherwise the first. On mount, a kept non-empty `lab.busqueda` re-runs `api.buscar` through the existing `buscar` path, so its latest-answer-wins guard still applies. The preview (`elegido`) is not kept.

### D6. A kept filter whose option is gone falls back to Todos
A `select` filter whose options come from the rows (Contacto in Cotizaciones, Proyectos and Proyectos AI; Año) can hold a kept value that no longer exists, for example after Fusionar en… removes a Contacto. A controlled `<select>` would then show its first option, `Todos`, while filtering to nothing. Each such filter reads its kept value through the options: a value not among them counts as `''`. This follows the spec's "stays on a real page" intent without adding a requirement.

## Risks / Trade-offs

- [Kept state leaks between tests in one file] → `olvidarRecordado()` in `beforeEach` in every covered screen's test file. Vitest's per-file module isolation already covers leaks across files.
- [The signature compares `JSON.stringify` output, so it is order-sensitive] → each call site passes a fixed array literal, never an object built at runtime.
- [Historial keys grow with each Contacto opened] → a few bytes per Contacto per session, and cleared on restart. Accepted.
- [Rows reshuffle under the kept page, e.g. a new Cotización pushes every row down one] → the owner sees page 3 of the list as it is now, not the exact rows they saw. Accepted: the spec promises the page and filters, not a row snapshot.
- [Contactos 10 → 20 changes a test the spec now contradicts] → the `pages the table ten at a time` case is rewritten, not deleted.

## Migration Plan

Renderer only, no data. Rollback is reverting the change.
