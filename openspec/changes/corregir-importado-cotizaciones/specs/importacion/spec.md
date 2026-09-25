## ADDED Requirements

### Requirement: Cotizaciones imported before the imported mark count as imported
Upgrading the app SHALL mark as imported every Cotización in any estado but *borrador* that has no items, including those whose stored empty item list was written in the malformed form an earlier version used. A Cotización made in the app SHALL stay made by hand: it cannot be sent without at least one item, and a *borrador* is never marked. Afterwards every Cotización with no items SHALL store an empty item list in the same form a Cotización created later stores it. The upgrade SHALL run after its Respaldo, like any other. Contactos and Proyectos SHALL be unchanged by it.

#### Scenario: Legacy Cotizaciones stop blocking the reimport
- **WHEN** the database holds 401 legacy Cotizaciones, *aceptada* or *expirada*, imported before the imported mark existed and stored with the malformed empty item list, and the app is upgraded
- **THEN** Reimportar desde cero no longer names any Cotización made in the app, and Vista previa desde cero counts those Cotizaciones as removed and imported again, not as duplicates

#### Scenario: A Cotización made in the app still blocks
- **WHEN** a Cotización with one item was created and sent from Cotizaciones before the upgrade
- **THEN** after the upgrade Reimportar desde cero is refused and names 1 Cotización made in the app

#### Scenario: A borrador stays made by hand
- **WHEN** a *borrador* with no items exists before the upgrade
- **THEN** after the upgrade it is not marked imported

#### Scenario: A USD legacy Cotización is marked too
- **WHEN** a legacy Cotización in USD with no items exists before the upgrade
- **THEN** after the upgrade it is marked imported, and its currency, rate and amounts are unchanged

#### Scenario: A new Cotización created without items
- **WHEN** a Cotización is created after the upgrade without specifying items
- **THEN** its stored item list is the empty list, and it reads back as having no items
