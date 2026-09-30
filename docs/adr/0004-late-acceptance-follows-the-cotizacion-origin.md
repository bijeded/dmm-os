# An Aceptación tardía follows the Cotización's origin

ADR-0002 exempts imported history from the lifecycle guards and says the guards govern transitions made in the app. Marking an expirada or rechazada Cotización aceptada (`aceptarTarde` in `src/main/aceptacion-tardia.ts`) is a transition made in the app, but what it records depends on where the Cotización came from, not on who triggers it.

A Cotización made in the app goes through the guard and records its Plan de cobro, dated today, exactly as Aceptada does. An imported one (`cotizaciones.importado`) records no Ingresos or Costos. It only links one of its Contacto's Proyectos with no Cotización, or builds a completado Proyecto the way the folder scan builds one for an accepted Cotización with no folder. It does not read the Mapa de nombres, so that Proyecto gets no Cliente final; an action on a Ficha should not fail on an unreadable map, and Editar sets the label. Most expiradas are legacy quotes that Al día expired because no folder was linked to them. A Plan de cobro on one would double-count against the Facturas run, which is ADR-0002's own reason.

The Proyecto it builds is marked imported, so Reimportar desde cero removes it instead of refusing. Like Fusionar Contacto, Cambiar Contacto and Asignar proyecto, the acceptance is an edit to imported records and is lost on reimport.

We rejected always recording the Plan de cobro, since it double-counts legacy income, and changing only the estado, since that leaves an aceptada Cotización with no Proyecto, which nothing else produces.

Accepting an imported *enviada* Cotización with Aceptada still records its Plan de cobro. Aligning it with this rule is a separate decision. `aceptacion-tardia.test.ts` and `reimportar.test.ts` pin this one.
