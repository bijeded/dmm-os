## ADDED Requirements

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

## MODIFIED Requirements

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
