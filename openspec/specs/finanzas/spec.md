# finanzas Specification

## Purpose

Which Ingresos Finanzas and every money figure count as income, and how Ingresos that never count (cancelado, Incobrable) show and are undone in Finanzas.

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
