# Proposal

## Why

Sometimes a Contacto takes a Cotización after its validity ran out, or after it was marked rechazada. Most expiradas are also legacy history: the folder scan imports every Cotización with no folder as *enviada*, and Al día expires it. Once a Cotización is expirada or rechazada, the app offers nothing but Cambiar Contacto, so a quote the client did take cannot be recorded as aceptada.

Intent: let the owner mark an expirada or rechazada Cotización as aceptada. What is recorded depends on where the Cotización came from.

## What Changes

- The Ficha de la Cotización offers **Marcar como aceptada…** on an expirada or rechazada Cotización that has no Proyecto. The action is called an Aceptación tardía.
- A Cotización made in the app is accepted exactly as a sent one is accepted today. Its Plan de cobro, dated hoy, is recorded: pending Ingresos or the monthly definition, and the estimated Costos. A Proyecto *en curso* is created with its folder. A USD Cotización asks for its tipo de cambio.
- An imported Cotización gets no Ingresos or Costos (ADR-0002). The dialog asks for its Proyecto: either one of its Contacto's Proyectos that has no Cotización, or a new *completado* Proyecto, built the way the folder scan builds one for an accepted Cotización with no folder. For a new Proyecto the app also asks a Sugerencia *ubicación*. A Cotización with two or more prices also gets a Sugerencia *partidas* ("¿Qué aceptó?").
- The Cotización stays aceptada afterwards; Al día never expires it again. Derived facts follow: Estado de Contacto, the Cotizaciones conversion rate, Cobros and Sin ingresos registrados.
- An Aceptación tardía of an imported Cotización counts as an edit to imported records. Reimportar desde cero removes the Proyecto it created and loses the acceptance, the same way it loses Fusionar Contacto corrections. The new Proyecto does not block the reimport.

## Non-goals

- Reopening a Cotización to *enviada*, or extending its validity
- Changing an aceptada or cancelada Cotización to another estado, or a free estado picker
- Undoing an Aceptación tardía other than by Cancelar cotización where that is already allowed
- Choosing an acceptance date other than hoy for a Cotización made in the app
- Changing how an imported *enviada* Cotización is accepted today (it still records its Plan de cobro)
- A Cliente final for the new Proyecto of an imported Cotización (set it from Editar)

## Capabilities

### New Capabilities
- `cotizaciones`: the Cotización lifecycle in the app. This change adds only the Aceptación tardía requirements.

### Modified Capabilities
<!-- none: existing specs keep their requirements -->

## Terms

- Touches: Cotización, Proyecto, Plan de cobro, Al día, Sugerencia de importación (*ubicación*, *partidas*), Reimportar desde cero, Estado de Contacto, Cobros, Sin ingresos registrados, Cancelación con pagos.
- Introduces: **Aceptación tardía**, marking an expirada or rechazada Cotización as aceptada.

## ADRs

The change applies ADR-0002 and extends it. The ADR says the lifecycle guards govern transitions made in the app. Here, a transition made in the app on an imported Cotización follows the exemption, because an imported record's origin decides what is recorded. A Plan de cobro on a legacy Cotización would double-count against the Facturas run, which is the reason ADR-0002 gives. A new ADR-0004 records this rule rather than rewriting ADR-0002.

## Impact

- `src/main/ciclo-cotizacion.ts`: new action `aceptarTarde`, allowed on expirada and rechazada
- `src/main/cotizar.ts`: acceptance split so the late path reuses the Plan de cobro
- New `src/main/aceptacion-tardia.ts`: the choices shown for an imported Cotización, and the late acceptance itself
- `src/main/importacion/carpetas.ts`: extracts the reusable steps that build a Proyecto for an accepted Cotización and ask *partidas*
- IPC: `cotizaciones.opcionesAceptarTarde` and `cotizaciones.aceptarTarde` in `src/shared/contrato.ts` and `src/main/handlers.ts`
- `src/renderer/src/components/FichaCotizacion.tsx`: the Marcar como aceptada… dialog
- `CONTEXT.md` (Aceptación tardía, Reimportar desde cero) and `docs/adr/0004-…`
