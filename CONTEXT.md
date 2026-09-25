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
The single continuous number identifying a Cotización across old and new filename formats. Two quotes may share a number and be told apart by a trailing letter (`475a`, `475b`); the number and that letter together are the key an import is idempotent on.

**Proyecto**:
One unit of work with its own status and billing. A follow-on phase (e.g. monthly maintenance after a design build) is a new Proyecto.
_Avoid_: engagement

**En curso**:
Proyecto status meaning work is active, or delivered but not fully paid. A Proyecto is only completed once fully paid. What makes a Contacto an active client (along with paused).
_Avoid_: active (for projects)

**Periodo generado**:
A dated Ingreso or Costo created from a monthly/installment definition, produced up to the current month only. A monthly series (Ingreso or Costo) ends when its Proyecto is completed or cancelled, or at its end date. MSI and annual Costos are already committed, so they run to their end even after the Proyecto closes. A monthly Costo estimated in a Cotización is the exception: it runs until it is stopped in Finanzas → Costos, whatever happens to its Proyecto.

**Al día**:
The ledger brought up to hoy before money is read: sent Cotizaciones past their validity become expiradas, then every Periodo generado due this month exists. Idempotent; reading twice changes nothing.
_Avoid_: sync, refresh

**Catálogo**:
Products and services with default prices, kept in Configuración. A Cotización copies prices at creation; later edits don't touch past quotes.

**Inicio**:
The home screen summarising current business status.
_Avoid_: Panel de Control, Dashboard

**Tarea**:
A to-do on Inicio, dated the day it is registered. Marking it done dates it and keeps it in view for 30 days; deleting it removes it. Not linked to any Contacto, Cotización or Proyecto.
_Avoid_: pendiente (reserved for money not yet paid)

**Ingreso proyectado / Ingreso real**:
On Inicio, the month's Ingresos, pending and paid (proyectado), against those paid this month (real). A paid Ingreso counts on the day it was paid in both, so real never exceeds proyectado.

**Ingreso** / **Costo**:
Money in / money out, always recorded in the MXN amount actually seen in the bank; original currency is optional detail.

**Subtotal / IVA**:
Revenue, costs and profit KPIs use the subtotal (before IVA). IVA is tracked and shown separately in Finanzas.

**Retenciones**:
Taxes the payer withholds from an invoice (TotalImpuestosRetenidos), kept apart from IVA (TotalImpuestosTrasladados). The total is what the bank sees: subtotal + IVA − retenciones. Only imported CFDIs and their Reembolsos carry them; everything else has zero. Shown next to IVA in Finanzas; KPIs still use the subtotal.

**Montos**:
The recorded amounts of an Ingreso or Costo: subtotal, IVA, retenciones, total (subtotal + IVA − retenciones), and the USD original when there is one. Built only by the money module (`dinero`), which also splits an amount into parts that add up. The 16% IVA rule sits beside it in the shared money rules (`shared/montos`) so the Cotización preview uses the same one.

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

**Plan de cobro**:
What accepting a Cotización records, worked out before anything is written: its pending Ingresos (one, or one per parcialidad adding up exactly to the total) or its monthly definition, and its estimated Costos (one-time ones as Costos dated that day, recurring and MSI ones as definitions with their price). Always in MXN; a USD quote converts at its tipo de cambio and keeps its USD amounts as the original, which Cobros compares against.

**Cobros**:
The pending Ingresos dated this month or earlier (or not yet dated), split into three groups so each appears in exactly one: *Vencidos* (the Cobranza vencida), *Por facturar* (Estado de facturación por facturar), and *Este mes* (everything else collectable). Pending Ingresos dated after this month are in none. Worked out by main; currently shown on Inicio.
_Avoid_: "Cobranza" for this grouping (Cobranza is every pending Ingreso, whatever its date)

**Sin ingresos registrados**:
A completed Proyecto with files somewhere (local or external HDD) and a one-off or installment Cotización whose paid Ingresos never reached the quote total. Usually imported history (ADR-0002) whose uninvoiced Ingresos are still to be entered by hand. Derived, never stored: it clears once the Ingresos are entered.
_Avoid_: "sin pagar" (it is about what the app has recorded, not what the client owes)

**Sin datos**:
What a period shows for margin or profit when its Costos were never imported. Never estimated.

**Entrada**:
The inbox folder of loose files with no triage yet. The app counts what waits there and opens it; it never files anything from it by itself.

**Archivado**:
A completed Proyecto whose files have left `Proyectos/` for long-term storage (`Archivo/`, external HDD and/or Google Drive). Its record stays; the app shows it as archived, not as a broken link.

**No disponible**:
A file location the app knows but cannot currently reach (e.g. external HDD disconnected, or folder never found). Distinct from **Archivado**.

**Reembolso**:
A negative Ingreso linked to the original Ingreso, dated the day it is recorded and counted in that period. Its amount is entered in the original Ingreso's own currency; a USD one converts to pesos at that Ingreso's own rate. Its IVA and retenciones are in the original's proportion; the one that gives back all that is left takes the exact remainders. Several may be recorded against one Ingreso, never more in total than was paid.

**Estado de Contacto**:
Always derived from Cotizaciones and Proyectos, never set by hand. A Contacto with no Cotización is a cold lead.

**Sugerencia de importación**:
Something the importer guessed that waits in Logs for a one-time accept/reject. Three kinds: *vincular* a record to a Proyecto (e.g. CFDI → Proyecto by amount/date, or a folder taken to deliver a quote of the same name), *fusionar* two Contactos whose names are near-duplicates, and *ubicación* — asking whether a completed Proyecto with no folder is Archivado or No disponible. A guessed status is written so the record is usable; the suggestion is what makes it reversible.

**Importación**:
A run that brings existing files into the app: the folder scan (Cotizaciones PDFs, Clientes and Proyectos folders) or the Facturas run (CFDI XML). Each file imports in one transaction, and a Sugerencia de importación is asked only once. A rejected Sugerencia undoes exactly what its guess changed.
Imported history is exempt from the lifecycle guards: a Proyecto may import as completed without being fully paid, and a Cotización accepted by import creates no Ingresos or Costos (invoiced income arrives through the Facturas run; uninvoiced Ingresos, which carry no IVA, are entered by hand in Finanzas). See ADR-0002.
The Facturas run reads every file before importing any: a **Factura cancelada** is not imported, and an Ingreso or Costo an earlier run imported from one becomes cancelado, even when paid (ADR-0002). Complementos de pago date a PPD invoice's payments, splitting it into **Parcialidades**. An XML that is not a CFDI (e.g. a CEP bank receipt) is only counted.
The folder scan follows the Mapa de nombres only when a file or folder is first imported: editing the map later moves, renames or removes nothing already imported. The one exception is an RFC, which a later scan still gives to a Contacto that has none.

**Factura cancelada**:
A CFDI filed in a folder whose name starts with "cancel" (e.g. `Canceladas`), or one that another CFDI replaces through relación `04` (sustitución). The app never asks the SAT; the folder and the relación are its only signals. Its money never counts.

**Parcialidad**:
One payment of an invoice, recorded as its own Ingreso dated on that payment's day. An invoice paid in several payments (as its complementos de pago record) is split into Parcialidades that add up exactly to it; an open balance is one more, still pending. The same word names each of the pending Ingresos a Plan de cobro splits a Cotización into.

**Mapa de nombres**:
`Clientes/_nombres.csv`, edited by the user, telling the folder scan what each name on disk means: its Contacto and, optionally, its Proyecto, Cliente final and the Contacto's RFC. A row keyed `<folder>/<subfolder>` makes that subfolder a Proyecto of its own. A map that exists but cannot be read stops the scan, and rows that matched nothing are reported in Logs.
_Avoid_: alias file, mapping

**Vista previa**:
A folder scan run on a throwaway copy of the database, from Configuración → Logs. It shows what a real scan would create and the map's problems, and saves nothing.
_Avoid_: dry run, simulación

**Proyecto AI**:
A Proyecto in the `ai` categoría, client or personal.
_Avoid_: AI Proyecto

**Abierto en el mes**:
A Proyecto started by the month's end (or with no start date) and not completed or cancelled before the month began. Paused ones count.
_Avoid_: active, open

**Suscripciones**:
The Costos marked Suscripción de IA, plus any Costo from the same proveedor under its own or legal name (as a received CFDI carries it). The same records Finanzas shows, never copied.

**Asignación de costo**:
A month's Suscripciones split across Proyectos AI: by token usage among those that used any, otherwise evenly among those Abiertos en el mes. With no such Proyecto the whole amount is Sin asignar; derived when read and never stored, so the Costos are never duplicated.

**Sin asignar**:
The part of a month's Suscripciones no Proyecto AI takes: all of it when there is none. Only noted, never spread.
_Avoid_: Sin proyecto (that is usage, not money)

**Sin proyecto**:
Token usage from a folder that is no Proyecto's. Counts in AI totals, never in an Asignación de costo.
_Avoid_: Sin asignar (that is money, not usage)

**Costo real**:
What a Proyecto AI cost in a period: its Asignación de costo plus the Costos linked to it, pending ones included. "Real" sets it against the approximate API cost; unlike Ingreso real, it does not mean paid.
_Avoid_: costo pagado

**Cancelación con pagos**:
When a Proyecto/Cotización is cancelled, paid Ingresos stay paid, pending Ingresos become cancelled or uncollectible, pending estimated Costos are cancelled.

**Respaldo**:
A dated copy of the whole database in Vault, labelled by motivo (semanal, migración, manual, antes de restaurar). Retention counts each motivo separately. No migration runs without one.
_Avoid_: backup (in UI copy)

**Restauración**:
Replacing the live database with a Respaldo, then relaunching. Always takes a Respaldo *antes de restaurar* first; a Respaldo from a newer app version is refused.

## Relationships

- A **Contacto** has many **Cotizaciones** and **Proyectos**
- A legacy Cotización listing several projects imports as one **Proyecto**; the other names go in notes
- A **Cotización** produces zero or one **Proyecto**; personal **Proyectos** have no Cotización or Contacto
- A **Proyecto** may name one **Cliente final**

## Flagged ambiguities

- "engagement" was used for work inside a project — resolved: each is its own **Proyecto**.
- "active" project vs "in progress" — resolved: same thing, **En curso**.
