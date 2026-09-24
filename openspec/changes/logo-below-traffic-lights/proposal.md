# Proposal

## Why

The DMM logo sits in the same 48px row as the macOS window controls, a few points right of the green button and almost as tall as the row, so it reads as a fourth window control and the top of the sidebar looks crowded.

## What Changes

- The sidebar's top row holds only the window controls; it stays a window-drag area and keeps the header's height.
- The logo moves below that row and lines up with the page title: its height equals the title's capital letters, and its top and bottom edges meet theirs, on every section and record page.
- The window controls sit on the same center line as the header's `DMM OS / <sección>` path.
- The header height, page top padding and page title size become shared tokens, so the sidebar and the page area can't drift apart.
- `SectionPage` and `Configuracion` use the shared title style (`tituloCls`) instead of copies of its classes.
- The sidebar nav moves down by the height of the logo row.

## Non-goals

- Keeping the logo and title aligned while the page scrolls: the sidebar is fixed and the page scrolls under the header, so alignment holds at scroll position 0 only.
- Restyling the header, the nav items or the page title itself.
- Any window behavior besides the window-control position (size, frame, full screen).
- Windows or Linux title bars: the app is macOS-only.

## Capabilities

### New Capabilities

- `barra-lateral`: the sidebar's top area: where the window controls, the logo and the nav sit, and how the logo lines up with the page title.

### Modified Capabilities

None. No specs exist yet.

## Impact

- `src/renderer/src/components/AppShell.tsx`: sidebar top row split into a drag row and a logo row.
- `src/renderer/src/components/Logo.tsx`: size set by the caller instead of fixed at 24px.
- `src/renderer/src/index.css`: shared layout tokens.
- `src/renderer/src/components/estilos.ts`, `SectionPage.tsx`, `Configuracion.tsx`: one title style.
- `src/main/index.ts`: `trafficLightPosition` on the `BrowserWindow`.
- No CONTEXT.md terms are touched and no new term is introduced. No ADR is affected.
