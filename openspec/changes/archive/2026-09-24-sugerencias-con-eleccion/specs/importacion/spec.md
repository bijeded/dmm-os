## ADDED Requirements

### Requirement: A vincular Sugerencia can be answered with another Proyecto
In Configuración → Logs, each pending *vincular* Sugerencia de importación for a Cotización or an Ingreso SHALL show a selector of the Proyectos it can be linked to, preset to the guessed Proyecto, beside Aceptar and Rechazar. The selector SHALL offer the guessed Proyecto and the other Proyectos of the record's Contacto. For a Cotización, it SHALL leave out every Proyecto that already has a Cotización, except the guessed one. Aceptar SHALL answer with the Proyecto selected: the guessed one accepts the guess as before; another one corrects it.

Correcting a Cotización's Sugerencia SHALL first undo everything the guess wrote, exactly as Rechazar does: the Cotización's previous status, the guessed Proyecto's link, its notes unless edited since, and a Cliente final the link brought unless edited since. It SHALL then set the Cotización *aceptada* and link it to the chosen Proyecto, leaving that Proyecto's notes and Cliente final as they are. Imported history SHALL stay exempt from the lifecycle guards (ADR-0002): the Cotización SHALL create no Ingresos or Costos. Correcting an Ingreso's Sugerencia SHALL link that Ingreso to the chosen Proyecto and change none of its amounts.

An answer SHALL be final. A corrected Sugerencia SHALL leave Logs and SHALL NOT be asked again by a later folder scan or Facturas run. A choice the Sugerencia no longer offers when it is sent SHALL be refused with a message, changing nothing and leaving the Sugerencia pending. Aceptar todas SHALL accept every pending *vincular* guess as it is, ignoring any Proyecto selected but not sent with Aceptar. Derived facts SHALL update after the answer: Estado de Contacto, Cobros and Sin ingresos registrados.

#### Scenario: Cotización linked to the right folder
- **WHEN** the folder scan guessed that Cotización 401 of "Sublime" delivers the Proyecto "Citli Tours", and the user selects the Proyecto "Citli Tours 2" of "Sublime" and clicks Aceptar
- **THEN** Cotización 401 is *aceptada* and linked to "Citli Tours 2"
- **AND** "Citli Tours" has no Cotización, and its notes and Cliente final are back to what they were before the guess
- **AND** the Sugerencia no longer shows in Logs

#### Scenario: Proyectos already holding a Cotización are not offered
- **WHEN** a pending Sugerencia *vincular* guesses a Proyecto for Cotización 320, and the Contacto's Proyecto "3 Moon Wishes" is already linked to Cotización 308
- **THEN** the selector does not offer "3 Moon Wishes"
- **AND** once the user rejects the Sugerencia that linked Cotización 308 to "3 Moon Wishes", the selector for Cotización 320 offers it

#### Scenario: Only the record's Contacto's Proyectos are offered
- **WHEN** a pending Sugerencia *vincular* concerns an Ingreso of the Contacto "Frida"
- **THEN** its selector lists the guessed Proyecto and Frida's other Proyectos, and no Proyecto of another Contacto

#### Scenario: Ingreso in pesos linked to another Proyecto
- **WHEN** the Facturas run guessed that an MXN Ingreso of $11,600.00 belongs to the Proyecto "Web 2023", and the user selects "Web 2027" and clicks Aceptar
- **THEN** the Ingreso belongs to "Web 2027" and still totals $11,600.00
- **AND** "Web 2023" has no Ingreso from that invoice

#### Scenario: USD Ingreso linked to another Proyecto
- **WHEN** a pending Sugerencia *vincular* concerns an Ingreso from a USD invoice, and the user selects another Proyecto of the Contacto and clicks Aceptar
- **THEN** the Ingreso belongs to the chosen Proyecto with its USD original amount, its rate and its peso amounts unchanged

#### Scenario: Sin ingresos registrados clears
- **WHEN** a completed Proyecto shows Sin ingresos registrados, and the user answers the Sugerencia of a paid Ingreso that covers its quote total by choosing that Proyecto instead of the guessed one
- **THEN** that Proyecto no longer shows Sin ingresos registrados

#### Scenario: Cobros names the chosen Proyecto
- **WHEN** a pending Ingreso dated this month was guessed for "Web 2023", and the user answers its Sugerencia with "Web 2027"
- **THEN** Cobros shows that Ingreso under the Proyecto "Web 2027"

#### Scenario: Imported Cotización accepted by a correction creates no money
- **WHEN** the user links an imported Cotización to another Proyecto through its Sugerencia
- **THEN** no Ingreso and no Costo is created for it (ADR-0002)

#### Scenario: Cancelled Ingreso
- **WHEN** an Ingreso from a Factura cancelada still has a pending Sugerencia *vincular*, and the user answers it with another Proyecto
- **THEN** the Ingreso stays *cancelado* and belongs to the chosen Proyecto, and its money counts nowhere

#### Scenario: Asked once
- **WHEN** the user corrected a Sugerencia *vincular* and then runs Re-escanear carpetas and the Facturas run
- **THEN** no Sugerencia is asked again for that record, and its link stays the chosen one

#### Scenario: Choice no longer available
- **WHEN** the chosen Proyecto was linked to another Cotización after Logs was loaded, and the user clicks Aceptar with it selected
- **THEN** Logs shows why it was refused, nothing changes, and the Sugerencia is still pending

#### Scenario: Aceptar todas keeps the guesses
- **WHEN** the user selects another Proyecto on one *vincular* row without clicking its Aceptar, then clicks Aceptar todas
- **THEN** that Sugerencia is accepted with its guessed Proyecto, like every other pending *vincular*

### Requirement: A fusionar Sugerencia can merge into another Contacto
In Configuración → Logs, each pending *fusionar* Sugerencia de importación SHALL show a selector of the Contactos the duplicate can be merged into, preset to the guessed Contacto, beside Aceptar and Rechazar. It SHALL offer every Contacto other than the duplicate itself. Aceptar SHALL answer with the Contacto selected: the guessed one merges as before; another one corrects the Sugerencia and merges into that Contacto instead. Rechazar SHALL keep the two separate, as before.

A merge into another Contacto SHALL work as a merge into the guessed one does. Everything the duplicate had moves to the chosen Contacto: its Cotizaciones, Proyectos, Ingresos and recurring definitions, and so every Costo reached through them. The better-written spelling of the two SHALL stay as the Nombre canónico, and details only the duplicate had (RFC, empresa, email, teléfono, dirección) SHALL be kept. The duplicate SHALL be gone. The guessed Contacto SHALL be unchanged. Other pending Sugerencias that named the duplicate as the Contacto to merge into SHALL name the chosen Contacto instead.

The answer SHALL be final, like any Sugerencia's. A choice the Sugerencia no longer offers when it is sent SHALL be refused with a message, changing nothing. Estado de Contacto SHALL update for the chosen Contacto after the merge.

#### Scenario: Merge into a Contacto other than the guess
- **WHEN** the folder scan created "Frida Comunicacion" and guessed it duplicates "Frida Kahlo", and the user selects "Frida" and clicks Aceptar
- **THEN** "Frida Comunicacion" no longer exists, and its Cotizaciones and Proyectos belong to "Frida"
- **AND** "Frida Kahlo" is unchanged
- **AND** the Sugerencia no longer shows in Logs

#### Scenario: Every other Contacto is offered
- **WHEN** a pending Sugerencia *fusionar* concerns the Contacto "Sonrieme"
- **THEN** its selector offers every Contacto except "Sonrieme", with the guessed one selected

#### Scenario: Estado de Contacto follows the merge
- **WHEN** "Frida" is a cold lead, and the user merges a duplicate that has an accepted Cotización into "Frida"
- **THEN** "Frida" is no longer a cold lead

#### Scenario: Chosen Contacto no longer exists
- **WHEN** the chosen Contacto was merged away by another answer after Logs was loaded, and the user clicks Aceptar with it selected
- **THEN** Logs shows why it was refused, nothing changes, and the Sugerencia is still pending
