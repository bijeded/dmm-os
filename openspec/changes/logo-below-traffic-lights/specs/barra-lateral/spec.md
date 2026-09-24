# Spec Delta

## Purpose

The sidebar's top area: where the macOS window controls, the DMM logo and the section nav sit, and how the logo lines up with the page title so the top of the window reads as one layout.

## ADDED Requirements

### Requirement: Window controls have the sidebar's top row to themselves
The sidebar's top row SHALL contain only the macOS window controls (close, minimize, zoom). It SHALL be as tall as the header, and dragging on it SHALL move the window.

#### Scenario: Nothing sits beside the window controls
- **WHEN** the app window is open on any section
- **THEN** the sidebar's top row shows the three window controls and nothing else to their right

#### Scenario: The top row drags the window
- **WHEN** the user drags on the empty part of the sidebar's top row
- **THEN** the window moves

### Requirement: Window controls share the header's center line
The window controls SHALL be vertically centered on the same line as the header's `DMM OS / <sección>` path.

#### Scenario: Controls and path line up
- **WHEN** the app window is open on any section
- **THEN** the centers of the window controls and the center of the `DMM OS / <sección>` text sit at the same height

### Requirement: The logo lines up with the page title
The DMM logo SHALL sit in the sidebar below the window-controls row, above the nav. Its height SHALL equal the cap height of the page title (`INICIO`, `CONTACTOS`, …), and its top and bottom edges SHALL sit at the same heights as the tops and bottoms of the title's capital letters. This SHALL hold on every section page and every record or form page (a Contacto, Proyecto or Cotización, and the new and edit forms), with the page scrolled to the top.

#### Scenario: Logo and title align on a section page
- **WHEN** the user opens Inicio with the page scrolled to the top
- **THEN** the logo's top edge is level with the top of the letters in `INICIO` and its bottom edge is level with their baseline

#### Scenario: Title row has action buttons
- **WHEN** the user opens a section whose title row also holds buttons (e.g. Inicio's `Nuevo proyecto`)
- **THEN** the logo is still level with the title's capital letters

#### Scenario: Every section and record page
- **WHEN** the user moves between Inicio, Contactos, Cotizaciones, Proyectos, Finanzas, Lab, AI, Configuración and any record or form page
- **THEN** the page title's capital letters start and end at the same heights on each, matching the logo, and the logo does not move

#### Scenario: Page scrolled down
- **WHEN** the user scrolls a page down
- **THEN** the title scrolls away under the header and the logo stays where it is in the sidebar

### Requirement: The nav follows the logo
The section nav SHALL start below the logo row, in the same order as before, with Configuración still pinned to the bottom of the sidebar.

#### Scenario: Nav order unchanged
- **WHEN** the app opens
- **THEN** the sidebar lists Inicio, Contactos, Cotizaciones, Proyectos, Finanzas, Lab, AI, then Configuración at the bottom, all below the logo
