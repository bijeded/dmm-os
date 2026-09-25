## ADDED Requirements

### Requirement: Received CFDIs are counted, not imported
Importar facturas SHALL read the CFDIs under `Facturas/Recibidas` and SHALL NOT create a Costo, or a Sugerencia de importación, from any of them. Its log SHALL count the received CFDIs it read. Costos SHALL be entered by hand in Finanzas. A Costo an earlier run imported from a received CFDI SHALL stay as it is: later runs SHALL neither update nor cancel it, even when its CFDI is later filed as cancelled. Reimportar desde cero removes it.

#### Scenario: Phone bill in Recibidas
- **WHEN** `Facturas/Recibidas/2026/06/000000573360456.xml` is an AT&T invoice for $784.99 and the user runs Importar facturas
- **THEN** no Costo exists for its UUID
- **AND** the log counts it among the received CFDIs read

#### Scenario: USD received invoice
- **WHEN** a received invoice in USD sits in `Facturas/Recibidas`
- **THEN** no Costo is created for it, in pesos or in dollars

#### Scenario: Costo imported before this change
- **WHEN** a Costo was imported from a received CFDI by an earlier run, and the user runs Importar facturas
- **THEN** that Costo is unchanged, and Finanzas still counts it until the user cancels it or runs Reimportar desde cero

#### Scenario: Issued invoices unaffected
- **WHEN** `Facturas/Emitidas` holds three invoices to `SIA161024H91` and `Facturas/Recibidas` holds ten received CFDIs
- **THEN** Importar facturas imports the three Ingresos exactly as before

## MODIFIED Requirements

### Requirement: A CFDI filed as cancelled is not imported
Importar facturas SHALL NOT import a CFDI that sits, at any depth below `Facturas/Emitidas`, inside a folder whose name starts with "cancel", ignoring case and accents (e.g. `Canceladas`, `cancelados`, `Cancelaciones`, `Cancelación`, `cancelada`). Such a CFDI is a Factura cancelada. A complemento de pago in such a folder SHALL NOT date any payment. The same UUID found in another folder SHALL still count as cancelled.

#### Scenario: Cancelled invoice in its month folder
- **WHEN** `Facturas/Emitidas/2019/08/Canceladas/c266deaa….xml` is an issued invoice for $104,000 subtotal, and no Ingreso exists for it
- **THEN** after Importar facturas there is still no Ingreso for that UUID
- **AND** the run's log counts it as cancelled

#### Scenario: Accented folder name
- **WHEN** an invoice sits in `Facturas/Emitidas/2023/07/Cancelación/`
- **THEN** it is not imported

#### Scenario: Received invoice filed as cancelled
- **WHEN** a received invoice sits in `Facturas/Recibidas/2025/03/Canceladas/`
- **THEN** no Costo is created for it, as for every received CFDI

#### Scenario: USD invoice filed as cancelled
- **WHEN** an issued invoice in USD sits in a `Canceladas` folder
- **THEN** no Ingreso is created for it, in pesos or in dollars

### Requirement: An imported Factura cancelada becomes cancelado
When Importar facturas finds that an Ingreso already in the database comes from a Factura cancelada, it SHALL set that Ingreso to *cancelado*. It SHALL do this even when the Ingreso is *pagado*, because imported history is exempt from the lifecycle guards (ADR-0002). The Ingreso SHALL keep its amounts, links and UUID, and SHALL NOT be imported again. An Ingreso that has a Reembolso SHALL be left unchanged and listed in the log. Once the Ingreso is cancelled, derived facts that read it SHALL update: Finanzas totals, Ingreso proyectado / Ingreso real, Cobros, and Sin ingresos registrados. In the app, a *pagado* Ingreso SHALL still not be cancellable by hand.

#### Scenario: Paid Ingreso from a cancelled invoice
- **WHEN** Ingreso 99 ($104,000 subtotal, *pagado* 2019-08-28, Proyecto "Appleseed") came from an invoice now in a `Canceladas` folder, and the user runs Importar facturas
- **THEN** Ingreso 99 is *cancelado*, still linked to its Proyecto and Contacto
- **AND** Finanzas no longer counts it in August 2019
- **AND** the log lists it among the Ingresos cancelled this run

#### Scenario: Double-counted replacement
- **WHEN** Ingresos 113 (from ea1cd75e) and 121 (from c79a953d) both exist and c79a953d replaces ea1cd75e
- **THEN** Ingreso 113 becomes *cancelado* and Ingreso 121 is unchanged

#### Scenario: Sin ingresos registrados reappears
- **WHEN** a completed Proyecto had its quote total covered only by an Ingreso that becomes *cancelado*
- **THEN** that Proyecto shows Sin ingresos registrados again

#### Scenario: USD Ingreso cancelled
- **WHEN** an imported USD Ingreso comes from a Factura cancelada
- **THEN** it becomes *cancelado* and keeps its USD original amount

#### Scenario: Received invoice already imported
- **WHEN** a Costo came from a received CFDI by an earlier run, and that CFDI is later moved into a `Canceladas` folder
- **THEN** Importar facturas leaves the Costo unchanged; received CFDIs no longer touch Costos

### Requirement: Logs reports what the Facturas run changed
Configuración → Logs SHALL show, for the last Facturas run and next to the existing counts: how many CFDIs it skipped as cancelled, how many as replaced, how many received CFDIs it read without importing, and how many files were not CFDIs. It SHALL list the Ingresos the run set to *cancelado* and the Ingresos it re-dated or split, each with its date and total, and those it left unchanged because they were edited by hand or have a Reembolso. Re-running with the same files SHALL change nothing and list no record as cancelled, re-dated or split.

#### Scenario: First run after this change
- **WHEN** the user runs Importar facturas on the current folders
- **THEN** Logs counts the received CFDIs read, creates no Costo, and lists no Costo as cancelled

#### Scenario: Second run
- **WHEN** the user runs Importar facturas again without changing any file
- **THEN** Logs lists no Ingreso cancelled, re-dated or split
