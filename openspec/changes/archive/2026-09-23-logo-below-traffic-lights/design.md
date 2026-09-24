# Design

## Context

- The window uses `titleBarStyle: 'hiddenInset'` (`src/main/index.ts`) with no `trafficLightPosition`, so macOS places the controls.
- `AppShell.tsx`: the sidebar (`aside`, `px-3 py-[18px]`) opens with a drag row `-mt-[18px] mb-6 h-12 pl-[72px]` that holds `<Logo />` (fixed `height="24"`). The main column opens with a sticky `h-12` header, then the page wrapper with `pt-6`.
- Section page titles start 72px from the window top (48px header + 24px padding). Record and form pages open with an in-page path above the title, which pushes it 33px lower (measured in the running app). All pages use `tituloCls` (`estilos.ts`) except `SectionPage` and `Configuracion`, which repeat the same classes. Where the title shares a row with buttons (`items-center`), the 35.4px title line is the tallest item, so the title's position doesn't change.
- Title font is Antonio 700 (`@fontsource/antonio`). Its metrics, read from `antonio-latin-700-normal.woff`: unitsPerEm 2048, ascent 2365, descent 285, capHeight 1760.

## Goals / Non-Goals

**Goals:**
- One set of numbers places both the page title and the logo; changing one side moves the other.
- The alignment is derived from font metrics, not tuned by trial and error.

**Non-Goals:**
- Scroll-linked alignment (see proposal.md, Non-goals).
- Changing the title's own box or the page's vertical rhythm.

## Decisions

### Where the title's caps sit

At 29px with `line-height: 1.22`:

```
line box            29 * 1.22                      = 35.38px
content area        29 * (2365 + 285) / 2048       = 37.52px
half-leading        (35.38 - 37.52) / 2            = -1.07px
baseline from top   -1.07 + 29 * 2365 / 2048       = 32.42px
cap height          29 * 1760 / 2048               = 24.92px
cap top from top    32.42 - 24.92                  =  7.50px
```

So the caps run from 79.5px to 104.4px below the window top (72 + 7.50, 72 + 32.42). The caps sit 2.3px below the line box's center. Centering the logo on the title row would put it visibly too high, so the logo is aligned to cap top and baseline instead.

### Shared tokens in `index.css` `@theme`

- `--spacing-topbar: 48px`: header height and the sidebar's drag row (`h-topbar`).
- `--spacing-page-top: 24px`: page wrapper top padding and the gap above the logo row.
- `--text-title: 29px`, `--text-title--line-height: 1.22`: used by `tituloCls` (`text-title`).
- `--title-cap` and `--title-cap-top`: `calc()` expressions over `--text-title` and the Antonio metrics above, with a comment that names the font file they came from.

The logo row starts at `topbar + page-top`, is as tall as the title line, and places the logo `--title-cap-top` down with height `--title-cap`. Changing the title's size or line height then moves the logo with it.

Alternative considered: CSS `text-box: trim-both cap alphabetic` on the title, so its box *is* the cap height. That changes the title's box on every page and shifts all page spacing by about 10px. Rejected as out of scope.

### Logo box = visible logo

The SVG's viewBox is 284×104, but the orange D square, the tallest shape, spans y 2 to 102. The viewBox becomes `0 2 284 100` so the element's edges are the visible edges, and `height = --title-cap` aligns the square's top and bottom with the caps. Width follows from the aspect ratio (≈71px, which fits the sidebar's 162px content width). `Logo` takes its size from CSS (`className`) instead of fixed `height`/`width` attributes.

Horizontally, the logo's left edge lines up with the nav icons (`aside` `px-3` + nav item `px-3` = 24px) so it doesn't hang in the old `pl-[72px]` offset.

### Sidebar structure

```
aside (pt-0, px-3, pb-[18px])
  div.app-drag  h-topbar  -mx-3             <- window controls only
  div           mt-page-top  h-[title line]  <- logo, positioned by cap tokens
  nav           mt-6 ...                     <- unchanged items
```

The drag row spans the full sidebar width (`-mx-3`) so the whole strip drags. The `-mt-[18px]` compensation goes away because the aside no longer has top padding.

### Window controls

Add `trafficLightPosition: { x, y }` to the `BrowserWindow`, with `y` chosen so the controls' center is at 24px (the header's center, where the `items-center` path text sits). The expected starting value is about `{ x: 18, y: 17 }`, from the ~14px control height. The exact value is checked by eye in the running app, because macOS draws the controls itself. Check the current Electron docs for `trafficLightPosition` together with `hiddenInset` before writing it.

### Record and form pages hand their path to the header

`FichaContacto`, `FichaProyecto`, `FichaCotizacion`, `NuevoProyecto`, `NuevaCotizacion` and `NuevoMovimiento` each open with a `<nav aria-label="Ruta">`: a link to their section, then `/ <tail>` (a Contacto's name, a Folio, `Nuevo`…). That trail pushes their title 33px down, so the logo can't line up with it, and the header already names the section. The trail moves into the header:

- `AppShell` keeps `{ path, cola }` in state and provides a setter through a React context (`RutaContext`). A `useRuta(cola)` hook sets it from the page. The value is tagged with the pathname and only shown while that pathname is current, so a page never needs to clear it on leaving.
- The header renders `DMM OS / <sección>` and, when the current page set a tail, turns `<sección>` into a link and appends `/ <cola>`. The header path becomes the `Ruta` nav.
- The context's default setter does nothing, so page tests that render a page without `AppShell` keep working.

Alternative considered: react-router `handle` + `useMatches`. Rejected because the tails come from data the page loads (a Contacto's name, a Folio), not from the route.

### One title style

`SectionPage` and `Configuracion` import `tituloCls`. `tituloCls` swaps `text-[29px] leading-[1.22]` for `text-title`.

## Risks / Trade-offs

- [Antonio is replaced or its weight changes and the metrics no longer match] → the metric constants sit next to `--font-display`, with a comment naming the file they were read from; the visual check task catches drift.
- [The font falls back to Oswald before Antonio loads] → the logo is aligned to Antonio; the fallback only shows for a frame, since the font is bundled.
- [Sub-pixel rounding puts the logo 0.5px off the caps] → acceptable; the check is by eye at 2x.
- [A future page wraps its title in a taller row (e.g. taller buttons, `items-center`)] → the title would move down and lose alignment; the test that every section uses the shared title style doesn't catch that, the visual check does.
- [`trafficLightPosition` behaves differently in a future macOS or Electron release] → a one-line value, rechecked when Electron is upgraded.
