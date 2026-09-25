## ADDED Requirements

### Requirement: Reimportar desde cero replaces every imported record
Configuración → Logs SHALL offer **Reimportar desde cero** beside Re-escanear carpetas. It SHALL first ask for confirmation, saying that it removes every Contacto, Cotización, Proyecto, Ingreso and Costo the Importación made, and that answers to Sugerencias de importación and edits to imported records are lost. Nothing SHALL change until the user confirms. Once confirmed, it SHALL take a Respaldo *antes de reimportar*. It SHALL then remove the imported records: every Contacto, Cotización and Proyecto the Importación created, every recorded location of those Proyectos, every Ingreso and Costo that carries a CFDI UUID, and every Sugerencia de importación, answered or pending. Finally it SHALL run the folder scan and then the Facturas run, and Logs SHALL show both runs' results as the last runs. If the Respaldo fails, nothing SHALL be removed. If the removal fails, nothing SHALL be removed. It SHALL leave AI token usage, Tareas, the Catálogo and settings unchanged. Files on disk SHALL NOT change. Afterwards every derived fact SHALL reflect only the reimported records: Estado de Contacto, Cobros, Finanzas totals and Sin ingresos registrados.

#### Scenario: Map fix reaches an imported quote
- **WHEN** the quote "Frida Comunicacion" was imported under a Contacto "Frida Comunicacion", the user adds the row `Frida Comunicacion,Frida,,` and runs Reimportar desde cero
- **THEN** the Cotización belongs to the Contacto "Frida", and no Contacto "Frida Comunicacion" exists

#### Scenario: Confirmation declined
- **WHEN** the user clicks Reimportar desde cero and does not confirm
- **THEN** no Respaldo is taken and every record is unchanged

#### Scenario: Respaldo before removing
- **WHEN** the user confirms Reimportar desde cero
- **THEN** a Respaldo *antes de reimportar* exists holding the records as they were

#### Scenario: Answered Sugerencias are asked again
- **WHEN** the user had accepted a Sugerencia *vincular* linking Cotización 401 to the Proyecto "Citli Tours", then runs Reimportar desde cero
- **THEN** that Sugerencia is gone, and Logs shows a new pending Sugerencia *vincular* for the same link

#### Scenario: USD Ingreso reimported
- **WHEN** an Ingreso imported from a USD invoice exists and the user runs Reimportar desde cero
- **THEN** the Facturas run imports that invoice again with its USD original amount and its peso amounts

#### Scenario: Factura cancelada stays out
- **WHEN** an Ingreso was *cancelado* because its invoice sits in a `Canceladas` folder, and the user runs Reimportar desde cero
- **THEN** no Ingreso exists for that invoice afterwards, cancelled or otherwise

#### Scenario: Imported history keeps its exemption
- **WHEN** a Proyecto in `Archivo/Proyectos/` was imported as completed without being fully paid, and the user runs Reimportar desde cero
- **THEN** it is imported again as completed, and its Cotización creates no Ingresos or Costos (ADR-0002)

#### Scenario: Derived facts follow the new records
- **WHEN** a Contacto showed as a client only through a Cotización that the map now gives to another Contacto, and the user runs Reimportar desde cero
- **THEN** the other Contacto's Estado de Contacto counts that Cotización, and no Contacto keeps a stale Estado from the removed records

#### Scenario: Other data untouched
- **WHEN** the database holds AI token usage and a Tarea, and the user runs Reimportar desde cero
- **THEN** both are unchanged afterwards

### Requirement: Reimportar desde cero is refused when it would lose data
Reimportar desde cero SHALL remove nothing, take no Respaldo, and show why, when any of these holds:
- a record exists that was made by hand: a Contacto, Cotización or Proyecto created in the app rather than by the Importación, an Ingreso or Costo with no CFDI UUID, or a recurring Ingreso or Costo definition
- the Mapa de nombres exists but cannot be read, or its header lacks `en disco` or `contacto`
- an external HDD is set up but not connected, since the Proyectos found only on it would not be imported again

The message SHALL name each kind of blocking record and how many of it exist. An imported record the user edited in the app SHALL NOT block the reimport; the confirmation's warning covers it.

#### Scenario: Hand-entered Ingreso
- **WHEN** the user entered an Ingreso sin factura in Finanzas, then clicks Reimportar desde cero
- **THEN** nothing is removed, and the message says 1 Ingreso was entered by hand

#### Scenario: Cotización made in the app
- **WHEN** a Cotización was created and sent from Cotizaciones
- **THEN** Reimportar desde cero is refused and names 1 Cotización made in the app

#### Scenario: Contacto created by hand
- **WHEN** the user created a Contacto "Nuevo Cliente" in Contactos
- **THEN** Reimportar desde cero is refused and names 1 Contacto made in the app

#### Scenario: Broken map
- **WHEN** the map's header reads `nombre,cliente` and the user confirms Reimportar desde cero
- **THEN** every record is unchanged, and the message names `Clientes/_nombres.csv` as it does for Re-escanear carpetas

#### Scenario: External HDD disconnected
- **WHEN** an external HDD is set up in Configuración but not mounted
- **THEN** Reimportar desde cero is refused and asks to connect the HDD, and every record is unchanged

#### Scenario: Edited imported Contacto
- **WHEN** the user renamed an imported Contacto and made nothing by hand
- **THEN** Reimportar desde cero proceeds, and the Contacto comes back under the name the map or disk gives it

### Requirement: Vista previa desde cero
Vista previa SHALL offer a *desde cero* mode beside the current one. It SHALL run the folder scan on a throwaway copy of the database from which the records Reimportar desde cero would remove have been removed. It SHALL show what Vista previa shows (the counts, the new Contactos, Proyectos and RFCs with their source, the map's problems, and the Sugerencias it would leave), now describing the whole folder scan a reimport would make. Like Vista previa, it SHALL NOT change the database, SHALL leave the Sugerencias already waiting unchanged, and SHALL NOT replace the last scan's result shown in Logs. It SHALL run even when Reimportar desde cero would be refused, and SHALL show the reasons for the refusal beside the preview.

#### Scenario: Refining the map after the real scan
- **WHEN** everything on disk is already imported, the user adds a row mapping "Appleseed Plataforma" to "Appleseed" and runs Vista previa desde cero
- **THEN** the preview lists no Contacto "Appleseed Plataforma" and counts the Cotización under "Appleseed"
- **AND** the database still has the Contacto "Appleseed Plataforma" afterwards

#### Scenario: Plain Vista previa after the real scan
- **WHEN** everything on disk is already imported and the user runs Vista previa in its current mode
- **THEN** the preview reports nothing new to create, as before

#### Scenario: Preview while the reimport would be refused
- **WHEN** a hand-entered Ingreso exists and the user runs Vista previa desde cero
- **THEN** the preview shows what the scan would create, and notes that Reimportar desde cero is refused because of 1 Ingreso entered by hand

### Requirement: Aceptar todas for pending vincular Sugerencias
Configuración → Logs SHALL offer **Aceptar todas** above the Sugerencias de importación whenever at least one pending Sugerencia is *vincular*. It SHALL accept every pending *vincular* Sugerencia at once, exactly as accepting each one would. It SHALL leave *fusionar* and *ubicación* Sugerencias pending. It SHALL accept all of them or, if any fails, none.

#### Scenario: Mixed pending Sugerencias
- **WHEN** 40 *vincular*, 2 *fusionar* and 5 *ubicación* Sugerencias are pending and the user clicks Aceptar todas
- **THEN** the 40 *vincular* are accepted and their links kept, and the 2 *fusionar* and 5 *ubicación* still wait in Logs

#### Scenario: No vincular pending
- **WHEN** only *fusionar* and *ubicación* Sugerencias are pending
- **THEN** Logs does not offer Aceptar todas

## MODIFIED Requirements

### Requirement: The map applies when a file is first imported
A map row SHALL decide the Contacto and Proyecto only for a Cotización or folder the scan has not imported before. Re-scanning after the map is edited SHALL NOT move an already-imported Cotización or Proyecto to another Contacto, rename it, or remove a Contacto. The one exception is an RFC, which a later scan adds to a Contacto that has none. A map edit SHALL reach records already imported only through Reimportar desde cero, which imports every file again as if for the first time.

#### Scenario: Map edited after the real scan
- **WHEN** the quote "Frida Comunicacion" was imported under a Contacto "Frida Comunicacion" and the user then adds the row `Frida Comunicacion,Frida,,` and re-scans
- **THEN** the Cotización stays with the Contacto "Frida Comunicacion"
- **AND** the Log counts it as already imported

#### Scenario: Map edited, then reimported
- **WHEN** the same row is added and the user runs Reimportar desde cero instead of re-scanning
- **THEN** the Cotización belongs to the Contacto "Frida"
