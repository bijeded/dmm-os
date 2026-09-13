# DMM OS

## 1. What it is

A local but responsive **desktop app** in spanish (running only on this Mac, accessible via a single click in the dock) that turns the `~/Desktop/DMM OS` folder into the business's operating system: contacts, quotes, projects, finances, and more info in a single view, with options to add and edit.

It is neither a file explorer nor accounting or expenses report software. It is neither a CRM nor an ERP, although it has some similar features. It is the living record of the business's status.

### Starting point

| Folder | Content | Value |
|---|---|---|
| `AI/` | AI assets, agents and skills subfolders (some in testing) | Context |
| `App/` | This desktop app files | The app itself |
| `Archivo/` | Finished projects, inactive client's files, expired inbos entries  | Files ready to be backed up to external media and/or deleted |
| `Clientes/` | Brand, contracts, CSF/RFC and other docs | Identity and documents |
| `Cotizaciones` | Quotes PDFs, `DMM - <folio> - <Cliente>.pdf`, 2017–2026 | Almost complete historical pipeline |
| `DMM/` | DMM brand, email backups, templates | Context |
| `Entrada/` | Raw, unorganized files | Inbox pending classification/deletion |
| `Facturas/Emitidas` | CFDI `.pdf` + `.xml` by year/month, 2017–2026 | Reliable, but incomplete, revenue |
| `Facturas/Recibidas` | Same, but **only 2022, 2023, 2026** | Incomplete expenses |
| `Lab/` | Benchmarks, Design Systems | Claude Desktop output |
| `Proyectos/` | Working files, heterogeneous | No disk-readable state |
| `Recursos/` | Some assets | Context |

Total ~203 GB. There is also an **external HDD** containing old projects and more expenses invoices.

- `AI/` agents and skills might be manually copied from here to AI projects
- `Cotizaciones` quotes PDFs will get a new design template and file name: `<YYMMDD>-DMM<ID>-<Proyecto>.pdf`
- `DMM/` templates (Plantillas) will be outdated soon, since they don't use the new design system
- `Facturas/Recibidas` I have some old expenses in the external HDD, that I'll copy in this folder later
- `Lab/` I'll add more Claude Desktop app Projects output here, and maybe some Claude Code applications that might use an MCP or CLI
- `Proyectos/` there are older projects in the external HDD, where finished projects are stored

## 2. Architecture decision

**After the initial import, the database becomes the source of truth. The folders become storage locations that the database points to.**

Consequences:

- Creating a quote in the app **generates the PDF** and archives it at `Cotizaciones/<year>/DMM<YYMMDD><N>-<Proyecto>.pdf`, following the new convention. The folio number is managed in a single location to avoid conflicts.
- The PDF template inherits `DMM/Brand/DESIGN.md` or `DMM/Brand/DMM Studios Design System`, not a generic template.
- A manual **rescan** (or one triggered upon opening the app) detects items that appeared on the disk without the app's intervention—such as a CFDI downloaded from the SAT portal or a manually created folder—and **reports them for acceptance** rather than silently merging them.
- Every import is **idempotent**: keyed by invoice UUID and quote number. Rescanning the same files changes nothing.
- The **external HDD** is a secondary source that is usually disconnected. It is imported when connected, and the data remains in the database even when the drive is absent. Files stored there are marked accordingly; the app notifies you that the drive is required, rather than displaying a broken link.
- The files on the **external hard drive** must be organized in the same way as in this folder.

---

## 3. Tech stack

| Piece | Choice | Note |
|---|---|---|
| Shell | **Electron** | A real `.app` in the Dock. No `npm run`, no `localhost` |
| Frontend | **Vite + React + React Router** | |
| Backend | Electron main process | Full node; the renderer communicates via **IPC** |
| DB | **SQLite** (`better-sqlite3`) | One file, one user, one Mac |
| ORM | **Drizzle** | Versioned migrations; the model is going to change significantly. |
| UI | **Tailwind + shadcn/ui** | Tables, forms, and dialogs make up 80% of the app. |
| CFDI | **fast-xml-parser** | Fixed schema; ~40 mapping lines. |
| PDF | **`webContents.printToPDF()`** | Native to Electron |

**Why Electron instead of Next.js**: Next offers SSR and file-based routing, neither of which is useful for a single-user app. It would also introduce an unnecessary server. Electron provides direct disk access from the main process—without an HTTP layer between the app and 203 GB of files—and, being based on Chromium, it can print the quote as a PDF without extra dependencies.

**Why not Python**—even though XML is its strong suit? It would split the app across two languages for the sake of saving ~40 lines, and the cost would be paid in the UI, which is where the real work lies.

**Why SQLite instead of JSON**: KPIs are aggregate queries—revenue per month, conversion per customer, active engagements. That is SQL.

**Considered alternative — Tauri**: ~10 MB instead of ~150 MB and faster disk scanning, at the cost of using Rust for the backend and rewriting `better-sqlite3` and the CFDI parsing logic. Payment is not made here.

**Considerations before locking it in**:

- I want charts in the UI
- Maybe we need to reconcile PDFs quotes with CFDIs
- If I change the device (buy a new laptop), I must be able to migrate everything into the new device.

### Location

- **`DMM OS/App/`** — the code. System infrastructure, a sibling to `Clientes/`, `Facturas/`, and `Proyectos/`. Kept outside of `Proyectos/` by design: that folder is a table read by the app, and placing the code there would turn it into a record within its own query.
- `git init` in `App/`. `.gitignore` covers `node_modules`, `dist/`, and the SQLite database.
- **The database does not reside in the repo.** It goes in `~/Library/Application Support/DMM OS/`—the standard location on macOS— and is backed up separately from the code.
- The app must backup the database periodically in `~/Desktop/Vault/Backups/DMM OS/DB`

**One-time setup required**: `better-sqlite3` is a native module and requires `electron-rebuild` to compile against the Electron version. Checkout RxDB: https://github.com/pubkey/rxdb (free version only)

---

## 4. Data model

### Contacto

- **Category**: cold lead · hot lead · active client · inactive client
- **Capture**: name, company, email, phone/whatsapp, address, notes
- **Derived** (read only): date, quotes (Cotización), projects (Proyecto), payments, pending payments, total value
- **Actions**: save, edit, delete, new quote (Nueva Cotización)

**Status change** — automatic except for one click:

| Status | Requirement |
|---|---|
| cold lead | no quotes, or all rejected/expired |
| hot lead | has a quote *sent* |
| active client | has an *active* or *paused* project |
| inactive client | was an active client, with no active project |

The only transition in the records that isn't automatic is marking a quote as **accepted**—the step between "sent" and the first invoice is up to me. Everything else happens automatically.

### Cotización

- **Category**: website · ecommerce · app · ai · marketing · other
- **Status**: draft · sent · accepted · rejected · cancelled · expired
- **Info**: id, contact (Contacto), date, validity, currency, items, stack, tax, total, billing, terms, estimated costs, notes
- **Actions**: save, edit, delete, new project (Nuevo Proyecto)

`currency` by default is MXN, can be USD, but even if a quote lists USD as the currency, the income is always recorded in MXN; that is how it appears in the bank account. `validity` default is 30 days. `estimated costs` are never revealed to the contact and are exclusive to the quote, and must register in finance (Finanzas) section too. When a hot lead accepts the quote, they become active clients. When a lead/client accepts a quote, the project is created, the pending payment in finance (Finanzas) and, if there is an estimated cost, add the new costs in finance (Finanzas) too. If a quote is cancelled after being accepted, the project it created must be cancelled too, and vice versa. A quote can have multiple projects. Installment payments may be possible.

### Proyecto

A project serves as the **container per client**; the actual work takes place within its *engagements*. A client can have many projects. A single project can simultaneously include a design and ongoing monthly maintenance, each with its own status and billing. 

- **Category**: website · ecommerce · app · ai · marketing · other
- **Tag**: client · personal
- **Status**: in progress, paused, completed, cancelled
- **Info**: contact (Contacto), quote (Cotización), disk folder, start date, due date, end date, notes
- **Actions**: save, edit, delete

Some clients are agencies or independen workers with their own clients, for example, Estudio Ocho is a digital marketing agency with multiple projects: Hospital Jardín and B-Genius. Personal projects do not belong to a client and do not have a quote, but they can generate income and expenses and can show in the KPIs. If a project is cancelled after being created, the quote it was created from must be cancelled too. A project is not considered complete until the full amount has been paid.

### Ingreso
- **Category**: invoice · no invoice
- **Status**: pending · paid · cancelled · uncollectible
- **Info**: amount, project (Proyecto), quote (Cotización), contact (Contacto), registration date, payment date, CFDI
- **Actions**: save, edit, delete

`pending` income feeds into `pending payments` in contacts (Contacto).

**Recurring revenue.** A quote with `billing: monthly` is the exact mirror image of the recurring cost: the definition resides within the accepted quote and **generates a period-dated `Ingreso` entry**, which remains *pending* until marked as paid. This makes it possible to project monthly revenue before invoicing, compare recurring revenue against project-based revenue and keep a client as active.

### Costo
- **Category**: one-time · monthly · msi (installments) · annual
- **Status**: pending · paid · cancelled
- **Info**: amount, supplier, reference, payment date

**Recurring costs cannot be a single record.** A `category: monthly` entry as a single row leaves finance (Finanzas) with nothing to display for the next months. They are modeled at two levels:

**Recurring cost** (definition: Claude Max, $100, monthly, 5th of the month, active since March) → **generates a dated `Costo` per period**, pending until marked as paid.

**Installments costs cannot be a single record.** A `category: msi` entry as a single row leaves finance (Finanzas) with nothing to display for the next months. They are modeled at two levels:

**Installments cost** (definition: MacBook Pro, 18 installments of $2,500, total $45,000, 12th month, 6 months pending) → **generates a dated `Costo` per month**, pending until marked as paid.

---

## 5. Sections

### Panel de Control

Current business status, not sure about the name ('Panel de Control', 'Inicio' or 'Dashboard'): 

- **Stat cards**: this month's projected income, this month's actual income, difference between actual and projected income, this month's costs, this month's profit
- **Tables**: collections (current month and overdue), outstanding costs, projects (in progress), quotes (draft and sent)
- **Tabs**: the first tab with a to-do list (task, registered date, mark as done or delete), where I can add tasks; the second tab has a list of done tasks in the last 30 days (task, registered date, done date)

**Actions**: new contact · new quote · new project. These are the only three data entry points, and that is what keeps the system consistent.

### Contactos

- **Stat cards**: cold leads, hot leads, active clients, inactive clients, total contacts
- **Tables**: all contacts, in ascending order, organized by name, with email and phone number, and filterable by status.
- **Lists**: top 10 clients by value (revenue concentration by client)

**Actions**: new · edit · delete · search · export

The contact record displays the info and complete history: the date it was registered, every quote, project and payment (pending payments too), the total value the contact represents, plus the files already residing in `Clients/<name>/` and notes. Currently, that history is scattered across three top-level folders; this specific view does not exist at all. I should be able to export as CSV the contact list, so I can upload them to a newsletter service.

### Cotizaciones

- **Stat cards**: total quotes, sent quotes, conversion rate, outstanding amount in open quotes, average value
- **Charts**: pie or doughnut chart of quote categories (website · ecommerce · app · ai · marketing · other)
- **Tables**: all quotes, in descending order, organized by reference number and filterable by client, year, category, and status

**Actions**: new · edit · delete · search

Creating a new quote here generates a PDF and archives it. There must be a products/services catalog with prices from which the quote generator can retrieve the information. The quote record displays all its info and links to its PDF file.

### Proyectos

- **Stat cards**: in progress projects, paused projects, cancelled projects, completed projects, total projects
- **Charts**: pie or doughnut chart of project categories (website · ecommerce · app · ai · marketing · other)
- **Tables**: all projects, in descending order, organized by reference number and filterable by client, year, category, and status

**Acciones**: new · edit · delete · search

When a new project is created, the system should scaffold the project subfolder in the `Proyectos` folder. The project record displays all its info and each project links to its actual folder on the disk.

### Lab

View of `Lab/` — The output from Claude Desktop projects lands here. For now, only Benchmarks has some files, but Design Systems, Newsletter and Social Media will have some output soon. There are more folders that I would like to add later. And we will add or change it's functions in a later version.

Read-only: view, open, search

### AI

Select between This-month (default) and All time, I have CC Usage for API costs and RTK-AI for token savings:

- **Stat cards**: total tokens, tokens saved, aproximate token API costs, subscriptions costs, ai projects revenue, ai income
- **Charts**: bar chart models vs token usage (all models used through time, for example, claude: haiku, sonnet, opus, fable; openai: luna, terra, sol, astra), show token usage and API costs in tooltip
- **Tables**: Subscriptions table, this is not a new table. It is a **filtered view of `Cost`** where the provider is an AI related vendor. A single source, two lenses; manual expenses fall into the same table by definition. All AI projects table, in ascending order, organized by name and filterable by reference number, client, year, category, token usage and status (personal AI projects won't have a reference number, instead of client they will say 'personal')

AI subscription costs are prorated across all projects based on token usage; any unallocated difference is simply noted. For example, in April 2026 (first Claude Pro payment) there was only one project (Aura), the $20 usd ($340.85 mxn) would be designated to this project; next month, another AI project was created (Netdeckr), so that month's $20 usd subscription should be prorrated between those two projects based on each project token usage. If there's no data available, just split the difference.

The ai project record displays all its info with models used, tokens used, aproximate API costs and real costs; each project links to its actual folder on the disk.

**Agents and Skills**: read-only, a collection of agents and skills that I am testing or using, copying them manually (for the time being) to their respective projects.

### Finanzas

Select between This month (default), This quarter, This year, Last 5 years and All time; all this compared to last year's/period data (except All time), for example, this year's Q2 against last year's Q2:

- **Stat cards**: total revenue (invoice and no invoice), costs, profit in the specified period, compared with last year's same period
- **Charts**: line chart of income vs costs in the specified period, compared with last year's same period
- **Tables**: collected (current and overdue), outstanding costs
- **Lists**: upcoming payment dates (subscriptions, hosting, credit card, etc)

**Actions**: new income · new cost · cancel · delete · search

Revenue (imported CFDI + no invoice revenue) vs. costs (received CFDI + recurring + manual, including AI subscriptions).

**Important**: Informal, non-accounting: no general ledger, no bank accounts, no tax logic. Just the shape of money.

**Facturas**: read-only, a link to the `Facturas/` folder.

> **Data warning**: Income data is reliable from 2017 onwards. Imported expense data is only available for 2022, 2023, and 2026. Until that gap is filled or expenses are entered manually, the app displays income reliably but shows the margin with a visible warning instead of an incorrect figure.

### Marketing

Business marketing data, like website analytics, social media stats, etc. Not yet ready, maybe in a later version.

### Configuration

Settings section, not sure what should be in here:

- **Catalog**: products and services for default quote values
- **Paths**: project and external HDD folders
- **Export**: Database backup in `~/Desktop/Vault/Backups/DMM OS/DB` every week (set time period), and how many backups should be kept.
- **Import**: initial import control and re-scanning
- **Logs**: results of each run—errors, what was found, matched, guessed, and what could not be located

---

## 6. Import mapping

| Origen | Destino |
|---|---|
| `Facturas/Emitidas/**/*.xml` | **Ingreso**, invoice type — UUID, date, amount, client's RFC |
| `Facturas/Recibidas/**/*.xml` | **Costo**, single, monthly and anual types — with supplier |
| `Cotizaciones/**/*.pdf` | **Cotización** — reference number and client from the filename; project(s) name inside; inferred status |
| `Clientes/*` | **Contacto** — plus brand and associated documents |
| `Proyectos/*` | **Proyecto** — deduplicated against the client names from the quotes, some projects belong to a different named client |

**Inferred quote statuses**: if there is a subsequent invoice for the same client → *accepted*; if it is old and was never invoiced → *expired*. If not sure, ask. They are checked once under `Settings → Logs` and never again.

**Mandatory standardization**: names vary across folders and files—"Circulo Medio" / "Círculo Medio", "PROCRECE" / "Procrece", "Sonrieme" / "Sonríeme"—. A canonical contact record keyed required wherever available. I get that the spanish languaje makes it difficult with the accent mark and other characters. I guess the files and folders should not use this characters but te content must use them, for example, "Sonrieme" in the file or folder name is fine, but in the quote content it must be "Sonríeme".

**Known discrepancy**: 70 projects versus 31 clients. ~39 projects lack a client folder: these are past clients, belong to another client, or internal work. They can be resolved during the post-import review.

---

## 7. Open decisions

1. The full list of contacts is not ready yet.
2. Not sure what to do when a quote has two or more projects, should I do one quote per project instead?
3. Although the currency may be MXN or USD, it must always be presented in MXN for the KPIs. But not sure how complicated is it to verify the dollar exchange rate. And most USD expenses reflect as MXN in my bank account but not in the `Facturas/Recibidas` folder.
4. **Gastos 2017–2021, 2024, 2025**: What to do What to do while files are being copied and costs are rebuilt?
5. Not sure if the products/services catalog should live in quotes (Cotizaciones) or in settings (Configuración)?
6. **`Entrada/`**: loose items without triage. Does the app handle them, are they sorted manually beforehand or leave as-is?
7. Should I be able to import contacts (CSV)?
8. **Cotización naming convention**: today `DMM - <folio> - <Cliente>.pdf`, but it will change to `<YYMMDD>-DMM<ID>-<Proyecto>.pdf`. `<ID>` will continue `<folio>` numbering, but not sure how this will affect the mapping. Don't want to break the id/folio as an idempotent key.
9. The way some monthly/msi costs work may be complicated, for example, a hosting service:

### In general

1. All tables and lists must show a maximun of 10 items and have pagination 
2. All delete actions must show a confirmation modal
3. There's a hifi mockup for the dashboard in '/Users/franciscovenegas/Desktop/DMM OS/App/hifi' that we can follow for the front-end design
