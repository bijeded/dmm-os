# importacion Specification

## Purpose

How the folder scan decides which Contacto, Proyecto and RFC each name on disk means, through a user-edited Mapa de nombres, and how the user previews a scan before it writes anything.

## Requirements

### Requirement: The folder scan reads a Mapa de nombres
The folder scan SHALL read `Clientes/_nombres.csv` under the `DMM OS` root as the Mapa de nombres before it imports anything. The file's first row SHALL be a header naming the columns `en disco`, `contacto`, `proyecto`, `cliente final` and `rfc`. Header names SHALL match regardless of case and accents, and columns SHALL be accepted in any order. Other columns (e.g. `nota`) SHALL be ignored. Fields SHALL be separated by commas or by semicolons, whichever the header uses, and a field SHALL be able to hold the separator when it is quoted. A row with fewer fields than the header SHALL read the missing ones as empty. `contacto` SHALL be required on every row. `en disco` SHALL be required unless the row gives `rfc`. `proyecto`, `cliente final` and `rfc` MAY be empty. A name in `en disco` SHALL match a name on disk regardless of case, accents and punctuation, the same way the scan already matches Contacto names. The map file SHALL NOT itself be imported as a Contacto.

#### Scenario: No map
- **WHEN** `Clientes/_nombres.csv` does not exist and the user runs Re-escanear carpetas
- **THEN** the scan imports exactly as it does today, apart from the `Cliente - Proyecto` split
- **AND** the Log says no Mapa de nombres was found

#### Scenario: Map exported from Numbers with semicolons
- **WHEN** the map's header is `en disco;contacto;proyecto;cliente final` and a row reads `Frida Comunicacion;Frida;;`
- **THEN** the scan reads that row as mapping "Frida Comunicacion" to the Contacto "Frida" with no Proyecto or Cliente final

#### Scenario: Notes column
- **WHEN** the map has an extra `nota` column
- **THEN** the scan ignores it and reads the other columns as usual

#### Scenario: Unaccented key
- **WHEN** a row's `en disco` is `Sonrieme` and the folder on disk is `Proyectos/Sonríeme`
- **THEN** that row applies to the folder

### Requirement: A mapped name imports under the mapped Contacto
When a legacy Cotización's name, a `Clientes/` folder or a `Proyectos/` folder (in `Proyectos/`, `Archivo/Proyectos/` or on the external HDD) matches a row's `en disco`, the scan SHALL attribute it to the Contacto named in `contacto`. The mapped Contacto SHALL be matched to an existing Contacto the same way names are matched today, and created only when none matches. The map's spelling SHALL become that Contacto's Nombre canónico. No Contacto SHALL be created under the name found on disk.

#### Scenario: Quote named after a project
- **WHEN** the map has the row `Appleseed Plataforma,Appleseed,Plataforma,` and the scan finds `Cotizaciones/2023/DMM - 312 - Appleseed Plataforma.pdf`
- **THEN** Cotización 312 belongs to the Contacto "Appleseed"
- **AND** no Contacto named "Appleseed Plataforma" exists

#### Scenario: Project folder with no Clientes folder
- **WHEN** the map has the row `Zamora USA,Zamora Live,,` and the scan finds both the quote `DMM - 290 - Zamora USA.pdf` and the folder `Proyectos/Zamora Live`
- **THEN** Cotización 290 and the Proyecto "Zamora Live" both belong to the one Contacto "Zamora Live"

#### Scenario: Map spelling wins
- **WHEN** a row maps `Audio Clinic` to `Audioclinic` and a `Clientes/Audioclinic` folder exists
- **THEN** there is one Contacto, named "Audioclinic", holding the quote named "Audio Clinic"

#### Scenario: Cold lead stays a cold lead
- **WHEN** a `Clientes/` folder names a Contacto that no Cotización is mapped or named to
- **THEN** that Contacto is imported with no Cotización, and its Estado de Contacto shows it as a cold lead
- **AND** the Estado updates once a later scan imports a Cotización for it

### Requirement: A mapped Proyecto name and Cliente final
When a row gives `proyecto`, a matching legacy Cotización SHALL deliver the Proyecto of that name. That name, not the Cotización's full name, SHALL decide which folder the Cotización is linked to by a Sugerencia de importación *vincular*, and what the Proyecto is called when the Cotización is accepted but no folder is found. A matching `Proyectos/` folder SHALL import as a Proyecto called `proyecto`, or after the folder when `proyecto` is empty. When a row gives `cliente final`, the Proyecto it produces SHALL carry that Cliente final. `proyecto` and `cliente final` SHALL have no effect on a `Clientes/` folder. Imported history SHALL stay exempt from the lifecycle guards (ADR-0002): a Cotización accepted by such a link creates no Ingresos or Costos.

#### Scenario: Agency quote linked to its end client's folder
- **WHEN** the map has the rows `Sublime - Citli Tours,Sublime,Citli Tours,Citli Tours` and `Citli Tours,Sublime,,Citli Tours`, and the scan finds `DMM - 401 - Sublime - Citli Tours.pdf` and `Proyectos/Citli Tours`
- **THEN** there is one Proyecto "Citli Tours" of the Contacto "Sublime", with Cliente final "Citli Tours"
- **AND** Logs shows a Sugerencia de importación *vincular* linking Cotización 401 to it
- **AND** no Contacto named "Citli Tours" exists

#### Scenario: Accepted mapped quote with no folder
- **WHEN** a Cotización mapped with `proyecto` "Plataforma" ends up accepted and no folder delivers it
- **THEN** the completed Proyecto created for it is called "Plataforma", and the Sugerencia *ubicación* asks whether it is Archivado or No disponible

### Requirement: A map row can declare a subfolder a Proyecto
A row whose `en disco` is a path `<folder>/<subfolder>` SHALL declare that subfolder of a Proyectos folder a Proyecto of its own. It SHALL apply wherever `<folder>` sits: in `Proyectos/`, `Archivo/Proyectos/` or on the external HDD. The subfolder SHALL import as a Proyecto of the row's Contacto, named `proyecto` or after the subfolder, and its stored location SHALL be that subfolder's path relative to its root. Once any subfolder of a folder is declared, the folder itself SHALL NOT import as a Proyecto. Its subfolders that no row declares SHALL NOT be imported, and the Log SHALL list them.

#### Scenario: Two websites in one folder
- **WHEN** the map has the rows `DMM Studios/Web 2023,DMM Studios,,` and `DMM Studios/Web 2027,DMM Studios,,`, and `Proyectos/DMM Studios` holds `Multisite`, `Web 2023` and `Web 2027`
- **THEN** the Contacto "DMM Studios" has the Proyectos "Web 2023" and "Web 2027", located at `Proyectos/DMM Studios/Web 2023` and `Proyectos/DMM Studios/Web 2027`
- **AND** no Proyecto "DMM Studios" is created
- **AND** the Log lists `Proyectos/DMM Studios/Multisite` as a subfolder with no Proyecto

#### Scenario: Declared Proyecto moved to Archivo
- **WHEN** a declared Proyecto's folder later sits at `Archivo/Proyectos/DMM Studios/Web 2023`
- **THEN** the next scan records that location for the same Proyecto instead of creating another

### Requirement: A legacy quote named `Cliente - Proyecto` splits at the dash
When no row matches a legacy Cotización's name and the name contains ` - ` (a dash with a space on each side), the scan SHALL attribute the Cotización to the Contacto named before the first ` - `. That name SHALL itself be looked up in the map, as a name on disk. Unless the PDF names a project in curly quotes, the Cotización SHALL deliver the Proyecto named after that dash, which decides linking and naming as a mapped `proyecto` does. When the PDF does name one, the quoted name SHALL be the Proyecto instead, and the split SHALL still decide the Contacto. A name without ` - ` (e.g. `Anarco-guadalupano`) SHALL NOT split. A matching row SHALL always take precedence over the split.

#### Scenario: Agency quote without a map row
- **WHEN** no row matches and the scan finds `DMM - 377 - Korova - Blog.pdf`, whose PDF names no project in curly quotes
- **THEN** Cotización 377 belongs to the Contacto "Korova" and delivers the Proyecto "Blog"
- **AND** no Contacto named "Korova - Blog" exists

#### Scenario: The Contacto part is mapped too
- **WHEN** the map has the row `Sublime,Sublime Inspiración,,` and no row for `Sublime - Citli Tours`, and the scan finds `DMM - 401 - Sublime - Citli Tours.pdf`, whose PDF names no project in curly quotes
- **THEN** Cotización 401 belongs to the Contacto "Sublime Inspiración" and delivers the Proyecto "Citli Tours"

#### Scenario: Row overrides the split
- **WHEN** the row `Marketing Dojo - Cursos,Marketing Dojo,Cursos online,` exists and the scan finds `DMM - 350 - Marketing Dojo - Cursos.pdf`
- **THEN** Cotización 350 delivers the Proyecto "Cursos online"

#### Scenario: Quoted name overrides the split
- **WHEN** no row matches `DMM - 377 - Korova - Blog.pdf`, and its PDF reads `Sitio web “Blog Korova”:`
- **THEN** Cotización 377 belongs to the Contacto "Korova" and delivers the Proyecto "Blog Korova"

### Requirement: Map problems are reported, and an unreadable map stops the scan
The Log SHALL list every row that matched nothing on disk during the run. It SHALL also list, by line number, every row missing `contacto`, every row with neither `en disco` nor `rfc`, and every row whose `en disco` repeats an earlier row. The earlier row SHALL apply and the later one SHALL be ignored. A bad row SHALL NOT stop the scan. When `Clientes/_nombres.csv` exists but cannot be read, or its header lacks `en disco` or `contacto`, the scan SHALL import nothing and SHALL show an error naming the file.

#### Scenario: Typo in a key
- **WHEN** a row's `en disco` is `Appleseed Plataformma` and no name on disk matches it
- **THEN** the Log lists that row as unused, and the quote "Appleseed Plataforma" imports as if the row were absent

#### Scenario: Duplicate key
- **WHEN** rows 4 and 9 both have `en disco` `Frida` and no `rfc`
- **THEN** row 4 applies, and the Log reports row 9 as a duplicate

#### Scenario: Broken header
- **WHEN** the map's header reads `nombre,cliente`
- **THEN** Re-escanear carpetas imports nothing and shows that `Clientes/_nombres.csv` has no `en disco` or `contacto` column

### Requirement: A map row can give its Contacto an RFC
When a row gives `rfc`, the scan SHALL store that RFC, in uppercase with spaces removed, on the row's Contacto. A row with `en disco` SHALL apply its RFC when that name is found on disk. A row with no `en disco` SHALL apply its RFC to the Contacto named in `contacto`, created if no Contacto matches. The RFC SHALL be applied on every scan to a Contacto that has no RFC yet, including one imported by an earlier scan. The scan SHALL refuse the RFC, report the row in the Log by line number, and otherwise import as if the row gave no RFC, when:
- it is not 12 or 13 characters of RFC form
- it is a generic RFC, `XAXX010101000` or `XEXX010101000`
- another Contacto already holds it, or another row gives it to a different Contacto
- the Contacto already has a different RFC, or another row gives that Contacto a different one

A Facturas run after the folder scan SHALL link each issued CFDI whose receptor RFC a Contacto holds to that Contacto, as it already does for an RFC entered by hand.

#### Scenario: Invoices link after the scan
- **WHEN** the map has the row `,Sublime Inspiración,,,SIA161024H91`, the user runs Re-escanear carpetas, then Importar facturas, and `Facturas/Emitidas` holds three CFDIs to `SIA161024H91`
- **THEN** the Contacto "Sublime Inspiración" has RFC `SIA161024H91` and its three invoice Ingresos

#### Scenario: Contacto known only from its invoices
- **WHEN** the map has the row `,Umanut,,,UMA2311072G4` and nothing on disk names "Umanut"
- **THEN** the scan creates the Contacto "Umanut" with that RFC, and the Log does not list the row as unused

#### Scenario: RFC added after the real scan
- **WHEN** "Versa" was imported without an RFC, and the user adds `,Versa,,,VCO900213R94` and re-scans
- **THEN** "Versa" now has that RFC, and nothing else about it or its records changes

#### Scenario: Generic RFC
- **WHEN** a row gives `XEXX010101000` to "Frida Communication"
- **THEN** the Contacto gets no RFC and the Log reports that row as a generic RFC

#### Scenario: Second RFC for one Contacto
- **WHEN** rows give "Walden Dos" both `CWD720712MX0` and `WDO191108BY8`
- **THEN** the first row's RFC is stored and the Log reports the second row as a Contacto that already has an RFC

### Requirement: The map applies when a file is first imported
A map row SHALL decide the Contacto and Proyecto only for a Cotización or folder the scan has not imported before. Re-scanning after the map is edited SHALL NOT move an already-imported Cotización or Proyecto to another Contacto, rename it, or remove a Contacto. The one exception is an RFC, which a later scan adds to a Contacto that has none. A map edit SHALL reach records already imported only through Reimportar desde cero, which imports every file again as if for the first time.

#### Scenario: Map edited after the real scan
- **WHEN** the quote "Frida Comunicacion" was imported under a Contacto "Frida Comunicacion" and the user then adds the row `Frida Comunicacion,Frida,,` and re-scans
- **THEN** the Cotización stays with the Contacto "Frida Comunicacion"
- **AND** the Log counts it as already imported

#### Scenario: Map edited, then reimported
- **WHEN** the same row is added and the user runs Reimportar desde cero instead of re-scanning
- **THEN** the Cotización belongs to the Contacto "Frida"

### Requirement: Vista previa shows what a scan would add without writing
Configuración → Logs SHALL offer **Vista previa** beside Re-escanear carpetas. Vista previa SHALL read the same folders and Mapa de nombres a real scan would, including the external HDD when it is connected. It SHALL show what the scan would add to the current database: the counts a real scan reports, and the names of the Contactos and Proyectos it would create, and the RFCs it would assign. Each name SHALL be tagged with where it comes from: a `Clientes/` folder, a `Proyectos/` folder or a Cotización. It SHALL also show the map problems a real scan would report and the Sugerencias de importación it would leave. Vista previa SHALL NOT change the database. It SHALL create no Contacto, Cotización, Proyecto or Sugerencia de importación, and SHALL leave the Sugerencias already waiting unchanged. It SHALL NOT replace the last scan's result shown in Logs.

#### Scenario: Preview before the first scan
- **WHEN** the database is empty and the user clicks Vista previa
- **THEN** Logs shows how many Contactos, Proyectos and Cotizaciones a scan would create, and lists the new Contactos with their source
- **AND** the database still has no Contactos, Proyectos or Cotizaciones afterwards

#### Scenario: Refining the map
- **WHEN** the preview lists a Contacto "Appleseed Plataforma" from a Cotización, and the user adds a row mapping it to "Appleseed" and clicks Vista previa again
- **THEN** the new preview no longer lists "Appleseed Plataforma", and its Contacto count is one lower if "Appleseed" was already listed

#### Scenario: Preview after a scan
- **WHEN** everything on disk is already imported and the user clicks Vista previa
- **THEN** the preview reports nothing new to create

#### Scenario: Map that cannot be read
- **WHEN** the map's header is broken and the user clicks Vista previa
- **THEN** the preview shows the same error a real scan would and lists nothing to create

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

### Requirement: A legacy Cotización takes its fecha from its PDF
When the folder scan first imports a legacy Cotización (`Cotizaciones/<year>/DMM - <folio> - <name>.pdf`), it SHALL read the PDF's text. The Cotización's fecha SHALL be the first date the PDF gives:
- in Spanish, `D de <mes>, AAAA`, as on its `Ciudad de México, …` line. `setiembre` SHALL read as `septiembre`.
- in the quotes written in English, `<Month> D, AAAA`.

Month names SHALL match regardless of case and accents. The year SHALL always be that of the folder the file is filed under. A PDF that prints another year SHALL keep its day and month in the folder's year, since quotes are filed by the year they were made and a different year is the previous one typed out of habit. Such a Cotización SHALL be listed in Logs as one whose year was corrected. When the PDF has no such date, or cannot be read or has no text, the fecha SHALL fall back to `<year>-01-01`, as today.

#### Scenario: Dated quote
- **WHEN** `Cotizaciones/2021/DMM - 250 - Flor de Letras.pdf` reads `Ciudad de México, 29 de octubre, 2021.`
- **THEN** Cotización 250 is dated 2021-10-29

#### Scenario: Last year's date typed in January
- **WHEN** Cotización 346, filed under `Cotizaciones/2022/`, reads `Ciudad de México, 21 de enero, 2021.`
- **THEN** it is dated 2022-01-21, and Logs lists it as a Cotización whose year was corrected

#### Scenario: Quote written in English
- **WHEN** a quote filed under `Cotizaciones/2021/` reads `March 3, 2021`
- **THEN** it is dated 2021-03-03

#### Scenario: No date line
- **WHEN** a quote's PDF has no `Ciudad de México` date line
- **THEN** it is dated `<year>-01-01` of its folder, and Logs lists it as a Cotización whose PDF gave no fecha

### Requirement: A legacy Cotización's price lines become its items
Every price line of the PDF SHALL become one item of the Cotización. A price line is `Costo:`, `Costo especial:` or, in the quotes written in English, `Price:`, followed by an amount. The amount MAY come on the next line, or before the label. `Costo unitario:` and `Costo extra:` SHALL NOT be price lines. A price line directly followed by `Total: $…` (a price per cuartilla and its total) SHALL take the total as its amount.

The item SHALL be labeled with the service line the price belongs to. That is the first line after the previous price line (or after the letter's opening) that meets all of these:
- it is not a bullet
- it starts with a capital, or with `eBook` / `eCommerce`
- it has a colon after a short label (e.g. `Video “Curso” : Elaboración de video`)

A trailing colon and footnote marks SHALL be removed from the label. If there is no such line, the item SHALL be labeled with the PDF's `Asunto:`, or with the Cotización's name. Each item SHALL have quantity 1 and the line's amount as its price, in the Cotización's currency, before IVA.

An item SHALL be marked recurring when its price line says any of these, and one-off otherwise:
- `mensual` or `mensuales`
- `por mes`, `x mes` or `al mes`
- `anual`
- `por año`, `por un año`, `por 1 año` or `x 1 año`
- `trimestral`
- in English, `monthly`, `per month`, `yearly`, `annual` or `per year`

A quote with no price line SHALL import with no items, as today.

#### Scenario: One price
- **WHEN** a quote reads `Video “Curso” : Elaboración de video:` and later `Costo: $ 3,000.00`
- **THEN** the Cotización has one one-off item "Video “Curso” : Elaboración de video" priced $3,000.00

#### Scenario: One-off and recurring prices
- **WHEN** a quote has `Costo: $ 18,000.00` under `Sitio web “Hospital Jardín”:` and `Costo: $ 2,000.00 mensuales` under `Servicio webmaster:`
- **THEN** it has a one-off item of $18,000.00 and a recurring item of $2,000.00

#### Scenario: Special price
- **WHEN** a price line reads `Costo especial: $ 12,500.00`
- **THEN** it becomes an item priced $12,500.00, like any `Costo:` line

#### Scenario: Price per cuartilla with its total
- **WHEN** a quote reads `Costo: $ 65.00 por cuartilla` followed by `Total: $ 2,990.00`
- **THEN** its item is priced $2,990.00

#### Scenario: Amount printed before its label
- **WHEN** PDF.js reads a price as `$ 300.00 usd mensuales.Costo:`
- **THEN** it becomes a recurring item priced US$300.00

### Requirement: A legacy Cotización's Monto comes from its price lines
The Cotización's Monto SHALL be set from its one-off lines or, when it has none, from its recurring lines. With one such line, the Monto SHALL be that line. With several, it SHALL be their sum, or the lowest of them when the PDF lists numbered alternatives: a line, not a bullet, starting `Opción <n>` or `Paquete <n>` (regardless of case and accents). A `Paquete “Abogados”` with no number names the whole bundle, and its prices SHALL be added up. An accepted Cotización with several such lines SHALL also have a "¿Qué aceptó?" Sugerencia de importación, and its answer sets the Monto. Every quote price is before IVA: the Cotización SHALL have IVA 0, and a subtotal and total both equal to the Monto. A Cotización whose Monto comes from recurring lines SHALL have facturación *mensual*. Every other one SHALL have facturación *pago único*. A quote with no price line SHALL keep a Monto of 0, as today.

Imported history SHALL stay exempt from the lifecycle guards (ADR-0002). A Cotización imported or linked as *aceptada* SHALL create no Ingresos, no Costos, and no Ingreso or Costo definitions, whatever its Monto or facturación.

#### Scenario: Two lines on a quote never accepted
- **WHEN** a quote that no folder links to has one-off lines of $10,000.00 and $4,000.00, and does not say Opción or Paquete
- **THEN** its Monto is $14,000.00, with IVA $0.00 and total $14,000.00

#### Scenario: Options
- **WHEN** a quote reads `Opción 1` with `Costo: $ 25,000.00` and `Opción 2` with `Costo: $ 18,000.00`
- **THEN** its Monto is $18,000.00

#### Scenario: A named package adds up
- **WHEN** a quote's Asunto is `Paquete “Abogados”` and its lines are $5,000.00 and $12,000.00
- **THEN** its Monto is $17,000.00

#### Scenario: One-off price with a recurring line
- **WHEN** a quote has a one-off line of $18,000.00 and a recurring line of $2,000.00 mensuales
- **THEN** its Monto is $18,000.00 and its facturación is *pago único*

#### Scenario: Only recurring lines
- **WHEN** a quote's only price line is `Costo: $ 2,000.00 mensuales`
- **THEN** its Monto is $2,000.00 and its facturación is *mensual*
- **AND** once a folder links it, it is *aceptada* and no Ingreso, Costo or definition exists for it

#### Scenario: Accepted with one price
- **WHEN** a quote with one line of $3,000.00 is linked to a folder of the same name
- **THEN** it is *aceptada* with Monto $3,000.00, no "¿Qué aceptó?" Sugerencia is asked, and no Ingreso is created for it

#### Scenario: No price
- **WHEN** a quote's PDF has no `Costo` line
- **THEN** its Monto is $0.00, and Logs lists it as a Cotización whose PDF gave no price

### Requirement: A legacy Cotización priced in USD imports as USD
A price line SHALL be read in USD when its amount is written `US$` or is followed by `usd` or `Dlls` (regardless of case). A Cotización whose price lines are all in USD SHALL import as a USD Cotización. Its items and Monto SHALL be in USD. When a USD line also prints an MXN amount (`$ 260.00 USD ($5,000.00 MXN)`), the Cotización's tipo de cambio SHALL be the MXN amount divided by the USD amount, taken from the first such line. Otherwise its tipo de cambio SHALL stay empty. A quote with both USD and MXN price lines SHALL import in MXN. Each USD line of such a quote SHALL count at the MXN amount it prints, or at the rate another of its lines prints. A USD line with neither SHALL stay as an item, marked (USD), but be left out of the Monto and out of any "¿Qué aceptó?".

#### Scenario: USD quote with its peso amount
- **WHEN** a quote's only price line is `Costo especial: $ 260.00 USD ($5,000.00 MXN)`
- **THEN** the Cotización is in USD, its Monto is US$260.00, and its tipo de cambio is 19.2308

#### Scenario: USD quote without a peso amount
- **WHEN** a quote's only price line is `Costo: $ 1,200.00 USD`
- **THEN** the Cotización is in USD with Monto US$1,200.00 and no tipo de cambio

#### Scenario: MXN quote
- **WHEN** a quote's price lines carry no `usd`
- **THEN** the Cotización is in MXN, as today

#### Scenario: Sin ingresos registrados on a USD quote
- **WHEN** an accepted, completed USD Cotización of US$260.00 has a paid Ingreso from a USD invoice of US$260.00 before IVA
- **THEN** its Proyecto does not show Sin ingresos registrados

### Requirement: A legacy Cotización's categoría comes from its service label
The Cotización's categoría SHALL come from the label of its first price line. The label is the part of the service line before any `“…”` name or colon. The first rule that matches, regardless of case and accents, SHALL apply:
1. *ecommerce*: eCommerce, Tienda en línea
2. *app*: Web App, App (as a word), Aplicación, Plataforma
3. *website*: Sitio web, Website, Portal, Landing, Webmaster, Rediseño
4. *marketing*: Campaña, Marketing, Redes Sociales, Newsletter
5. *other*: anything else, including eBook, Video and Capacitación

A quote with no price line SHALL take its categoría from its `Asunto:` line by the same rules. With no Asunto either, it SHALL be *other*, as today. A Proyecto created for an accepted Cotización with no folder SHALL take the Cotización's categoría, as it already does.

#### Scenario: Website
- **WHEN** a quote's first price line is under `Sitio Web “Clínica Dental”:`
- **THEN** the Cotización's categoría is *website*

#### Scenario: Web App is an app
- **WHEN** a quote's first price line is under `Web App “Reservas”:`
- **THEN** its categoría is *app*

#### Scenario: Aplicación is an app
- **WHEN** a quote's first price line is under `Aplicación móvil “La Z 1310”:`
- **THEN** its categoría is *app*

#### Scenario: Unmapped label
- **WHEN** a quote's first price line is under `eBook “Recetas”:`
- **THEN** its categoría is *other*

### Requirement: A legacy Cotización's quoted name is the Proyecto it delivers
When a legacy Cotización's PDF names a project in curly quotes on a price line's service line (`eCommerce “3 Moon Wishes”`), the first such name SHALL be the Proyecto the Cotización delivers. That name SHALL decide which folder links to the Cotización through a Sugerencia de importación *vincular*, and what the Proyecto is called when the Cotización is accepted but no folder is found. A matching Mapa de nombres row that gives `proyecto` SHALL still take precedence. The quoted name SHALL NOT change which Contacto the Cotización belongs to.

#### Scenario: Two quotes, two folders
- **WHEN** Cotización 308 reads `eCommerce “3 Moon Wishes”` and Cotización 320 reads `Landing page “3 Moon Wishes”`, both filed under Sublime's name, and `Proyectos/3 Moon Wishes` exists under Sublime
- **THEN** Logs shows a Sugerencia *vincular* linking Cotización 308, the older one, to the Proyecto "3 Moon Wishes"
- **AND** Cotización 320 stays *enviada* with no Proyecto, and its name is "3 Moon Wishes", not Sublime's

#### Scenario: Map row still wins
- **WHEN** the row `Appleseed Plataforma,Appleseed,Plataforma,` matches a quote whose PDF reads `Web App “Reservas Appleseed”`
- **THEN** the Cotización delivers the Proyecto "Plataforma"

#### Scenario: No quoted name
- **WHEN** a quote's PDF has no `“…”` name and no map row matches
- **THEN** its Proyecto name comes from its filename, as it did before this change

### Requirement: "¿Qué aceptó?" asks which prices of an accepted quote were accepted
When the folder scan sets a legacy Cotización *aceptada* and the Cotización has several lines setting its Monto, it SHALL propose a Sugerencia de importación *partidas*, shown in Configuración → Logs as "¿Qué aceptó?". Its opciones SHALL be those lines, each shown with its label and amount, and several SHALL be choosable at once. A line SHALL be pre-checked when an issued invoice to the Cotización's Contacto, dated on or after the Cotización's fecha and not cancelled, has a subtotal equal to that line or to the sum of a set of lines. An invoice split into Parcialidades SHALL count at its whole subtotal. A USD Cotización SHALL be compared with invoices issued in USD, by their USD amount before IVA. When several invoices or sets match, the earliest invoice SHALL decide, and the smallest set that matches it. The pre-check SHALL be worked out when Logs is read, so an invoice imported after the folder scan counts.

Until it is answered, the Cotización's Monto SHALL be the provisional one: the sum, or the lowest line when the PDF says Opción or Paquete. Aceptar SHALL set the Monto to the sum of the checked lines, with IVA 0 and a total equal to it. It SHALL be refused while no line is checked. Checking exactly the pre-checked lines SHALL record the Sugerencia as *aceptada*, and any other set as *corregida*. Rechazar SHALL keep the provisional Monto. The Sugerencia SHALL be shown and answerable only while its Cotización is *aceptada*. It SHALL stop showing once the Cotización's *vincular* Sugerencia is rejected or the Cotización is cancelled. The answer SHALL be final and SHALL NOT be asked again by a later scan. No answer SHALL create Ingresos, Costos or definitions (ADR-0002). Aceptar todas SHALL leave "¿Qué aceptó?" pending. Derived facts SHALL update after the answer: Sin ingresos registrados and Cobros.

#### Scenario: Pre-checked from an invoice
- **WHEN** an accepted Cotización of "Sublime" has lines of $10,000.00, $4,000.00 and $2,500.00, and an invoice to "Sublime" dated after the quote has subtotal $12,500.00
- **THEN** "¿Qué aceptó?" shows the three lines with $10,000.00 and $2,500.00 checked
- **AND** its Monto is $16,500.00 until it is answered

#### Scenario: Accepting the pre-check
- **WHEN** the user clicks Aceptar with the pre-checked lines
- **THEN** the Cotización's Monto is $12,500.00, with IVA $0.00 and total $12,500.00, and the Sugerencia is *aceptada*

#### Scenario: Choosing other lines
- **WHEN** the user checks only the $4,000.00 line and clicks Aceptar
- **THEN** the Monto is $4,000.00 and the Sugerencia is *corregida*

#### Scenario: No matching invoice
- **WHEN** no invoice to the Contacto matches any line or set of lines
- **THEN** "¿Qué aceptó?" shows no line checked, and Aceptar is refused until one is checked

#### Scenario: Invoice imported after the scan
- **WHEN** Reimportar desde cero runs the folder scan and then the Facturas run, which imports the matching invoice
- **THEN** Logs shows the matching lines pre-checked

#### Scenario: Invoice in Parcialidades
- **WHEN** an invoice of subtotal $14,000.00 was paid in two Parcialidades of $7,000.00 each
- **THEN** lines adding up to $14,000.00 are pre-checked, and no line of $7,000.00 is pre-checked on its account

#### Scenario: USD quote
- **WHEN** an accepted USD Cotización has lines of US$260.00 and US$120.00, and a USD invoice to its Contacto has US$260.00 before IVA
- **THEN** the US$260.00 line is pre-checked, and accepting sets the Monto to US$260.00

#### Scenario: Rejected
- **WHEN** the user clicks Rechazar
- **THEN** the Monto stays the provisional one, and the Sugerencia is not asked again

#### Scenario: Link rejected
- **WHEN** "¿Qué aceptó?" is pending and the user rejects the *vincular* Sugerencia that set its Cotización *aceptada*
- **THEN** the Cotización is *enviada* again, and "¿Qué aceptó?" no longer shows in Logs

#### Scenario: Sin ingresos registrados clears
- **WHEN** a completed Proyecto shows Sin ingresos registrados because its Cotización's provisional Monto is $16,500.00 and its paid Ingresos total $12,500.00 before IVA, and the user accepts the pre-checked $12,500.00
- **THEN** the Proyecto no longer shows Sin ingresos registrados

#### Scenario: No money created
- **WHEN** the user answers "¿Qué aceptó?" in any way
- **THEN** no Ingreso, Costo or definition is created for the Cotización

### Requirement: The PDF applies when a Cotización is first imported
The scan SHALL read a Cotización's PDF only for a Folio it has not imported before. Re-scanning SHALL NOT change the fecha, items, Monto, categoría, currency or name of a Cotización already imported, or of one edited since. A PDF that cannot be read SHALL NOT stop the scan: that Cotización SHALL import from its filename, as before this change. An imported Cotización SHALL count as made by the Importación whatever items it has, so it SHALL NOT block Reimportar desde cero. Only a Cotización created in the app blocks it.

#### Scenario: Re-scan
- **WHEN** Cotización 250 was imported and the user re-scans
- **THEN** its fecha, items and Monto are unchanged, and the Log counts it as already imported

#### Scenario: Damaged PDF
- **WHEN** one PDF under `Cotizaciones/2019/` cannot be opened
- **THEN** its Cotización imports with fecha `2019-01-01`, no items and Monto $0.00, every other file imports, and Logs lists it as a Cotización whose PDF could not be read

#### Scenario: Imported quote with items
- **WHEN** every Cotización was imported and now has items from its PDF, and nothing was made in the app
- **THEN** Reimportar desde cero is not refused on account of any Cotización

### Requirement: Logs and Vista previa list the Cotizaciones their PDF could not fully read
After a folder scan, Configuración → Logs SHALL list each Cotización imported in that run whose PDF gave no fecha, printed a year other than its folder's, gave no price, or could not be read. Each entry SHALL give its Folio, its file, and what was missing or corrected. Vista previa and Vista previa desde cero SHALL show the same list for what the scan would import, and SHALL show the fecha, Monto, currency and categoría each new Cotización would get. Vista previa SHALL still change nothing.

#### Scenario: After a reimport
- **WHEN** Reimportar desde cero imports 401 Cotizaciones and 27 have no price line
- **THEN** Logs lists those 27 with their Folio, file and "sin precio"

#### Scenario: Preview shows the PDF's values
- **WHEN** the user runs Vista previa desde cero
- **THEN** each Cotización it would create shows the fecha, Monto, currency and categoría read from its PDF
- **AND** the database is unchanged afterwards
