## ADDED Requirements

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
