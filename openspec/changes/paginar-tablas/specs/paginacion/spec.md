# Spec Delta

## Purpose

How long tables across the app show their rows a page at a time, and how each one keeps its search, filters and page while the app stays open, so the owner returns to a table where they left it.

## ADDED Requirements

### Requirement: A long table shows 20 rows a page
A paginated table SHALL show at most 20 rows at a time. Below the table it SHALL always show a footer, even when every row fits on one page. The footer SHALL hold the range shown as `a–b de N` on the left, where N counts the rows that pass the current search and filters, and `Anterior` and `Siguiente` on the right. `Anterior` SHALL be disabled on the first page and `Siguiente` on the last. With no rows, the range SHALL be empty, both buttons SHALL be disabled, and the table's own empty message SHALL show as today.

#### Scenario: Paging forward
- **WHEN** Cotizaciones lists 45 Cotizaciones and the owner clicks `Siguiente` twice
- **THEN** the table shows rows 41 to 45, the footer reads `41–45 de 45`, and `Siguiente` is disabled

#### Scenario: A table that fits on one page
- **WHEN** Costos pendientes holds 3 Costos
- **THEN** the table shows all 3, the footer reads `1–3 de 3`, and `Anterior` and `Siguiente` both show, disabled

#### Scenario: Nothing matches
- **WHEN** the owner searches Proyectos for a text no Proyecto contains
- **THEN** the footer shows no range, both buttons are disabled, and `Ningún proyecto coincide.` shows

#### Scenario: Contactos pages 20 at a time
- **WHEN** the owner opens Contactos with 110 Contactos
- **THEN** the table shows 20 rows and the footer reads `1–20 de 110`

### Requirement: Which tables page
These tables SHALL be paginated: the Contactos list; the Cotizaciones list; the Proyectos list; in Finanzas, Cobrado, Por cobrar, Costos pendientes, Ingresos del periodo and Costos del periodo, each with its own footer and page; the Lab file list, for both a folder and search results; the Historial on the Ficha del Contacto; and Proyectos AI in AI. No other table or list SHALL change.

#### Scenario: Finanzas tables page on their own
- **WHEN** the owner moves Ingresos del periodo to page 3
- **THEN** Cobrado, Por cobrar, Costos pendientes and Costos del periodo stay on the page each was on

#### Scenario: Short lists stay whole
- **WHEN** the owner opens Contactos, Finanzas or Inicio
- **THEN** Top 10 por valor, Próximos pagos and Inicio's cards show their rows as before, with no footer

### Requirement: Changing what a table shows goes back to page 1
Changing a table's search text, one of its filters, Finanzas' or AI's Periodo, Por cobrar's Actual/Vencida choice, the Historial filter, or the Lab folder SHALL show that table from page 1. A Periodo or Finanzas search change SHALL do so for every table it narrows. Paging SHALL NOT change the search or filters.

#### Scenario: Filtering from a later page
- **WHEN** the owner is on page 4 of Cotizaciones and picks `Estado: Aceptada`
- **THEN** the table shows the first 20 Aceptadas and the footer range starts at 1

#### Scenario: Changing the Periodo
- **WHEN** Cobrado and Ingresos del periodo are on page 2 and the owner changes the Periodo
- **THEN** every Finanzas table shows page 1 of the new Periodo

#### Scenario: A filter on one Finanzas table leaves the others
- **WHEN** Ingresos del periodo is on page 2 and the owner switches Por cobrar to Vencida
- **THEN** Por cobrar shows page 1 and Ingresos del periodo stays on page 2

### Requirement: A table opens as it was left while the app is open
Leaving a section and coming back, by the header path, the sidebar, or from a record opened out of the table, SHALL show each table with the search, filters and page it had. Finanzas SHALL also keep its Periodo and Por cobrar's Actual/Vencida choice, and AI its Periodo. The Historial SHALL keep its filter and page per Contacto, so another Contacto's Ficha opens its own Historial as it was left, or on page 1 with the Todo filter the first time. Lab SHALL keep its folder, search text and page, and SHALL re-read them on return, so files added or removed on disk show. Coming back SHALL NOT move a table to page 1.

#### Scenario: Back from a Cotización
- **WHEN** the owner, on page 3 of Cotizaciones filtered to `Categoría: Website`, opens a Cotización and returns through `Cotizaciones` in the header path
- **THEN** the list shows page 3 with `Categoría: Website` selected and the same rows

#### Scenario: Back through the sidebar
- **WHEN** the owner leaves Proyectos on page 2 with `Sin ingresos registrados` ticked, opens Finanzas, then clicks Proyectos in the sidebar
- **THEN** Proyectos shows page 2 with `Sin ingresos registrados` still ticked

#### Scenario: Finanzas keeps its Periodo
- **WHEN** the owner sets Finanzas to `Este año`, pages Costos del periodo to page 2, and returns to Finanzas later
- **THEN** Finanzas shows `Este año` and Costos del periodo on page 2

#### Scenario: Historial per Contacto
- **WHEN** the owner leaves Edgar Uribe's Historial on page 2 and opens Marcela Barquero's Ficha for the first time
- **THEN** Marcela Barquero's Historial shows page 1 with the Todo filter, and Edgar Uribe's still opens on page 2

#### Scenario: A Lab folder that is gone
- **WHEN** the Lab folder the owner left no longer exists on disk when they return
- **THEN** Lab picks the first folder, as on a first visit, and shows its page 1

### Requirement: A table stays on a real page when its rows change
When a table's rows change while it is open or before the owner returns, because a row action moved or removed a row, or because records changed elsewhere, the table SHALL keep its page if that page still has rows. Otherwise it SHALL show the last page that has rows. A row action SHALL NOT send the table to page 1.

#### Scenario: A row action keeps the page
- **WHEN** the owner, on page 2 of Ingresos del periodo, uses Asignar proyecto on a row
- **THEN** the table reloads and still shows page 2

#### Scenario: The last row of the last page leaves
- **WHEN** Por cobrar holds 21 Ingresos and is on page 2, and the owner clicks `Pagado` on its one row
- **THEN** Por cobrar shows page 1 and the footer reads `1–20 de 20`

### Requirement: Nothing is kept across a restart
Search text, filters, Periodos and pages SHALL be kept only while the app stays open. After a restart every table SHALL open on page 1 with no search and no filters, and Finanzas and AI on their default Periodo. Nothing about them SHALL be stored in the database or on disk.

#### Scenario: Reopening the app
- **WHEN** the owner leaves Cotizaciones on page 5 filtered by a Contacto, quits and reopens the app, then opens Cotizaciones
- **THEN** it shows page 1 with every filter on Todos
