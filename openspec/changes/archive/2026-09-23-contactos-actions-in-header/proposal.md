# Proposal

## Why

Every section page keeps its actions at the top right, beside the title, but two don't match. Contactos puts `Exportar CSV` and `Nuevo contacto` inside the table card's toolbar. Finanzas shows `Nuevo costo` as a ghost button, while the other sections' secondary actions have a border.

Intent: section pages put their actions in the title row, with one primary button and the rest secondary.

## What Changes

- Contactos: `Exportar CSV` and `Nuevo contacto` move from the table card's toolbar to the title row, right-aligned beside `CONTACTOS`. `Exportar CSV` stays secondary and `Nuevo contacto` stays primary. They stay in the same order and keep their current behavior, including `Exportar CSV` being disabled while busy or before the list loads.
- Contactos: the table card's toolbar keeps only the search box and the Estado filter.
- Finanzas: `Nuevo costo` changes from ghost to secondary. `Nuevo ingreso` stays primary.

## Non-goals

- Record and form pages (a Contacto, Proyecto or Cotización, and the new and edit forms). Their title rows keep their current buttons, including the ghost `Borrar`.
- Restyling the `Button` variants themselves, or the page title.
- Changing what any button does, or its label.
- Changing Finanzas' Periodo selector, search box or `Facturas/` link.

## Capabilities

### New Capabilities

- `encabezado-de-seccion`: a section page's title row, meaning where its actions sit and how they are styled.

### Modified Capabilities

None. `barra-lateral` already requires the logo to line up with a title row that holds buttons. This change adds buttons to Contactos' title row without changing that requirement.

## Impact

- `src/renderer/src/components/Contactos.tsx`: title wrapped in the title row, buttons moved out of the card toolbar.
- `src/renderer/src/components/Finanzas.tsx`: `Nuevo costo` variant.
- `src/renderer/src/components/Contactos.test.tsx`, `Finanzas.test.tsx`: pin the placement and variant.
- No CONTEXT.md terms are touched or introduced. No ADR is affected.
