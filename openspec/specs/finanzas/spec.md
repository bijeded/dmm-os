# finanzas Specification

## Purpose

Which Ingresos Finanzas and every money figure count as income, how Ingresos that never count (cancelado, Incobrable) show and are undone in Finanzas, how an imported invoice is moved to another Proyecto from its row (Asignar proyecto), and how any other Ingreso recorded wrongly is corrected in place (Editar ingreso).

## Requirements

### Requirement: Only pending and paid Ingresos count as income
Revenue, IVA and retenciones in Finanzas, Ingreso proyectado and Ingreso real on Inicio, Ingreso AI in the AI section, the Contacto Ficha's cobrado and por cobrar, and Cobros SHALL count only Ingresos that are *pendiente* or *pagado*. A *cancelado* or *incobrable* Ingreso SHALL never count as income, in MXN or USD.

#### Scenario: Incobrable left out of revenue
- **WHEN** a month has a $8,000 *pagado* `sin_factura` Ingreso and a $1,000 *incobrable* one
- **THEN** Finanzas shows $8,000 of revenue for the month, all sin factura, and Ingreso real on Inicio is $8,000

#### Scenario: Incobrable on a Proyecto AI
- **WHEN** a Proyecto AI has a $500 *incobrable* Ingreso in the period
- **THEN** Ingreso AI does not include it

#### Scenario: Incobrable USD Ingreso
- **WHEN** an *incobrable* Ingreso is USD 100 recorded at 18.50
- **THEN** no revenue figure includes its $1,850.00

#### Scenario: Incobrable never in Cobros
- **WHEN** an Ingreso is *incobrable*
- **THEN** it is in no Cobros group and not in Cobranza

### Requirement: Incobrable Ingresos show in the Finanzas list
The Finanzas Ingresos list SHALL show an *incobrable* Ingreso in its period with the estado label "Incobrable" and SHALL exclude *cancelado* ones, as today. Showing it SHALL NOT add it to any total. A hand-entered Incobrable Ingreso with no Reembolso SHALL offer Eliminar, following Borrar vs cancelar, and SHALL offer no Marcar pagado, Cancelar or Reembolso.

#### Scenario: Listed but not counted
- **WHEN** the owner opens Finanzas for the month of a $1,000 *incobrable* Ingreso
- **THEN** the Ingresos list shows it as Incobrable, and the month's revenue does not include it

#### Scenario: Deleting it
- **WHEN** the owner deletes that Incobrable Ingreso from its row
- **THEN** it is removed from the database and the list

### Requirement: Asignar proyecto moves an invoice to another Proyecto
In the Finanzas Ingresos list, the row of an Ingreso imported from a CFDI that is not cancelled and is not a Reembolso SHALL offer **Asignar proyecto**. Its dialog SHALL list the client Proyectos of the Ingreso's Contacto, whatever their estado, newest first, plus **Ningún proyecto**, and SHALL mark the current one. On confirm, every Ingreso of that CFDI (all its Parcialidades) and the Reembolsos recorded against them SHALL be on the chosen Proyecto, or on none. Their Contacto, amounts, estados, dates and USD originals SHALL be unchanged. Closing the dialog SHALL change nothing.

#### Scenario: Invoice assigned to Cantina 48
- **WHEN** CFDI Ingreso 481 ($5,500, pagado 2018-09-20, Contacto "Omar Rodriguez") is on no Proyecto, and the owner chooses Asignar proyecto → "Cantina 48"
- **THEN** Ingreso 481 is on the Proyecto "Cantina 48", still pagado on 2018-09-20

#### Scenario: Moved from one Proyecto to another
- **WHEN** a CFDI Ingreso is on the Proyecto "La Boom" and the owner assigns it to "Cantina Rooftop" of the same Contacto
- **THEN** it is on "Cantina Rooftop" and no longer on "La Boom"

#### Scenario: Removed from its Proyecto
- **WHEN** the owner chooses Ningún proyecto for a CFDI Ingreso on "Cantina Rooftop"
- **THEN** the Ingreso is on no Proyecto and keeps its Contacto

#### Scenario: Parcialidades move together
- **WHEN** a PPD invoice was split into two paid Parcialidades and a pending one, and the owner assigns one of their rows to a Proyecto
- **THEN** all three are on that Proyecto

#### Scenario: Reembolso follows its invoice
- **WHEN** a CFDI Ingreso has a Reembolso recorded against it, and the owner assigns the Ingreso to another Proyecto
- **THEN** the Reembolso is on the same Proyecto, and its row offers no Asignar proyecto of its own

#### Scenario: USD invoice
- **WHEN** a USD 2,000 CFDI Ingreso recorded at 19.10 is assigned to a Proyecto
- **THEN** it keeps its peso amounts, USD original and rate

#### Scenario: Hand-entered Ingreso
- **WHEN** an Ingreso was entered by hand or came from a Plan de cobro
- **THEN** its row offers no Asignar proyecto

### Requirement: An invoice with no Contacto takes its Proyecto's Contacto
When the CFDI Ingreso has no Contacto (its receptor RFC is held by none), Asignar proyecto SHALL list every client Proyecto, each with its Contacto's name. Choosing a Proyecto SHALL also give all Ingresos of that CFDI, and their Reembolsos, that Proyecto's Contacto. The Contacto's RFC SHALL be unchanged, and the Ingresos SHALL keep that Contacto if later set to Ningún proyecto. A Facturas run SHALL NOT change the Contacto or Proyecto of an Ingreso it already imported.

#### Scenario: Paid by the parent company
- **WHEN** a CFDI Ingreso for "Diseño y desarrollo de sitios web laboomny.com y zamoralive…" has no Contacto because its receptor RFC is on no Contacto, and the owner assigns it to "La Boom" of "Omar Rodriguez"
- **THEN** the Ingreso is on "La Boom" and belongs to "Omar Rodriguez"
- **AND** "Omar Rodriguez" still holds only the RFC `ZEM180223H23`

#### Scenario: Facturas run afterwards
- **WHEN** the owner runs Importar facturas after assigning that Ingreso
- **THEN** the Ingreso keeps its Proyecto and Contacto, and no second Ingreso is created for its UUID

### Requirement: Asignar proyecto answers the pending link suggestion
When a moved Ingreso has a pending *vincular* Sugerencia de importación, Asignar proyecto SHALL answer it in the same step: *aceptada* when the chosen Proyecto is the one it proposed, *corregida* when it is another, and *rechazada* when Ningún proyecto is chosen. Logs SHALL no longer show it as pending.

#### Scenario: Suggested Proyecto chosen
- **WHEN** a pending *vincular* Sugerencia proposes Proyecto "Cantina 48" for CFDI Ingreso 485, and the owner assigns 485 to "Cantina 48" from Finanzas
- **THEN** that Sugerencia is *aceptada*

#### Scenario: Another Proyecto chosen
- **WHEN** the same Sugerencia is pending and the owner assigns 485 to "Cantina Rooftop"
- **THEN** that Sugerencia is *corregida*

### Requirement: Proyectos read their money from the assigned invoices
After Asignar proyecto, both Proyectos' Cobrado, Por cobrar and Completar availability, Sin ingresos registrados, Ingreso AI of a Proyecto AI, and Cobros SHALL be read from the Ingresos as they now are; nothing SHALL be stored. A Proyecto's estado SHALL NOT change: a completed Proyecto that loses its invoice stays completado, and an en curso one that gains it stays en curso until completed.

#### Scenario: Sin ingresos registrados clears
- **WHEN** the completed Proyecto "Cantina 48" (with files, Cotización 190 for $9,000) shows Sin ingresos registrados, and the owner assigns it CFDI Ingresos totalling $9,000 subtotal, paid
- **THEN** "Cantina 48" no longer shows Sin ingresos registrados

#### Scenario: Invoice taken away from a completed Proyecto
- **WHEN** a completed Proyecto's only paid Ingreso is assigned to another Proyecto, and it has files and a $9,000 one-off Cotización
- **THEN** it stays completado and shows Sin ingresos registrados

#### Scenario: Pending invoice reaches Cobros through its new Proyecto
- **WHEN** a pending CFDI Ingreso is assigned to an en curso Proyecto
- **THEN** that Proyecto's Por cobrar includes it and Completar is still refused while it is pending

### Requirement: Editar ingreso is offered on every Ingreso not imported from a CFDI
In the Finanzas Ingresos list, the row of every Ingreso that was not imported from a CFDI SHALL offer **Editar**, whatever its estado and origin: entered by hand, written by Completar con cobro, from a Plan de cobro, generated for a periodo, Incobrable, or a Reembolso. It SHALL open the Ingreso's current values, filled in. Closing it without saving SHALL change nothing. The row of an Ingreso imported from a CFDI SHALL offer no Editar. A *cancelado* Ingreso is not listed, so it offers none.

#### Scenario: Ingreso written by Completar con cobro
- **WHEN** the owner opens Finanzas for September 2026 and finds Ingreso 884 (`sin_factura`, *pagado* 2026-09-29, USD 260.00 at 19.2308, $5,000.01, Proyecto "La Hora Zero")
- **THEN** its row offers Editar, and Editar opens with fecha 2026-09-29, USD 260.00, tipo de cambio 19.2308, Sin factura and Proyecto "La Hora Zero"

#### Scenario: Imported invoice
- **WHEN** an Ingreso was imported from a CFDI by the Facturas run
- **THEN** its row offers no Editar, and still offers Asignar proyecto

#### Scenario: Hand-entered Ingreso on an imported Proyecto
- **WHEN** a `sin_factura` Ingreso was entered by hand on a Proyecto the Importación created
- **THEN** its row offers Editar

#### Scenario: Closing without saving
- **WHEN** the owner opens Editar on an Ingreso, changes its fecha and closes it without saving
- **THEN** the Ingreso keeps every value it had

### Requirement: Editar ingreso changes the fecha
Saving a new fecha SHALL date the Ingreso on it: a *pagado* Ingreso (a Reembolso included) SHALL have both its fecha de registro and fecha de pago set to it, and a *pendiente* or Incobrable one its fecha de registro. The fecha of a *pagado* Ingreso SHALL NOT be later than today, nor a day that does not exist. A Reembolso SHALL NOT be dated before the Ingreso it gives money back from, nor an Ingreso after any of its Reembolsos. The Ingreso SHALL count in the period of its new fecha and no longer in the old one. An Ingreso generated for a periodo SHALL keep its periodo, and no other Ingreso SHALL be generated for that periodo. A Reembolso SHALL count on its new fecha.

#### Scenario: Payment from 2019 recorded today
- **WHEN** the owner sets Ingreso 884's fecha to 2019-03-15 and saves
- **THEN** Ingreso 884 is *pagado* on 2019-03-15, Finanzas for March 2019 includes its $5,000.01 in revenue, and September 2026 no longer does
- **AND** Ingreso real on Inicio for September 2026 no longer includes it

#### Scenario: Paid date in the future refused
- **WHEN** the owner sets a *pagado* Ingreso's fecha to a day after today
- **THEN** saving is refused and the Ingreso keeps its fecha

#### Scenario: Reembolso before its payment refused
- **WHEN** an Ingreso paid 2026-06-10 has a Reembolso dated 2026-07-01, and the owner sets the Reembolso's fecha to 2026-03-01, or the Ingreso's to 2026-08-01
- **THEN** saving is refused and both keep their fechas

#### Scenario: Pending Ingreso moved to next month
- **WHEN** a *pendiente* Plan de cobro Parcialidad dated this month is set to a date next month
- **THEN** it stays *pendiente*, is dated next month, and is no longer in Cobros

#### Scenario: Generated Ingreso
- **WHEN** the owner changes the fecha of the Ingreso generated for periodo 2026-08 of a `mensual` Cotización to 2026-08-20
- **THEN** it is dated 2026-08-20 and is still the Ingreso of periodo 2026-08, and Finanzas never shows a second Ingreso for that periodo

#### Scenario: Reembolso dated when the money was given back
- **WHEN** a Reembolso recorded today is set to the 3rd of last month
- **THEN** it counts in last month's revenue as a negative amount, and no longer in this month's

### Requirement: Editar ingreso changes the amount
An Ingreso's amount SHALL be edited in the currency it was recorded in. For an MXN Ingreso it SHALL be the subtotal, with IVA recomputed from its categoría. For a USD Ingreso it SHALL be the USD amount and its tipo de cambio: the peso amounts SHALL be recomputed at that rate and the USD amount SHALL be kept as its original. The currency SHALL NOT change. A USD Ingreso with Reembolsos SHALL keep its tipo de cambio, which they were converted at. The amount SHALL be above zero, and, when the Ingreso has Reembolsos, not less than what they already gave back, in the Ingreso's own currency. Saving it SHALL leave its Reembolsos unchanged.

#### Scenario: MXN amount corrected
- **WHEN** a hand-entered `sin_factura` Ingreso of $8,000 is edited to $8,500
- **THEN** it is $8,500 with no IVA, and its period's revenue rises by $500

#### Scenario: USD amount and rate corrected
- **WHEN** Ingreso 884 (USD 260.00 at 19.2308) is edited to USD 250.00 at 19.2308
- **THEN** it keeps USD as its currency with USD 250.00 as its original, and records $4,807.70

#### Scenario: Only the rate corrected
- **WHEN** a USD 1,000.00 Ingreso recorded at 18.00 is edited to a tipo de cambio of 17.50
- **THEN** it stays USD 1,000.00 and records $17,500.00

#### Scenario: Rate kept once refunded
- **WHEN** a USD 100.00 Ingreso recorded at 20.00 has a Reembolso, and the owner changes its tipo de cambio
- **THEN** saving is refused and it stays $2,000.00

#### Scenario: Below what was refunded
- **WHEN** a *pagado* $10,000 Ingreso has a $3,000 Reembolso and the owner edits it to $2,500
- **THEN** saving is refused and nothing changes

#### Scenario: Reembolso amount
- **WHEN** a *pagado* $10,000 Ingreso has Reembolsos of $3,000 and $2,000, and the owner edits the $2,000 one to $4,000
- **THEN** that Reembolso gives back $4,000, with its IVA in the original's proportion
- **AND** editing it to $8,000 instead is refused with "No se puede reembolsar más de lo pagado"

#### Scenario: USD Reembolso
- **WHEN** a Reembolso of a USD Ingreso recorded at 19.10 is edited to USD 100.00
- **THEN** it gives back USD 100.00, recorded as −$1,910.00 at the original's rate, and asks for no tipo de cambio of its own

### Requirement: Editar ingreso changes categoría, Estado de facturación and notas
An Ingreso that is not a Reembolso SHALL allow switching between `factura` and `sin_factura`. A `sin_factura` Ingreso SHALL carry no IVA and no Estado de facturación. A `factura` Ingreso SHALL ask whether 16% IVA applies and whether it is already invoiced, and SHALL be *por facturar* or *facturado* accordingly. Every editable Ingreso SHALL allow changing its notas. A Reembolso SHALL keep the categoría and Estado de facturación of the Ingreso it gives money back from, so an Ingreso that has Reembolsos SHALL NOT change its categoría or whether IVA applies.

#### Scenario: Paid without an invoice after all
- **WHEN** a *pendiente* `factura` Ingreso *por facturar* of $10,000 plus $1,600 IVA is switched to `sin_factura`
- **THEN** it is $10,000 with no IVA and no Estado de facturación, and it leaves the *Por facturar* group of Cobros

#### Scenario: Invoiced after all
- **WHEN** a `sin_factura` $10,000 Ingreso is switched to `factura` with IVA, already invoiced
- **THEN** it is $10,000 plus $1,600 IVA, $11,600 in total, *facturado*

#### Scenario: Ingreso with a Reembolso
- **WHEN** the owner opens Editar on a `factura` Ingreso that has a Reembolso
- **THEN** its categoría and IVA are shown but cannot be changed

### Requirement: Only a hand-entered Ingreso changes Proyecto or Contacto
Editar on an Ingreso entered by hand (including one written by Completar con cobro) SHALL allow choosing another Proyecto, or none. Choosing a Proyecto SHALL give the Ingreso that Proyecto's Contacto; choosing none SHALL allow choosing its Contacto, or none. Its Reembolsos SHALL move with it to the same Proyecto and Contacto. An Ingreso from a Plan de cobro, one generated for a periodo, and a Reembolso on its own SHALL keep their Proyecto and Contacto.

#### Scenario: Moved to the right Proyecto
- **WHEN** a hand-entered Ingreso on "La Boom" is moved to "Cantina Rooftop" of another Contacto
- **THEN** it is on "Cantina Rooftop" and belongs to that Proyecto's Contacto

#### Scenario: Reembolso follows its Ingreso
- **WHEN** a hand-entered Ingreso with a Reembolso is moved to another Proyecto
- **THEN** the Reembolso is on that Proyecto too, and editing the Reembolso offers no Proyecto of its own

#### Scenario: Plan de cobro Ingreso
- **WHEN** the owner opens Editar on a Parcialidad of a Plan de cobro
- **THEN** its Proyecto and Contacto are shown but cannot be changed

### Requirement: Editar ingreso never changes estado
Editar ingreso SHALL NOT change an Ingreso's estado. A *pendiente* Ingreso SHALL stay *pendiente*, a *pagado* one *pagado*, and an Incobrable one Incobrable; Marcar pagado, Cancelar and Eliminar SHALL remain the only ways to change it.

#### Scenario: Pending Ingreso edited
- **WHEN** the owner changes the amount and fecha of a *pendiente* Ingreso
- **THEN** it is still *pendiente*, with no fecha de pago

#### Scenario: Incobrable Ingreso edited
- **WHEN** the owner changes the amount of an Incobrable Ingreso written by Completar con cobro
- **THEN** it is still Incobrable and still counts toward no revenue figure

### Requirement: Figures follow an edited Ingreso
After Editar ingreso, revenue, IVA and retenciones in Finanzas, Ingreso proyectado and Ingreso real on Inicio, Ingreso AI, the Contacto Ficha's cobrado and por cobrar, Cobros, the Ficha del Proyecto's Cobrado and Por cobrar, Completar availability, and Sin ingresos registrados SHALL be read from the Ingreso as it now is; nothing SHALL be stored for them. Editing an Ingreso SHALL NOT change any Proyecto's estado. The other Parcialidades of a Plan de cobro SHALL NOT be adjusted when one is edited, even if they no longer add up to the Cotización total.

#### Scenario: Sin ingresos registrados appears
- **WHEN** a completed Proyecto with files and a $9,000 one-off Cotización has one *pagado* $9,000 Ingreso, and the owner edits it to $8,000
- **THEN** the Proyecto stays *completado* and shows Sin ingresos registrados

#### Scenario: Sin ingresos registrados clears
- **WHEN** the owner edits that Ingreso back to $9,000
- **THEN** the Proyecto no longer shows Sin ingresos registrados

#### Scenario: Pending Parcialidad reduced
- **WHEN** a Proyecto en curso has a $9,000 Cotización, a *pagado* $4,500 Parcialidad and a *pendiente* $4,500 one, and the owner edits the pending one to $4,000
- **THEN** its Por cobrar is $4,000, and marking it paid leaves a $500 gap that Completar con cobro asks for

#### Scenario: USD Cotización compared in USD
- **WHEN** Ingreso 884 is edited from USD 260.00 to USD 250.00 on "La Hora Zero", whose USD Cotización totals USD 260.00
- **THEN** "La Hora Zero" stays *completado* and, having files, shows Sin ingresos registrados
