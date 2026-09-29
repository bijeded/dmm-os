# Spec Delta

## ADDED Requirements

### Requirement: Asignar proyecto moves an invoice to another Proyecto
In the Finanzas Ingresos list, the row of an Ingreso imported from a CFDI that is not cancelled and is not a Reembolso SHALL offer **Asignar proyecto**. Its dialog SHALL list the client Proyectos of the Ingreso's Contacto, whatever their estado, newest first, plus **Sin proyecto**, and SHALL mark the current one. On confirm, every Ingreso of that CFDI (all its Parcialidades) and the Reembolsos recorded against them SHALL be on the chosen Proyecto, or on none. Their Contacto, amounts, estados, dates and USD originals SHALL be unchanged. Closing the dialog SHALL change nothing.

#### Scenario: Invoice assigned to Cantina 48
- **WHEN** CFDI Ingreso 481 ($5,500, pagado 2018-09-20, Contacto "Omar Rodriguez") is on no Proyecto, and the owner chooses Asignar proyecto → "Cantina 48"
- **THEN** Ingreso 481 is on the Proyecto "Cantina 48", still pagado on 2018-09-20

#### Scenario: Moved from one Proyecto to another
- **WHEN** a CFDI Ingreso is on the Proyecto "La Boom" and the owner assigns it to "Cantina Rooftop" of the same Contacto
- **THEN** it is on "Cantina Rooftop" and no longer on "La Boom"

#### Scenario: Removed from its Proyecto
- **WHEN** the owner chooses Sin proyecto for a CFDI Ingreso on "Cantina Rooftop"
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
When the CFDI Ingreso has no Contacto (its receptor RFC is held by none), Asignar proyecto SHALL list every client Proyecto, each with its Contacto's name. Choosing a Proyecto SHALL also give all Ingresos of that CFDI, and their Reembolsos, that Proyecto's Contacto. The Contacto's RFC SHALL be unchanged, and the Ingresos SHALL keep that Contacto if later set to Sin proyecto. A Facturas run SHALL NOT change the Contacto or Proyecto of an Ingreso it already imported.

#### Scenario: Paid by the parent company
- **WHEN** a CFDI Ingreso for "Diseño y desarrollo de sitios web laboomny.com y zamoralive…" has no Contacto because its receptor RFC is on no Contacto, and the owner assigns it to "La Boom" of "Omar Rodriguez"
- **THEN** the Ingreso is on "La Boom" and belongs to "Omar Rodriguez"
- **AND** "Omar Rodriguez" still holds only the RFC `ZEM180223H23`

#### Scenario: Facturas run afterwards
- **WHEN** the owner runs Importar facturas after assigning that Ingreso
- **THEN** the Ingreso keeps its Proyecto and Contacto, and no second Ingreso is created for its UUID

### Requirement: Asignar proyecto answers the pending link suggestion
When a moved Ingreso has a pending *vincular* Sugerencia de importación, Asignar proyecto SHALL answer it in the same step: *aceptada* when the chosen Proyecto is the one it proposed, *corregida* when it is another, and *rechazada* when Sin proyecto is chosen. Logs SHALL no longer show it as pending.

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
