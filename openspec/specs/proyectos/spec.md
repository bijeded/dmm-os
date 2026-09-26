# proyectos Specification

## Purpose

Completing a Proyecto: the guard that a Proyecto is only completed once fully paid, and Completar con cobro, which records the missing payment in the same step.

## Requirements

### Requirement: A Proyecto completes only once fully paid
A Proyecto en curso or pausado SHALL become *completado*, dated today as its fecha de fin, only when it has no pending Ingreso and, for a one-off or installment Cotización, its paid and Incobrable Ingresos together reach the Cotización total. A USD Cotización SHALL be compared in USD, by each Ingreso's USD amount. A Proyecto with no Cotización, or with a `mensual` one, SHALL need only no pending Ingreso. Imported Proyectos SHALL be held to the same rule when completed in the app (ADR-0002 exempts only the import).

#### Scenario: Fully paid Proyecto completes directly
- **WHEN** the owner clicks Completar on a Proyecto whose Cotización of $9,000 already has $9,000 in paid Ingresos and nothing pending
- **THEN** the Proyecto is *completado* without any dialog

#### Scenario: Proyecto without Cotización
- **WHEN** the owner clicks Completar on a personal Proyecto with no Cotización and no pending Ingreso
- **THEN** the Proyecto is *completado* without any dialog

#### Scenario: Monthly Cotización
- **WHEN** the owner clicks Completar on a Proyecto from a `mensual` Cotización with no pending Ingreso
- **THEN** the Proyecto is *completado* without any dialog, whatever its paid Ingresos add up to

#### Scenario: Completar without the payment is refused
- **WHEN** Completar is asked for a Proyecto with a gap and no cobro is given, whether the Proyecto was imported or made in the app
- **THEN** it is refused with "El proyecto se completa cuando esté pagado por completo" and nothing is written

#### Scenario: Cancelled Proyecto
- **WHEN** the Proyecto is *cancelado*
- **THEN** the Ficha offers no Completar and no Completar con cobro dialog

### Requirement: Completar con cobro opens when there is a gap
When Completar finds that a Proyecto is not fully paid, the Ficha del Proyecto SHALL open the Completar con cobro dialog instead of refusing. The dialog SHALL show the Cotización total, what is already paid, the Proyecto's pending Ingresos, and what is still missing after them, in the Cotización's currency. It SHALL ask for a **Fecha de pago** (defaults to today, never later than today) and, when something is still missing after the pending Ingresos, **¿Con factura?** (Sí / No). Closing the dialog SHALL write nothing and leave the Proyecto as it was.

#### Scenario: Imported Proyecto with no Ingresos
- **WHEN** the owner clicks Completar on an imported Proyecto en curso whose Cotización totals $9,000 and has no Ingresos
- **THEN** the dialog opens showing $9,000 missing, Fecha de pago set to today and ¿Con factura? unanswered

#### Scenario: Closing the dialog
- **WHEN** the owner closes the dialog without confirming
- **THEN** no Ingreso is written and the Proyecto stays en curso

#### Scenario: Future Fecha de pago
- **WHEN** the owner picks a Fecha de pago after today
- **THEN** the dialog refuses to confirm with "La fecha de pago no puede ser futura"

### Requirement: Sin factura records a paid uninvoiced Ingreso
Answering *No* to ¿Con factura? SHALL record one Ingreso on the Proyecto, with the Proyecto's Contacto, categoría `sin_factura`, estado *pagado*, dated the Fecha de pago. Its amount SHALL be the amount received, with no IVA. The Proyecto SHALL become *completado* in the same step.

#### Scenario: Lukka's web project in MXN
- **WHEN** a Proyecto of Lukka whose Cotización totals $9,000 has no Ingresos, and the owner answers No, keeps $9,000 and confirms with Fecha de pago 2026-09-20
- **THEN** a $9,000 `sin_factura` Ingreso, *pagado* on 2026-09-20, IVA $0, is recorded on the Proyecto, and the Proyecto is *completado* with fecha de fin today

#### Scenario: USD Cotización
- **WHEN** a Proyecto's Cotización totals USD 1,000, it has no Ingresos, and the owner answers No with a tipo de cambio of 18.50
- **THEN** a `sin_factura` Ingreso is recorded with USD 1,000 as its original amount and $18,500.00 in pesos, and the Proyecto is *completado*

#### Scenario: USD tipo de cambio default
- **WHEN** the dialog opens for a USD Cotización accepted at a tipo de cambio of 17.90
- **THEN** the dialog asks for the tipo de cambio with 17.90 filled in, and refuses to confirm without a rate above zero

### Requirement: Con factura links the Contacto's CFDI
Answering *Sí* SHALL list the Contacto's Ingresos imported from a CFDI that are not cancelled and not on any Proyecto, one entry per CFDI (its Parcialidades together). The list SHALL show first those whose subtotal equals the Cotización subtotal, then the rest newest first. A USD Cotización lists only CFDIs issued in USD. Choosing one SHALL link all of that CFDI's Ingresos to the Proyecto, mark any of them still pending as *pagado* on the Fecha de pago, and answer any pending *vincular* Sugerencia de importación for them with this Proyecto. No new Ingreso SHALL be created. The CFDI's amount counts toward the gap; it is not editable.

#### Scenario: Linking an unlinked CFDI
- **WHEN** the Contacto has a paid CFDI Ingreso of subtotal $9,000 on no Proyecto, and the owner answers Sí, chooses it and confirms
- **THEN** that Ingreso is on the Proyecto, no other Ingreso is created, and the Proyecto is *completado*

#### Scenario: Pending Sugerencia answered
- **WHEN** the chosen CFDI Ingreso has a pending *vincular* Sugerencia guessing another Proyecto
- **THEN** the Sugerencia is recorded as *corregida* to this Proyecto and no longer waits in Logs

#### Scenario: Pending PPD invoice
- **WHEN** the chosen CFDI's remaining Parcialidad is still pending
- **THEN** it is marked *pagado* on the Fecha de pago along with the link

#### Scenario: Invoice not on disk
- **WHEN** the Contacto has no unlinked CFDI Ingreso, or the owner says the invoice is not on disk
- **THEN** the dialog offers "La factura no está en Facturas/Emitidas", which records a `factura` Ingreso, *facturado*, *pagado* on the Fecha de pago, whose total is the amount received with 16% IVA inside it unless the owner turns IVA off

#### Scenario: No duplicate Ingreso
- **WHEN** the owner links a CFDI from the list
- **THEN** the Proyecto's Ingresos are that CFDI's and the ones it already had, and a later Facturas run over the same XML creates no second Ingreso for it

### Requirement: Pending Ingresos are settled, not duplicated
A Proyecto with pending Ingresos (from its Plan de cobro) SHALL show each in the dialog as *Cobrado* (default) or *Incobrable*. On confirm, each Cobrado one SHALL become *pagado* on the Fecha de pago and each Incobrable one SHALL become *incobrable*. No new Ingreso SHALL be created for them. ¿Con factura? SHALL apply only to what is still missing after them.

#### Scenario: Proyecto made in the app
- **WHEN** a Proyecto's accepted Cotización of $11,600 left two pending Parcialidades of $5,800 and the owner confirms both as Cobrado
- **THEN** both Ingresos are *pagado* on the Fecha de pago, no Ingreso is added, ¿Con factura? is never asked, and the Proyecto is *completado*

#### Scenario: A Parcialidad never collected
- **WHEN** the owner marks the second Parcialidad Incobrable
- **THEN** it is recorded *incobrable*, the first is *pagado*, and the Proyecto is *completado*

### Requirement: A partial payment leaves the rest Incobrable
The amount received for what is still missing SHALL default to that gap and be editable, from above zero up to the gap. When it is less than the gap, the dialog SHALL say how much will be recorded as Incobrable, and on confirm SHALL record the rest as one Ingreso on the Proyecto with estado *incobrable*, categoría `sin_factura`, no IVA, dated the Fecha de pago. A USD one SHALL keep its USD amount and the dialog's rate. A linked CFDI worth less than the gap SHALL likewise leave the rest Incobrable.

#### Scenario: Discount on an MXN job
- **WHEN** the Cotización totals $9,000, the owner answers No and enters $8,000 received
- **THEN** a $8,000 `sin_factura` Ingreso *pagado* and a $1,000 Ingreso *incobrable* are recorded, and the Proyecto is *completado*

#### Scenario: Partial USD payment
- **WHEN** the Cotización totals USD 1,000, the owner enters USD 900 at 18.50
- **THEN** a *pagado* Ingreso of USD 900 ($16,650.00) and an *incobrable* one of USD 100 ($1,850.00) are recorded

#### Scenario: Amount above the gap
- **WHEN** the owner enters more than the gap for a sin factura payment
- **THEN** the dialog refuses to confirm with "El monto no puede ser mayor a lo que falta"

### Requirement: Derived facts update after Completar con cobro
Cobros, Sin ingresos registrados, the Ficha's Cobrado and Por cobrar, and Estado de Contacto (a completed Proyecto no longer makes its Contacto an active client) SHALL be recomputed from the Ingresos Completar con cobro wrote. Nothing SHALL be stored for them.

#### Scenario: Sin ingresos registrados clears
- **WHEN** an imported completed Proyecto flagged Sin ingresos registrados has its gap filled by recorded Ingresos
- **THEN** the flag no longer shows in Proyectos

#### Scenario: Cobros drops settled Ingresos
- **WHEN** Completar con cobro marks a pending Ingreso that was in Cobros *pagado* or *incobrable*
- **THEN** that Ingreso is in none of the Cobros groups on Inicio

### Requirement: Undoing Completar con cobro
A `sin_factura` or Incobrable Ingreso written by Completar con cobro SHALL be deletable from Finanzas like any hand-entered Ingreso (Borrar vs cancelar). Deleting it SHALL NOT reopen the Proyecto. A completed Proyecto whose paid and Incobrable Ingresos then fall short of its Cotización SHALL show Sin ingresos registrados again when it has files.

#### Scenario: Deleting the Incobrable Ingreso
- **WHEN** the owner deletes the $1,000 Incobrable Ingreso of a completed Proyecto whose Cotización totals $9,000 and whose folder is in `Proyectos/`
- **THEN** the Proyecto stays *completado* and shows Sin ingresos registrados

#### Scenario: Deleting the uninvoiced payment
- **WHEN** the owner deletes the $9,000 `sin_factura` Ingreso Completar con cobro recorded
- **THEN** it is removed, the Proyecto stays *completado*, and Finanzas no longer counts the $9,000
