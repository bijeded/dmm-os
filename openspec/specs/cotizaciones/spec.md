# cotizaciones Specification

## Purpose

How a Cotización moves through its estados in the app, starting with the Aceptación tardía: recording that a Contacto took an expirada or rechazada Cotización after all.

## Requirements

### Requirement: Marcar como aceptada is offered on an expirada or rechazada Cotización
The Ficha de la Cotización SHALL offer **Marcar como aceptada…** on an expirada or rechazada Cotización that has no Proyecto. It SHALL NOT be offered on a borrador, enviada, aceptada or cancelada Cotización. An enviada one keeps its **Aceptada** button. The action SHALL open a dialog that says what will be recorded, and nothing SHALL change until the owner confirms. Closing the dialog SHALL change nothing. A request to mark any other Cotización aceptada this way SHALL be refused with a message, changing nothing.

#### Scenario: Expirada Cotización
- **WHEN** the owner opens Cotización 512, sent on 2026-08-01 with 15 días de vigencia and expirada since
- **THEN** its Ficha offers Marcar como aceptada… and Cambiar contacto

#### Scenario: Rechazada Cotización
- **WHEN** the owner opens a Cotización marked rechazada
- **THEN** its Ficha offers Marcar como aceptada…

#### Scenario: Not offered elsewhere
- **WHEN** the owner opens a borrador, an enviada, an aceptada or a cancelada Cotización
- **THEN** its Ficha does not offer Marcar como aceptada…

#### Scenario: Dialog closed
- **WHEN** the owner opens Marcar como aceptada… on Cotización 512 and closes the dialog
- **THEN** Cotización 512 is still expirada, with no Proyecto, Ingreso or Costo

### Requirement: A Cotización made in the app is accepted with its Plan de cobro
When the Cotización was made in the app, Marcar como aceptada… SHALL do what Aceptada does on an enviada Cotización, dated hoy. The Cotización SHALL become aceptada. Its Plan de cobro SHALL be recorded: its pending Ingresos, or its monthly definition, and its estimated Costos. A Proyecto *en curso* SHALL be created with fecha de inicio hoy, and its folder SHALL be created in `Proyectos/`. The first Periodos generados SHALL exist once it returns. The dialog SHALL say that the Plan de cobro will be recorded. For a USD Cotización, the dialog SHALL ask for the tipo de cambio, and the action SHALL be refused, changing nothing, without one.

#### Scenario: MXN one-off Cotización
- **WHEN** Cotización 512 (made in the app, $40,000.00 + IVA, one payment) is expirada and on 2026-09-29 the owner marks it aceptada
- **THEN** it is aceptada, a Proyecto en curso starting 2026-09-29 is created with its folder, and one pending Ingreso por facturar of $46,400.00 belongs to it

#### Scenario: USD Cotización
- **WHEN** a rechazada Cotización made in the app for USD 2,000 is marked aceptada with tipo de cambio 18.50
- **THEN** its pending Ingreso is recorded as $37,000.00 subtotal with USD 2,000 as the original at 18.50

#### Scenario: USD without tipo de cambio
- **WHEN** the owner confirms Marcar como aceptada… on a USD Cotización without entering a tipo de cambio
- **THEN** it is refused, and the Cotización stays as it was, with no Proyecto

#### Scenario: Monthly Cotización
- **WHEN** an expirada Cotización made in the app, billed mensual, is marked aceptada on 2026-09-29
- **THEN** its monthly definition exists and its September 2026 Periodo generado exists

### Requirement: An imported Cotización is accepted without Ingresos or Costos
When the Cotización was imported, Marcar como aceptada… SHALL record no Ingreso, Costo or recurring definition, and SHALL ask for no tipo de cambio, USD or not (ADR-0002). The dialog SHALL ask which Proyecto it led to. The choices SHALL be every Proyecto of its Contacto that has no Cotización and is not cancelled, plus **Proyecto nuevo**. With an existing Proyecto chosen, that Proyecto SHALL take the Cotización. It SHALL keep its estado, name, notes and Cliente final. It SHALL take the Cotización's categoría over `other` and the Cotización's fecha as a missing fecha de inicio. With Proyecto nuevo, a *completado* Proyecto SHALL be created as the folder scan creates one for an accepted Cotización with no folder: named after the project the Cotización delivers, with its other names in notes, with the Cotización's categoría and with its fecha as fecha de inicio. A Sugerencia de importación *ubicación* SHALL then ask whether that Proyecto is Archivado or No disponible. In both cases, a Cotización with two or more prices SHALL leave a Sugerencia *partidas* ("¿Qué aceptó?") in Logs. No folder SHALL be created.

#### Scenario: Linked to an existing Proyecto
- **WHEN** imported Cotización 290 of "Zamora Live" is expirada, the Contacto has the Proyecto "Zamora Live" (completado, categoría `other`, no Cotización), and the owner marks the Cotización aceptada choosing that Proyecto
- **THEN** Cotización 290 is aceptada and linked to "Zamora Live", which stays completado and takes the Cotización's categoría
- **AND** no Ingreso or Costo is created

#### Scenario: Proyecto nuevo
- **WHEN** imported Cotización 377 "Korova - Blog" is expirada and the owner marks it aceptada choosing Proyecto nuevo
- **THEN** a completado Proyecto "Blog" of "Korova" is created with the Cotización's fecha as fecha de inicio
- **AND** Logs shows a Sugerencia *ubicación* asking whether it is Archivado or No disponible
- **AND** no folder is created in `Proyectos/`

#### Scenario: Several prices
- **WHEN** an imported expirada Cotización listing two prices, $30,000.00 and $12,000.00, is marked aceptada
- **THEN** Logs shows a Sugerencia *partidas* "¿Qué aceptó?" for it

#### Scenario: USD imported Cotización
- **WHEN** an imported expirada Cotización in USD is marked aceptada
- **THEN** the dialog asks for no tipo de cambio, and no Ingreso is created

#### Scenario: Cancelled Proyectos are not offered
- **WHEN** the Contacto has a cancelled Proyecto with no Cotización
- **THEN** the dialog does not list it

### Requirement: An Aceptación tardía stays aceptada
After Marcar como aceptada…, the Cotización SHALL stay aceptada whatever its fecha and validity. Bringing the ledger Al día SHALL NOT make it expirada again, and reading it again SHALL change nothing.

#### Scenario: Read the next day
- **WHEN** Cotización 512, expired in August, was marked aceptada on 2026-09-29, and the app is opened on 2026-09-30
- **THEN** Cotización 512 is still aceptada, with the same Proyecto, Ingresos and Costos

### Requirement: Derived facts follow an Aceptación tardía
Once a Cotización is marked aceptada, every derived fact SHALL reflect it without anything stored for it. The Estado de Contacto SHALL count the aceptada Cotización and its Proyecto. The Cotizaciones summary SHALL count it as aceptada in its conversion rate. Cobros SHALL show the pending Ingresos a Cotización made in the app recorded. A completed Proyecto with files, linked to an imported one-off or installment Cotización whose paid and Incobrable Ingresos do not reach its total, SHALL show Sin ingresos registrados until those Ingresos are entered.

#### Scenario: Contacto becomes Cliente activo
- **WHEN** the Contacto's only Cotización is expirada, and it is made in the app and marked aceptada
- **THEN** the Estado de Contacto shows Cliente activo, through its new Proyecto en curso

#### Scenario: Conversion rate
- **WHEN** 10 non-borrador Cotizaciones include 3 aceptadas, and an expirada one is marked aceptada
- **THEN** the Cotizaciones summary shows a 40% conversion

#### Scenario: Cobros
- **WHEN** a Cotización made in the app is marked aceptada and its pending Ingreso por facturar has no date
- **THEN** Cobros lists it under *Por facturar*

#### Scenario: Sin ingresos registrados
- **WHEN** an imported one-off Cotización of $50,000.00 is linked by Marcar como aceptada… to a completed Proyecto whose folder is in `Archivo/Proyectos/` and which has no Ingresos
- **THEN** the Proyecto shows Sin ingresos registrados
- **AND** it clears once paid Ingresos reaching $50,000.00 are entered for it

### Requirement: Cancelling after an Aceptación tardía
A Cotización marked aceptada by Marcar como aceptada… SHALL be cancellable exactly as any aceptada Cotización is: only while its Proyecto can be cancelled, with Cancelación con pagos. Cancelling SHALL NOT bring back its earlier expirada or rechazada estado.

#### Scenario: Cancelled the same day
- **WHEN** Cotización 512 was marked aceptada with its Plan de cobro, nothing is paid, and the owner cancels it
- **THEN** the Cotización and its Proyecto are cancelada, its pending Ingresos are cancelled and its pending estimated Costos are cancelled

#### Scenario: Imported Cotización with a completado Proyecto
- **WHEN** an imported Cotización was marked aceptada with Proyecto nuevo
- **THEN** its Ficha does not offer Cancelar cotización, since its Proyecto is completado

### Requirement: Reimportar desde cero undoes the Aceptación tardía of an imported Cotización
An Aceptación tardía of an imported Cotización SHALL be an edit to imported records. The Proyecto nuevo it creates SHALL count as imported: it SHALL NOT make Reimportar desde cero refuse, and the reimport SHALL remove it. After the reimport, the Cotización SHALL come back as the scan imports it, and the acceptance SHALL be lost. A Cotización made in the app SHALL still make Reimportar desde cero refuse, as it does today.

#### Scenario: Reimport after accepting an imported Cotización
- **WHEN** imported Cotización 377 was marked aceptada with Proyecto nuevo, nothing else was made by hand, and the owner runs Reimportar desde cero
- **THEN** the reimport is not refused, the Proyecto "Blog" it created is removed, and Cotización 377 is imported again and brought Al día as expirada
