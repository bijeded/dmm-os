# facturas Specification

## Purpose

What the Facturas run records from the CFDIs under `Facturas/Emitidas`, and what it only counts under `Facturas/Recibidas`. It records an invoice's money only if the invoice stands, and on the days the invoice was actually paid.

## Requirements

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

### Requirement: A replaced CFDI is not imported
When a CFDI the run keeps names another CFDI in its CfdiRelacionados with TipoRelacion `04` (sustitución), Importar facturas SHALL treat the named CFDI as a Factura cancelada, whether or not its file is in the folders. A CFDI filed in a cancel folder SHALL NOT replace anything; a CFDI that was itself replaced still counts as having replaced what it named.

#### Scenario: Replacement filed in a later month
- **WHEN** `2020/05/ea1cd75e….xml` and `2020/08/c79a953d….xml` are both $15,312 invoices to the same RFC, and c79a953d names ea1cd75e with relación `04`
- **THEN** only c79a953d imports as an Ingreso

#### Scenario: Cancelled replacement does not knock out a valid invoice
- **WHEN** a complemento in `2018/12/Canceladas/` names the invoice `2018/11/b08fcf62….xml` with relación `04`
- **THEN** b08fcf62 still imports

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

### Requirement: Complementos de pago date a PPD invoice's payments
For an issued invoice with MetodoPago `PPD`, Importar facturas SHALL read every complemento de pago (tipo `P`) in the folders that is not a Factura cancelada and names that invoice. Payments to the same invoice with the same NumParcialidad SHALL count once.
- One payment that leaves no balance: the invoice SHALL import as one *pagado* Ingreso dated on that payment's FechaPago.
- Several payments: the invoice SHALL import as one Parcialidad per payment. Each Parcialidad is a *pagado*, *facturado* Ingreso dated on its FechaPago, with the same Contacto, UUID and notes. Each takes its payment's share of the invoice's subtotal, IVA and retenciones. The Parcialidad that leaves no balance SHALL take whatever remains, so the Parcialidades add up exactly to the invoice.
- If the last payment still leaves a balance, that balance SHALL be one more Parcialidad, *pendiente* and dated on the invoice's date.

The invoice's amounts SHALL decide the totals even when the complementos' amounts differ from them by a few pesos. A USD invoice's Parcialidades SHALL split its USD original in the same shares. A PPD invoice with no complemento SHALL import as today: *pagado* on its own date.

#### Scenario: Paid in two parts, a year apart
- **WHEN** the invoice 2a676e07 is PPD for $254,340.44 dated 2019-08-29, and complementos record $99,146.67 paid 2019-09-12 (parcialidad 1) and $155,203.62 paid 2020-08-13 (parcialidad 2, balance 0)
- **THEN** there are two Parcialidades for that UUID: one *pagado* 2019-09-12 for 99,146.67 / 254,340.44 of the invoice, and one *pagado* 2020-08-13 for the rest
- **AND** together they add up to $254,340.44, with IVA and retenciones split the same way

#### Scenario: Single payment after issue
- **WHEN** the PPD invoice 5c7ef771 for $2,320 dated 2018-10-30 has one complemento paying $2,320 on 2018-11-02
- **THEN** it is one Ingreso, *pagado* 2018-11-02

#### Scenario: Duplicate complemento
- **WHEN** the same parcialidad 1 of an invoice appears in two complemento files, neither in a cancel folder
- **THEN** that payment counts once

#### Scenario: Balance still open
- **WHEN** a PPD invoice for $10,000 has one complemento paying $4,000 with a remaining balance of $6,000
- **THEN** it has a *pagado* Parcialidad for 40% of the invoice and a *pendiente* Parcialidad for the other 60%, dated on the invoice's date

#### Scenario: USD invoice paid in two parts
- **WHEN** a PPD invoice for USD 1,000 is paid USD 400 then USD 600
- **THEN** its Parcialidades carry USD 400 and USD 600 as their originals, and their peso amounts add up to the invoice's peso amounts

#### Scenario: PPD without complemento
- **WHEN** a PPD invoice from 2018-04-10 has no complemento in the folders
- **THEN** it is one Ingreso, *pagado* 2018-04-10

### Requirement: An already imported PPD invoice is re-dated or split
When a PPD invoice was already imported as one Ingreso, and the complementos now in the folders date it differently, Importar facturas SHALL re-date that Ingreso or split it into Parcialidades as a fresh import would. It SHALL do this only while the Ingreso still holds the amounts and payment date the import gave it and has no Reembolso. New Parcialidades SHALL carry the original Ingreso's Contacto, Proyecto, Cotización and notes, and any Sugerencia de importación still waiting on it. An Ingreso edited by hand SHALL be left unchanged and listed in the log. Parcialidades SHALL be numbered by the payment's NumParcialidad. A later run with more complementos SHALL keep the Parcialidades already *pagado*, and SHALL re-derive only the *pendiente* remainder. When the complementos now in the folders would change a Parcialidad already *pagado*, or no longer split the invoice at all, the run SHALL leave all of that invoice's Ingresos unchanged and list it in the log, so the invoice is never counted twice.

#### Scenario: Split on the next run
- **WHEN** Ingreso 94 is the $254,340.44 invoice 2a676e07, *pagado* 2019-08-29 and linked to the Proyecto "Appleseed", and the user runs Importar facturas
- **THEN** Ingreso 94 becomes the first Parcialidad, *pagado* 2019-09-12
- **AND** a second Parcialidad, *pagado* 2020-08-13 and linked to "Appleseed", holds the rest
- **AND** the log lists Ingreso 94 among the Ingresos split this run

#### Scenario: Edited by hand
- **WHEN** the user changed an imported PPD Ingreso's payment date to 2019-10-01 and complementos now date it differently
- **THEN** Importar facturas leaves it unchanged and lists it in the log

#### Scenario: Missing complemento turns up
- **WHEN** an invoice was split on the complementos for payments 1 and 3, with a *pendiente* remainder, and the complemento for payment 2 is added
- **THEN** the next run adds Parcialidad 2 and re-derives the remainder, keeping Parcialidades 1 and 3 unchanged
- **AND** the Parcialidades still add up to the invoice

#### Scenario: Complementos no longer match
- **WHEN** an invoice's paid Parcialidades came from a complemento that is later moved to a `Canceladas` folder
- **THEN** the run leaves them unchanged and lists the invoice in the log, and adds no whole-invoice Ingreso beside them

#### Scenario: Later complemento closes the balance
- **WHEN** an invoice has a *pagado* Parcialidad and a *pendiente* remainder, and a complemento for the final payment is added
- **THEN** the next run records that payment as *pagado* on its FechaPago, and no *pendiente* remainder is left
- **AND** Cobros no longer lists that remainder

### Requirement: A file that is not a CFDI is skipped quietly
An `.xml` under `Facturas/` whose document is not a CFDI (e.g. a CEP bank receipt from Banxico) SHALL be skipped and counted in the log as not a CFDI, not reported as an error. A CFDI that cannot be parsed, or has no timbre fiscal, SHALL still be reported as an error.

#### Scenario: CEP receipt among the invoices
- **WHEN** `Facturas/Emitidas/2019/02/comprobante de pago/CEP-20190227-HSBC051240.xml` is a CEP receipt
- **THEN** Importar facturas reports no error for it, and the log counts one file that is not a CFDI

#### Scenario: Unstamped CFDI
- **WHEN** a Comprobante has no TimbreFiscalDigital
- **THEN** it is reported as an error, as today

### Requirement: Logs reports what the Facturas run changed
Configuración → Logs SHALL show, for the last Facturas run and next to the existing counts: how many CFDIs it skipped as cancelled, how many as replaced, how many received CFDIs it read without importing, and how many files were not CFDIs. It SHALL list the Ingresos the run set to *cancelado* and the Ingresos it re-dated or split, each with its date and total, and those it left unchanged because they were edited by hand or have a Reembolso. Re-running with the same files SHALL change nothing and list no record as cancelled, re-dated or split.

#### Scenario: First run after this change
- **WHEN** the user runs Importar facturas on the current folders
- **THEN** Logs counts the received CFDIs read, creates no Costo, and lists no Costo as cancelled

#### Scenario: Second run
- **WHEN** the user runs Importar facturas again without changing any file
- **THEN** Logs lists no Ingreso cancelled, re-dated or split

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
