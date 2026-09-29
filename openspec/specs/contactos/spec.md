# contactos Specification

## Purpose

How the owner corrects, in the app, which Contacto records belong to: merging one Contacto into another, moving a Cotización and its Proyecto to another Contacto, and removing the Contacto a correction leaves with nothing.

## Requirements

### Requirement: Fusionar Contacto moves everything to the chosen Contacto
The Ficha del Contacto SHALL offer **Fusionar en…**, which asks for another Contacto (the *destino*) and says what will move and that this Contacto will be deleted. On confirm, in one step, every Cotización, Proyecto, Ingreso (Reembolsos, Parcialidades and Incobrable ones included) and recurring Ingreso definition of this Contacto SHALL belong to the destino, and this Contacto SHALL be deleted. The destino SHALL keep its name. Each of its empty details (empresa, email, teléfono, dirección, RFC, notas) SHALL take this Contacto's value. Amounts, estados, dates, USD originals and links to Proyectos SHALL be unchanged. The app SHALL then show the destino's Ficha. Closing the dialog SHALL change nothing.

#### Scenario: Cantina 48 merged into Omar Rodriguez
- **WHEN** the Contacto "Cantina 48" has only Cotización 190 (aceptada, imported) and the Proyecto "Cantina 48" (completado), and the owner chooses Fusionar en… "Omar Rodriguez" and confirms
- **THEN** Cotización 190 and the Proyecto "Cantina 48" belong to "Omar Rodriguez", still aceptada and completado
- **AND** the Contacto "Cantina 48" no longer exists, and "Omar Rodriguez" keeps its name, empresa and RFC `ZEM180223H23`

#### Scenario: Details filled from the merged Contacto
- **WHEN** Contacto A has email `a@x.mx` and no teléfono, the destino B has teléfono `5551234` and no email, and A is merged into B
- **THEN** B has email `a@x.mx` and teléfono `5551234`

#### Scenario: USD Ingreso moves unchanged
- **WHEN** the merged Contacto has a USD 1,000 Ingreso recorded as $18,500.00 at 18.50
- **THEN** the destino has that Ingreso with the same peso amounts, USD original and rate

#### Scenario: Dialog closed
- **WHEN** the owner opens Fusionar en…, picks a Contacto and closes the dialog
- **THEN** both Contactos and their records are unchanged

### Requirement: Fusionar Contacto is refused on conflicting RFCs
Fusionar en… SHALL be refused, changing nothing, when both Contactos hold an RFC and the RFCs differ. The dialog SHALL say which RFC each holds. The destino list SHALL NOT include the Contacto itself.

#### Scenario: Two companies with their own RFCs
- **WHEN** Contacto A holds `AAA010101AAA` and Contacto B holds `BBB020202BBB`, and the owner tries to merge A into B
- **THEN** the merge is refused, and both Contactos and their records are unchanged

#### Scenario: Only the merged Contacto has an RFC
- **WHEN** Contacto A holds `AAA010101AAA`, B holds none, and A is merged into B
- **THEN** B holds `AAA010101AAA`, and a later Facturas run links new CFDIs to that RFC to B

### Requirement: Fusionar Contacto answers the Sugerencias about the merge
When a Contacto is merged by hand, a pending *fusionar* Sugerencia de importación that asks to merge it SHALL be recorded as *aceptada* if it proposed the destino, and as *corregida* otherwise. A pending *fusionar* that asks to merge the destino into the merged Contacto SHALL be recorded as *aceptada*. Any other pending Sugerencia that names the merged Contacto as where to merge SHALL name the destino instead. Pending *vincular* Sugerencias about the moved records SHALL stay pending; their opciones SHALL be the destino's Proyectos.

#### Scenario: A pending merge suggestion is settled
- **WHEN** a pending *fusionar* Sugerencia proposes merging "Zamora Live Eventos" into "Omar Rodriguez", and the owner merges "Zamora Live Eventos" into "Omar Rodriguez" from its Ficha
- **THEN** Logs shows that Sugerencia as *aceptada*, not pending

#### Scenario: Merged into another Contacto than suggested
- **WHEN** a pending *fusionar* Sugerencia proposes merging A into B, and the owner merges A into C
- **THEN** that Sugerencia is *corregida*, and everything of A belongs to C

### Requirement: Cambiar Contacto moves a Cotización and its Proyecto together
The Ficha of a Cotización that is not a draft, and the Ficha of a client Proyecto that has a Contacto or a Cotización, SHALL offer **Cambiar contacto**, which asks for another Contacto and says what will move. On confirm, in one step, the Cotización, the Proyecto it led to (if any), the Ingresos on either of them and their recurring Ingreso definitions SHALL belong to the chosen Contacto. For a Proyecto with no Cotización, only the Proyecto and its Ingresos and definitions move. Estados, amounts, USD originals, dates, Folio and Cliente final SHALL be unchanged, including for cancelled and imported records. The Contacto of a draft Cotización SHALL still be changed from its Editar form, as today.

#### Scenario: Cantina 48 moved to Omar Rodriguez
- **WHEN** the owner opens the Proyecto "Cantina 48" (Contacto "Cantina 48", from Cotización 190, completado, imported, no Ingresos), chooses Cambiar contacto → "Omar Rodriguez" and confirms
- **THEN** the Proyecto and Cotización 190 belong to "Omar Rodriguez", and the Proyecto is still completado and imported

#### Scenario: Started from the Cotización
- **WHEN** the owner chooses Cambiar contacto on Cotización 190 instead
- **THEN** the same records move, and the Proyecto "Cantina 48" belongs to the same Contacto as its Cotización

#### Scenario: Pending Plan de cobro Ingresos follow
- **WHEN** an accepted MXN Cotización has two pending $5,000 Ingresos on its Proyecto, and the owner moves it to Contacto B
- **THEN** both Ingresos belong to B, still pending for $5,000 each, and Cobros shows them under B

#### Scenario: USD Cotización with a monthly definition
- **WHEN** an accepted USD `mensual` Cotización has a recurring Ingreso definition and two Periodos generados at 18.50, and the owner moves it to Contacto B
- **THEN** the definition and both Periodos generados belong to B, with their USD originals and rate unchanged, and the next Periodo generado belongs to B

#### Scenario: Cancelled pair
- **WHEN** a cancelled Cotización and its cancelled Proyecto are moved to Contacto B
- **THEN** both belong to B and stay cancelled

### Requirement: Cambiar Contacto is refused while invoices or Sugerencias are involved
Cambiar contacto SHALL be refused, changing nothing, when any Ingreso on the Cotización or its Proyecto comes from a CFDI, and SHALL say so and point to Fusionar en… or to Asignar proyecto in Finanzas. It SHALL also be refused while a Sugerencia de importación about the Cotización, the Proyecto or one of their Ingresos is pending, and SHALL say to answer it in Logs first. It SHALL be refused when the chosen Contacto is the current one. A personal Proyecto SHALL NOT offer it.

#### Scenario: Proyecto with an invoice
- **WHEN** the Proyecto "Cantina Rooftop" has an Ingreso imported from a CFDI to `ZEM180223H23`, and the owner chooses Cambiar contacto
- **THEN** it is refused with a message naming the invoice, and nothing moves

#### Scenario: Pending link suggestion
- **WHEN** a pending *vincular* Sugerencia proposes linking Cotización 300 to a Proyecto, and the owner chooses Cambiar contacto on Cotización 300
- **THEN** it is refused until that Sugerencia is answered

### Requirement: The Editar form sets a Contacto only on a Proyecto that has none
The Editar form of a client Proyecto SHALL let the owner choose its Contacto only while it has none (a Proyecto sin Contacto); once it has one, the Contacto SHALL be shown but changed only through Cambiar contacto, and the Proyecto SHALL NOT be made personal. Giving a Proyecto sin Contacto a Contacto SHALL also give that Contacto to its Ingresos that have none; any other edit SHALL leave its Ingresos' Contacto as it is.

#### Scenario: Proyecto sin Contacto assigned
- **WHEN** the imported Proyecto "Bosque" has no Contacto and a CFDI Ingreso with no Contacto, and the owner chooses Contacto "Versa" in Editar and saves
- **THEN** the Proyecto and that Ingreso belong to "Versa"

#### Scenario: Proyecto with a Contacto
- **WHEN** the owner opens Editar on a Proyecto of "Omar Rodriguez"
- **THEN** the Contacto field is not editable, and the Ficha offers Cambiar contacto

### Requirement: A Contacto left with nothing is deleted
After Cambiar contacto, the Contacto it moved the records from SHALL be deleted in the same step when it no longer has any Cotización, Proyecto, Ingreso or recurring Ingreso definition. The dialog SHALL say, before confirming, that this Contacto will be deleted. A Contacto that still has any of those SHALL stay. Its `Clientes/` folder on disk SHALL be left untouched. Answered Sugerencias de importación that named it as where to merge SHALL stay in Logs, naming the Contacto the records moved to.

#### Scenario: Cantina 48 emptied
- **WHEN** the Proyecto "Cantina 48" and Cotización 190 were the only records of the Contacto "Cantina 48", and the owner moves them to "Omar Rodriguez"
- **THEN** the dialog warned that "Cantina 48" will be deleted, and after confirming the Contacto "Cantina 48" no longer exists in Contactos

#### Scenario: Contacto with other work stays
- **WHEN** Contacto A has two Cotizaciones, and the owner moves one of them to Contacto B
- **THEN** A still exists with the other Cotización

### Requirement: Derived facts follow the moved records
Estado de Contacto, the Ficha del Contacto's history, cobrado and por cobrar, the Contactos list, Cobros, and Sin ingresos registrados SHALL be read from the records as they are after Fusionar en… or Cambiar contacto. Nothing SHALL be stored for them.

#### Scenario: Active client moves
- **WHEN** Contacto A's only Proyecto is en curso, and it is moved to Contacto B, which had only completed Proyectos
- **THEN** B shows as an active client and A, if it still exists, no longer does

#### Scenario: Cobrado moves with a merge
- **WHEN** Contacto A has $9,000 paid and is merged into B, which has $20,000 paid
- **THEN** B's Ficha shows $29,000 cobrado
