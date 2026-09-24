# Tasks

## 1. Shared tokens and one title style

- [ ] 1.1 Add `--spacing-topbar`, `--spacing-page-top`, `--text-title` (+ `--text-title--line-height`), `--title-cap` and `--title-cap-top` to `@theme` in `src/renderer/src/index.css`, with the Antonio metrics from design.md in a comment; verify `npm run typecheck` and the dev build pick them up (`h-topbar`, `text-title` resolve)
- [ ] 1.2 Switch `tituloCls` in `estilos.ts` to `text-title`, and make `SectionPage.tsx` and `Configuracion.tsx` use `tituloCls`; verify with a test in `src/renderer/src/App.test.tsx` that every section's `h1` carries the shared title style
- [ ] 1.3 Use `h-topbar` for the header and `pt-page-top` for the page wrapper in `AppShell.tsx`; verify `App.test.tsx` still passes

## 2. Sidebar top area

- [ ] 2.1 Trim `Logo.tsx`'s viewBox to `0 2 284 100` and size it from `className` instead of fixed `height`/`width`; verify `npm run typecheck`
- [ ] 2.2 Restructure the `aside` in `AppShell.tsx`: a full-width `app-drag` row of `h-topbar` holding nothing, then a logo row at `mt-page-top` as tall as the title line with the logo `--title-cap-top` down and `--title-cap` tall, left edge level with the nav icons, then the nav; verify with a test in `App.test.tsx` that the logo is not inside the drag row and the nav order is unchanged
- [ ] 2.3 Check the current Electron docs (context7) for `trafficLightPosition` with `hiddenInset`, then set it in `src/main/index.ts` (starting from about `{ x: 18, y: 17 }`); verify `npm run typecheck`

## 3. Visual check

- [ ] 3.1 Run the app (`npm run dev`) and take screenshots of Inicio, Contactos, Configuración and one Proyecto page, scrolled to the top: the logo's top and bottom are level with the title caps' top and baseline, the controls are centered on the `DMM OS / <sección>` line, and nothing sits beside the controls. Adjust `trafficLightPosition` until they line up. Ask before using browser or screen automation to take them

## 4. Review and final checks

- [ ] 4.1 Run `/code-review` on the branch diff and fix what it confirms
- [ ] 4.2 Run `/security-review` (the change touches Electron window settings in `src/main/index.ts`) and fix what it confirms
- [ ] 4.3 Confirm no CONTEXT.md term or ADR is needed (none expected: no domain term or hard-to-reverse decision is involved)
- [ ] 4.4 Run `npm run typecheck`, `npm run lint` and `npm test`; all pass
