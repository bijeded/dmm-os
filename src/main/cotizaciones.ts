/**
 * Reading a Cotización off its archived PDF. The Folio is the single continuous number across
 * the old `DMM - <folio> - <Nombre>.pdf` and the new `<YYMMDD>-DMM<folio>-<Proyecto>.pdf`
 * naming, which is what makes importing the folder idempotent.
 */

/** What the filename alone says about a Cotización. */
export interface NombreCotizacion {
  folio: number
  /** The letter distinguishing two quotes that share a Folio (`475a`, `475b`). */
  sufijo: string | null
  /** The Contacto or Proyecto the quote is for, spelled as the file spells it. */
  nombre: string
  /** `YYYY-MM-DD`, only the new format carries it. */
  fecha: string | null
}

// `DMM - 475a- SMPP.pdf`: the spacing around the separators drifted over the years.
const ANTIGUO = /^DMM\s*-\s*(\d+)([a-z])?\s*-\s*(.+)$/i
// `260114-DMM520b-Hospital Jardín.pdf`
const NUEVO = /^(\d{2})(\d{2})(\d{2})\s*-\s*DMM\s*(\d+)([a-z])?\s*-\s*(.+)$/i

/** `null` for any file that is not an archived Cotización. */
export function leerNombreArchivo(archivo: string): NombreCotizacion | null {
  const sinExtension = archivo.match(/^(.+)\.pdf$/i)?.[1]
  if (!sinExtension) return null

  const nuevo = sinExtension.match(NUEVO)
  if (nuevo) {
    const [, yy, mm, dd, folio, sufijo, nombre] = nuevo
    return {
      folio: Number(folio),
      sufijo: sufijo?.toLowerCase() ?? null,
      nombre: nombre.trim(),
      fecha: `20${yy}-${mm}-${dd}`
    }
  }

  const antiguo = sinExtension.match(ANTIGUO)
  if (!antiguo) return null
  const [, folio, sufijo, nombre] = antiguo
  return {
    folio: Number(folio),
    sufijo: sufijo?.toLowerCase() ?? null,
    nombre: nombre.trim(),
    fecha: null
  }
}

/**
 * A legacy Cotización sometimes lists several projects in one name. The first becomes the
 * Proyecto; the rest are kept so they can go in its notes. Nothing is ever split into
 * several Proyectos: one Cotización produces at most one.
 */
export function nombresDeProyecto(nombre: string): string[] {
  return nombre
    .split(/\s*[+/,]\s*|\s+y\s+/)
    .map((n) => n.trim())
    .filter((n) => n !== '')
}
