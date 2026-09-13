# DMM OS

The living record of the DMM Studios business: who it works with, what it quoted, what it built, and the shape of its money.

## Language

**Contacto**:
The person or company DMM deals with directly and who pays. An agency (e.g. Estudio Ocho) is the Contacto, never its end-clients.
_Avoid_: cliente final as a Contacto

**Cliente final**:
The agency's customer a Proyecto is built for (e.g. Hospital Jardín). A label on the Proyecto; DMM does not interact with them.

**Cotización**:
A priced offer to a Contacto, identified by its **Folio**. Leads to at most one Proyecto; cancelling either cancels the other.

**Folio**:
The single continuous number identifying a Cotización across old and new filename formats.

**Proyecto**:
One unit of work with its own status and billing. A follow-on phase (e.g. monthly maintenance after a design build) is a new Proyecto.
_Avoid_: engagement

**En curso**:
Proyecto status meaning work is active, or delivered but not fully paid. A Proyecto is only completed once fully paid. What makes a Contacto an active client (along with paused).
_Avoid_: active (for projects)

**Periodo generado**:
A dated Ingreso or Costo created from a monthly/installment definition, produced up to the current month only. A monthly series ends when its Proyecto is completed or cancelled, or at its end date.

**Catálogo**:
Products and services with default prices, kept in Configuración. A Cotización copies prices at creation; later edits don't touch past quotes.

**Inicio**:
The home screen summarising current business status.
_Avoid_: Panel de Control, Dashboard

**Ingreso** / **Costo**:
Money in / money out, always recorded in the MXN amount actually seen in the bank; original currency is optional detail.

**Subtotal / IVA**:
Revenue, costs and profit KPIs use the subtotal (before IVA). IVA is tracked and shown separately in Finanzas.

**Folio** assignment:
A Cotización receives its Folio when marked sent. Drafts have none.

**Vigencia de precio**:
A change to a recurring Costo definition applies from a date forward; already generated periods keep their amount.

**Nombre canónico**:
The accented, correctly written name of a Contacto (e.g. "Sonríeme"). File and folder names may omit accents. Near-duplicates are merged only after a Sugerencia de importación is accepted.

**Borrar vs cancelar**:
Only records with no linked records (or drafts) can be deleted; anything linked is cancelled instead.

**Estado de facturación**:
Whether an invoice-category Ingreso is *por facturar* or *facturado*. Independent of payment status (pendiente/pagado). No-invoice Ingresos have none.
_Avoid_: "pendiente" for not-yet-invoiced

**Cobranza vencida**:
An invoiced, unpaid Ingreso older than the configured number of days (default 30). Uninvoiced Ingresos are never overdue.

**Sin datos**:
What a period shows for margin or profit when its Costos were never imported. Never estimated.

**Archivado**:
A completed Proyecto whose files have left `Proyectos/` for long-term storage (external HDD and/or Google Drive). Its record stays; the app shows it as archived, not as a broken link.

**No disponible**:
A file location the app knows but cannot currently reach (e.g. external HDD disconnected, or folder never found). Distinct from **Archivado**.

**Reembolso**:
A negative Ingreso linked to the original Ingreso, counted in the period the money went back.

**Estado de Contacto**:
Always derived from Cotizaciones and Proyectos, never set by hand. A Contacto with no Cotización is a cold lead.

**Sugerencia de importación**:
A link the importer guessed (e.g. CFDI → Proyecto by amount/date, or a Proyecto created for an accepted legacy quote) that waits in Logs for a one-time accept/reject.

**Asignación de costo**:
The share of an AI subscription Costo attributed to a Proyecto in a month, by token usage (even split if no data). The Costo itself is never duplicated.

**Cancelación con pagos**:
When a Proyecto/Cotización is cancelled, paid Ingresos stay paid, pending Ingresos become cancelled or uncollectible, pending estimated Costos are cancelled.

## Relationships

- A **Contacto** has many **Cotizaciones** and **Proyectos**
- A legacy Cotización listing several projects imports as one **Proyecto**; the other names go in notes
- A **Cotización** produces zero or one **Proyecto**; personal **Proyectos** have no Cotización or Contacto
- A **Proyecto** may name one **Cliente final**

## Flagged ambiguities

- "engagement" was used for work inside a project — resolved: each is its own **Proyecto**.
- "active" project vs "in progress" — resolved: same thing, **En curso**.
