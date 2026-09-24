# Spec Delta

## Purpose

How the folder scan decides which Contacto, Proyecto and RFC each name on disk means, through a user-edited Mapa de nombres, and how the user previews a scan before it writes anything.

## ADDED Requirements

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
When no row matches a legacy Cotización's name and the name contains ` - ` (a dash with a space on each side), the scan SHALL attribute the Cotización to the Contacto named before the first ` - `. That name SHALL itself be looked up in the map, as a name on disk. The Cotización SHALL deliver the Proyecto named after that dash, which decides linking and naming as a mapped `proyecto` does. A name without ` - ` (e.g. `Anarco-guadalupano`) SHALL NOT split. A matching row SHALL always take precedence over the split.

#### Scenario: Agency quote without a map row
- **WHEN** no row matches and the scan finds `DMM - 377 - Korova - Blog.pdf`
- **THEN** Cotización 377 belongs to the Contacto "Korova" and delivers the Proyecto "Blog"
- **AND** no Contacto named "Korova - Blog" exists

#### Scenario: The Contacto part is mapped too
- **WHEN** the map has the row `Sublime,Sublime Inspiración,,` and no row for `Sublime - Citli Tours`, and the scan finds `DMM - 401 - Sublime - Citli Tours.pdf`
- **THEN** Cotización 401 belongs to the Contacto "Sublime Inspiración" and delivers the Proyecto "Citli Tours"

#### Scenario: Row overrides the split
- **WHEN** the row `Marketing Dojo - Cursos,Marketing Dojo,Cursos online,` exists and the scan finds `DMM - 350 - Marketing Dojo - Cursos.pdf`
- **THEN** Cotización 350 delivers the Proyecto "Cursos online"

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
A map row SHALL decide the Contacto and Proyecto only for a Cotización or folder the scan has not imported before. Re-scanning after the map is edited SHALL NOT move an already-imported Cotización or Proyecto to another Contacto, rename it, or remove a Contacto. The one exception is an RFC, which a later scan adds to a Contacto that has none.

#### Scenario: Map edited after the real scan
- **WHEN** the quote "Frida Comunicacion" was imported under a Contacto "Frida Comunicacion" and the user then adds the row `Frida Comunicacion,Frida,,` and re-scans
- **THEN** the Cotización stays with the Contacto "Frida Comunicacion"
- **AND** the Log counts it as already imported

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
