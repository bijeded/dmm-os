## ADDED Requirements

### Requirement: A Proyectos folder matches an existing Contacto of its name, never creating one
When no Mapa de nombres row matches a `Proyectos/` folder (in `Proyectos/`, `Archivo/Proyectos/` or on the external HDD), the scan SHALL attribute it to the Contacto whose name matches the folder's, matching names the same way the scan already does (regardless of case, accents and punctuation). A folder whose name the map spells as a row's `contacto` SHALL resolve to that Contacto as the map spells it, as before this change. Otherwise a `Proyectos/` folder SHALL NOT create a Contacto, and SHALL NOT propose a *fusionar* Sugerencia for a name that is merely close to a Contacto's. A matching row SHALL always take precedence. A legacy Cotización's filename and a `Clientes/` folder SHALL still create their Contacto when none matches. These rules SHALL apply only when a folder is first imported: a re-scan SHALL NOT move a Proyecto already imported to another Contacto.

#### Scenario: Folder named after a client
- **WHEN** no row matches, `Clientes/AVC Noticias` exists, and the scan finds `Proyectos/AVC Noticias`
- **THEN** the Proyecto "AVC Noticias" belongs to the Contacto "AVC Noticias", and there is one Contacto of that name

#### Scenario: Existing Contacto wins over a Cotización naming the folder
- **WHEN** no row matches, the Contacto "AVC Noticias" exists, and a Cotización of "Sublime" names the project “AVC Noticias”
- **THEN** the folder `Proyectos/AVC Noticias` becomes a Proyecto of "AVC Noticias", not of "Sublime"

#### Scenario: Close name creates no Contacto
- **WHEN** no row matches, the Contacto "Avansa" exists, and the scan finds `Proyectos/Avanza`
- **THEN** no Contacto "Avanza" is created and no *fusionar* Sugerencia is proposed

#### Scenario: Quote-only lead stays a Contacto
- **WHEN** the scan finds `DMM - 280 - Alisha.pdf` and no folder of that name
- **THEN** the Contacto "Alisha" exists with that Cotización

#### Scenario: Re-scan keeps what was imported
- **WHEN** a folder was imported under a Contacto of its own name before this change, and the user re-scans
- **THEN** the Proyecto stays with that Contacto, and the Log counts it as already imported

### Requirement: A Proyectos folder is attributed through the Cotizaciones that name its project
When no row matches a `Proyectos/` folder and no Contacto has its name, the scan SHALL look for the Cotizaciones that deliver a Proyecto of the folder's name: their stored name, which is a matching row's `proyecto`, the project the PDF names in curly quotes, or the Proyecto after a `Cliente - Proyecto` split. When all of them belong to one Contacto, the folder SHALL become a Proyecto of that Contacto. It SHALL link to that Contacto's oldest Cotización of that name not yet linked to a Proyecto, through a Sugerencia de importación *vincular*, as a folder of the Cotización's name already does. Its Cliente final SHALL be the one the map gives that Cotización, or else the folder's name. The folder's estado SHALL be what its location says: *en curso* in `Proyectos/`, *completado* in `Archivo/Proyectos/` or on the external HDD. Imported history SHALL stay exempt from the lifecycle guards (ADR-0002): the Cotización accepted by the link SHALL create no Ingresos or Costos. Derived facts SHALL follow: the Contacto's Estado de Contacto counts the Proyecto.

#### Scenario: Agency project folder
- **WHEN** the map has the row `Sublime,Sublime Inspiración,,` and no row for "3 Moon Wishes", Cotizaciones 308 (`eCommerce “3 Moon Wishes”`) and 320 (`Landing page “3 Moon Wishes”`) are filed under "Sublime", and the scan finds `Proyectos/3 Moon Wishes`
- **THEN** the Proyecto "3 Moon Wishes" belongs to the Contacto "Sublime Inspiración", with Cliente final "3 Moon Wishes", and is *en curso*
- **AND** Logs shows a Sugerencia *vincular* linking Cotización 308 to it, and Cotización 320 stays *enviada*
- **AND** no Contacto named "3 Moon Wishes" exists

#### Scenario: Map gives the Cliente final
- **WHEN** a row `Lukka - Ruba,Lukka,Ruba,Ruba Café` matches a legacy Cotización, and the scan finds `Archivo/Proyectos/Ruba`
- **THEN** the Proyecto "Ruba" belongs to "Lukka", with Cliente final "Ruba Café", and is *completado*

#### Scenario: Same folder in two roots
- **WHEN** `Proyectos/3 Moon Wishes` was attributed to "Sublime Inspiración" and the external HDD also holds `Proyectos/3 Moon Wishes`
- **THEN** there is one Proyecto "3 Moon Wishes" with two locations

#### Scenario: No money on the link
- **WHEN** Cotización 308 is set *aceptada* by the link to "3 Moon Wishes"
- **THEN** no Ingreso and no Costo is created for it (ADR-0002)

#### Scenario: Estado de Contacto
- **WHEN** "Sublime Inspiración" had only *enviada* Cotizaciones before, and the scan attributes `Proyectos/3 Moon Wishes` to it
- **THEN** its Estado de Contacto reflects an *en curso* Proyecto

### Requirement: A Proyectos folder nothing attributes is a Proyecto sin Contacto
When no row matches a `Proyectos/` folder, no Contacto has its name, and no Cotización names its project, or Cotizaciones of more than one Contacto do, the scan SHALL import it as a client Proyecto with no Contacto, named after the folder, with its location recorded and its estado given by its location. No Contacto SHALL be created for it, and no Sugerencia *vincular* SHALL be proposed. The same folder name found in several roots SHALL be one Proyecto sin Contacto with several locations. A Proyecto sin Contacto SHALL keep its Contacto empty on a re-scan, until the user assigns one or runs Reimportar desde cero with a map row for it.

#### Scenario: Folder nothing names
- **WHEN** no row, Contacto or Cotización names `Proyectos/Activista`
- **THEN** a Proyecto "Activista" with no Contacto is *en curso*, located at `Proyectos/Activista`
- **AND** no Contacto named "Activista" exists

#### Scenario: Several Contactos name the project
- **WHEN** a Cotización of "Lukka" and a Cotización of "Sublime" both name the project “Tingo”, and the scan finds `Proyectos/Tingo`
- **THEN** "Tingo" is a Proyecto with no Contacto, and neither Cotización is linked to it

#### Scenario: Archived folder
- **WHEN** nothing names `Archivo/Proyectos/Art Insights`
- **THEN** "Art Insights" is a *completado* Proyecto with no Contacto

#### Scenario: Assigned by hand, then re-scanned
- **WHEN** the user assigns the Contacto "Frida" to the Proyecto sin Contacto "Activista" and re-scans
- **THEN** "Activista" stays with "Frida"

### Requirement: Logs and Vista previa list the Proyectos sin Contacto
Logs, Vista previa and Vista previa desde cero SHALL list under **Proyectos sin Contacto** each Proyecto sin Contacto the scan created, with its folder's location and, when Cotizaciones of several Contactos name it, those Contactos. The Proyectos nuevos list SHALL show such a Proyecto as *sin Contacto*.

#### Scenario: Preview before the real run
- **WHEN** the user runs Vista previa desde cero and nothing names `Proyectos/Activista`
- **THEN** the preview lists "Activista" under Proyectos sin Contacto with `Proyectos/Activista`

#### Scenario: Ambiguous project named
- **WHEN** Cotizaciones of "Lukka" and "Sublime" both name “Tingo”
- **THEN** the list shows "Tingo" with "Lukka" and "Sublime"

#### Scenario: Refining the map
- **WHEN** the preview lists "Tingo", and the user adds the row `Tingo,Lukka,,Tingo` and runs Vista previa desde cero again
- **THEN** the preview no longer lists "Tingo" under Proyectos sin Contacto, and lists it among the Proyectos nuevos of "Lukka"

### Requirement: A Proyecto takes its categoría and fecha de inicio from its linked Cotización
When the folder scan links a Cotización to a Proyecto through a Sugerencia *vincular*, the Proyecto SHALL take the Cotización's categoría if its own is `other`, and the Cotización's fecha as its fecha de inicio if it has none. A Proyecto created for an accepted Cotización with no folder SHALL take the Cotización's fecha as its fecha de inicio, as well as its categoría. The scan SHALL set no fecha de fin or fecha de entrega on an imported Proyecto. Rejecting the Sugerencia *vincular* SHALL restore the categoría and fecha de inicio the link wrote, unless the user edited them since. The CFDI → Proyecto guess of the Facturas run SHALL use the fecha de inicio: a Proyecto whose fecha de inicio is after an invoice's date is not guessed for it.

#### Scenario: Folder linked to a Cotización
- **WHEN** Cotización 308 of "Sublime Inspiración", dated 2021-03-10 with categoría `ecommerce`, is linked to the Proyecto "3 Moon Wishes"
- **THEN** the Proyecto's categoría is `ecommerce`, its fecha de inicio is 2021-03-10, and it has no fecha de fin or fecha de entrega

#### Scenario: Link rejected
- **WHEN** the user rejects the Sugerencia *vincular* linking Cotización 308 to "3 Moon Wishes"
- **THEN** the Proyecto's categoría is `other` again and it has no fecha de inicio

#### Scenario: Edited before rejecting
- **WHEN** the user changed the Proyecto's fecha de inicio to 2021-04-01 and then rejects the link
- **THEN** its fecha de inicio stays 2021-04-01, and its categoría goes back to `other`

#### Scenario: Accepted quote with no folder
- **WHEN** Cotización 250, dated 2019-06-03 with categoría `website`, is accepted and no folder delivers it
- **THEN** the completed Proyecto created for it has fecha de inicio 2019-06-03 and categoría `website`

#### Scenario: Invoice guessed by fecha de inicio
- **WHEN** "Sublime Inspiración" has the *en curso* Proyectos "3 Moon Wishes" (fecha de inicio 2021-03-10) and "Citli Tours" (fecha de inicio 2023-05-02), and the Facturas run imports an invoice to it dated 2022-02-01 whose total matches neither Cotización
- **THEN** Logs shows a Sugerencia *vincular* guessing "3 Moon Wishes" for that Ingreso, by fecha

### Requirement: A Proyecto sin Contacto shows as such in Proyectos
The Proyectos list and the Ficha of a client Proyecto with no Contacto SHALL show *Sin Contacto* where the Contacto goes, not "Personal" and not an empty cell. The list's Contacto filter SHALL offer *Sin Contacto*, showing only those Proyectos. Saving such a Proyecto from its Ficha SHALL require choosing a Contacto, which assigns it. Inicio and Finanzas SHALL list it like any other Proyecto.

#### Scenario: Listed without Contacto
- **WHEN** the Proyecto "Activista" has no Contacto
- **THEN** the Proyectos list shows *Sin Contacto* in its Contacto column, and its Ficha shows *Sin Contacto*

#### Scenario: Filtering
- **WHEN** the user picks *Sin Contacto* in the Contacto filter
- **THEN** the list shows only the client Proyectos with no Contacto, and no personal Proyecto

#### Scenario: Assigning a Contacto
- **WHEN** the user edits "Activista" from its Ficha, chooses the Contacto "Frida" and saves
- **THEN** "Activista" belongs to "Frida" and no longer appears under *Sin Contacto*

#### Scenario: Saving without choosing
- **WHEN** the user edits "Activista" and saves without choosing a Contacto
- **THEN** the form says a Contacto is required, and nothing changes

## MODIFIED Requirements

### Requirement: A vincular Sugerencia can be answered with another Proyecto
In Configuración → Logs, each pending *vincular* Sugerencia de importación for a Cotización or an Ingreso SHALL show a selector of the Proyectos it can be linked to, preset to the guessed Proyecto, beside Aceptar and Rechazar. The selector SHALL offer the guessed Proyecto and the other Proyectos of the record's Contacto. For a Cotización, it SHALL leave out every Proyecto that already has a Cotización, except the guessed one. Aceptar SHALL answer with the Proyecto selected: the guessed one accepts the guess as before; another one corrects it.

Correcting a Cotización's Sugerencia SHALL first undo everything the guess wrote, exactly as Rechazar does: the Cotización's previous status, the guessed Proyecto's link, its notes unless edited since, a Cliente final the link brought unless edited since, and the categoría and fecha de inicio the link wrote unless edited since. It SHALL then set the Cotización *aceptada* and link it to the chosen Proyecto, leaving that Proyecto's notes and Cliente final as they are. The chosen Proyecto SHALL take the Cotización's categoría if its own is `other`, and the Cotización's fecha as its fecha de inicio if it has none. Imported history SHALL stay exempt from the lifecycle guards (ADR-0002): the Cotización SHALL create no Ingresos or Costos. Correcting an Ingreso's Sugerencia SHALL link that Ingreso to the chosen Proyecto and change none of its amounts.

An answer SHALL be final. A corrected Sugerencia SHALL leave Logs and SHALL NOT be asked again by a later folder scan or Facturas run. A choice the Sugerencia no longer offers when it is sent SHALL be refused with a message, changing nothing and leaving the Sugerencia pending. Aceptar todas SHALL accept every pending *vincular* guess as it is, ignoring any Proyecto selected but not sent with Aceptar. Derived facts SHALL update after the answer: Estado de Contacto, Cobros and Sin ingresos registrados.

#### Scenario: Cotización linked to the right folder
- **WHEN** the folder scan guessed that Cotización 401 of "Sublime" delivers the Proyecto "Citli Tours", and the user selects the Proyecto "Citli Tours 2" of "Sublime" and clicks Aceptar
- **THEN** Cotización 401 is *aceptada* and linked to "Citli Tours 2"
- **AND** "Citli Tours" has no Cotización, and its notes, Cliente final, categoría and fecha de inicio are back to what they were before the guess
- **AND** the Sugerencia no longer shows in Logs

#### Scenario: Chosen Proyecto takes categoría and fecha de inicio
- **WHEN** Cotización 401, dated 2023-05-02 with categoría `website`, is linked by correction to "Citli Tours 2", whose categoría is `other` and fecha de inicio is 2023-06-01
- **THEN** "Citli Tours 2" has categoría `website` and keeps fecha de inicio 2023-06-01

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
