# encabezado-de-seccion Specification

## Purpose

A section page's title row: where the page's actions sit next to its title and how they are styled, so every section reads the same way.

## Requirements

### Requirement: A section's actions sit in its title row
On a section page (Inicio, Contactos, Cotizaciones, Proyectos, Finanzas, Lab, AI, Configuración), the buttons that act on the whole section SHALL sit in the title row, right-aligned, on the same line as the page title. Controls that narrow what the page shows, such as search, filters and the Periodo selector, SHALL stay with the content they narrow.

#### Scenario: Contactos' actions beside the title
- **WHEN** the user opens Contactos
- **THEN** `Exportar CSV` and `Nuevo contacto` sit at the right end of the row holding `CONTACTOS`, in that order

#### Scenario: Contactos' table toolbar keeps only its filters
- **WHEN** the user opens Contactos
- **THEN** the table card's toolbar shows the search box and the Estado filter, and no buttons

#### Scenario: Nuevo contacto works from the title row
- **WHEN** the user clicks `Nuevo contacto` in Contactos' title row
- **THEN** the Nuevo contacto form opens, as before

#### Scenario: Exportar CSV works from the title row
- **WHEN** the user clicks `Exportar CSV` in Contactos' title row
- **THEN** `contactos.csv` downloads, and the button is disabled while the list is loading or an action is running

#### Scenario: Finanzas keeps its layout
- **WHEN** the user opens Finanzas
- **THEN** `Nuevo costo` and `Nuevo ingreso` sit at the right end of the row holding `FINANZAS`, and the Periodo selector, search box and `Facturas/` link stay in the row below

### Requirement: One primary action, the rest secondary
A section page's title row SHALL show at most one primary button, its main action, placed last. Every other button in the row SHALL use the secondary style, which is outlined and not filled. None SHALL use the ghost (text-only) style.

#### Scenario: Contactos
- **WHEN** the user opens Contactos
- **THEN** `Nuevo contacto` is the primary button and `Exportar CSV` is secondary

#### Scenario: Finanzas
- **WHEN** the user opens Finanzas
- **THEN** `Nuevo ingreso` is the primary button and `Nuevo costo` is secondary, outlined like `Exportar CSV` in Contactos

#### Scenario: A section with one action
- **WHEN** the user opens Cotizaciones or Proyectos
- **THEN** the title row shows one primary button (`Nueva cotización`, `Nuevo proyecto`) and no others
