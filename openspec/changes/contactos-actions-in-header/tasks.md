# Tasks

## 1. Contactos title row

- [x] 1.1 In `Contactos.tsx`, wrap the `<h1>` in the title row every other section uses (`acts flex flex-wrap items-center justify-between gap-3`). Move `Exportar CSV` (`variant="secondary"`, same `disabled` and handler) and `Nuevo contacto` into a `flex gap-2` group inside it, in that order. Remove both buttons and the `flex-1` spacer from the card toolbar. Verify with a test in `src/renderer/src/components/Contactos.test.tsx` that both buttons share a parent with the level-1 heading, the table card holds no buttons besides Anterior/Siguiente, and the existing Exportar CSV and Nuevo contacto tests still pass (`npm test -- src/renderer/src/components/Contactos.test.tsx`)
- [x] 1.2 Verify in the same test file that `Exportar CSV` carries the secondary style (`border-border-strong`) and `Nuevo contacto` the primary one (`bg-primary`)

## 2. Finanzas Nuevo costo

- [x] 2.1 In `Finanzas.tsx`, change `Nuevo costo` from `variant="ghost"` to `variant="secondary"`. Verify with a test in `src/renderer/src/components/Finanzas.test.tsx` that `Nuevo costo` carries the secondary style (`border-border-strong`) and `Nuevo ingreso` the primary one (`npm test -- src/renderer/src/components/Finanzas.test.tsx`)

## 3. Visual check

- [ ] 3.1 Run the app (`npm run dev`) and take screenshots of Contactos and Finanzas scrolled to the top. The buttons should sit right-aligned on the title line, the logo should still be level with the title caps (`barra-lateral`), and `Nuevo costo` and `Exportar CSV` should look alike. Ask before using browser or screen automation to take them

## 4. Review and final checks

- [x] 4.1 Run `/code-review` on the branch diff and fix what it confirms
- [x] 4.2 Confirm no CONTEXT.md term or ADR is needed and no security review applies. None is expected, since this is a renderer layout change with no domain term, IPC, file or database involvement
- [x] 4.3 Run `npm run typecheck`, `npm run lint` and `npm test`; all pass
