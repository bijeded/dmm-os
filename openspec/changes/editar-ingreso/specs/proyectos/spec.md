## ADDED Requirements

### Requirement: The fecha de fin of a closed Proyecto can be changed
Editar on a *completado* Proyecto SHALL show its **Fecha de fin** and save a new one. A *cancelado* Proyecto, which Editar otherwise refuses, SHALL offer changing only its fecha de fin from its Ficha. The fecha de fin SHALL NOT be later than today nor earlier than the Proyecto's fecha de inicio when it has one, and SHALL NOT be cleared once set. A Proyecto *en curso* or *pausado* SHALL show no fecha de fin to edit. Changing it SHALL NOT change the Proyecto's estado or any of its Ingresos or Costos. Completar, Completar con cobro and Cancelar SHALL still date it today.

#### Scenario: Completed years ago, closed today
- **WHEN** "La Hora Zero" (fecha de inicio 2019-01-07) was completed on 2026-09-29, and the owner sets its fecha de fin to 2019-03-15 in Editar
- **THEN** it is *completado* with fecha de fin 2019-03-15, and its Ficha shows that date

#### Scenario: Before the start refused
- **WHEN** the owner sets the fecha de fin of a Proyecto started 2019-01-07 to 2018-12-31
- **THEN** saving is refused and the Proyecto keeps its fecha de fin

#### Scenario: Cancelled Proyecto
- **WHEN** a Proyecto was cancelled today but was abandoned in 2021, and the owner changes its fecha de fin to 2021-06-30 from its Ficha
- **THEN** it is *cancelado* with fecha de fin 2021-06-30, and none of its other fields can be edited

#### Scenario: Imported Proyecto with no fecha de fin
- **WHEN** a Proyecto the Importación created as *completado* has no fecha de fin
- **THEN** Editar shows the fecha de fin empty and saving one sets it

#### Scenario: Proyecto en curso
- **WHEN** the owner opens Editar on a Proyecto *en curso*
- **THEN** it shows no fecha de fin

### Requirement: Abierto en el mes follows the fecha de fin
Whether a Proyecto is Abierto en el mes, and so the Asignación de costo of each month, SHALL be read from its fecha de fin as it now is; nothing SHALL be stored.

#### Scenario: Proyecto AI no longer open in later months
- **WHEN** a Proyecto AI started 2019-01-07 has fecha de fin 2026-09-29, and the owner changes it to 2019-03-15
- **THEN** it is not Abierto en el mes for April 2019 or any later month, and takes no share of those months' Suscripciones
