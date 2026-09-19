import { XMLParser } from 'fast-xml-parser'

/** `I` ingreso, `E` egreso (nota de crédito), `P` pago, `N` nómina, `T` traslado. */
export const TIPOS_CFDI = ['I', 'E', 'P', 'N', 'T'] as const
export type TipoCfdi = (typeof TIPOS_CFDI)[number]

/** A stamped CFDI, read into the shape the app records money in: MXN centavos, IVA apart. */
export interface Cfdi {
  uuid: string
  /** Emission date, 'YYYY-MM-DD'. */
  fecha: string
  tipo: TipoCfdi
  emisor: Parte
  receptor: Parte
  /** First concepto's description; what the money was for. */
  descripcion: string
  /** SubTotal less any Descuento, in MXN centavos. */
  subtotal: number
  /** IVA charged (TotalImpuestosTrasladados), in MXN centavos. */
  iva: number
  /** Taxes withheld by the payer (TotalImpuestosRetenidos), in MXN centavos. */
  retenciones: number
  /** Subtotal + IVA − retenciones: what the bank sees. */
  total: number
  /** IVA as a percent of the subtotal, when it is neither 0 nor 16% (e.g. the 8% border rate). */
  tasaIvaInusual: number | null
  /** The currency the CFDI was issued in; 'MXN' unless it was a foreign invoice. */
  moneda: string
  /** The same total in its original currency, when that currency was not MXN. */
  montoOriginal: number | null
}

export interface Parte {
  rfc: string
  nombre: string | null
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', removeNSPrefix: true })

/** Decimal pesos as written in the CFDI → centavos. */
function centavos(valor: unknown, tipoCambio: number): number {
  return Math.round(Number(valor ?? 0) * tipoCambio * 100)
}

type Nodo = Record<string, unknown>

/** The parser gives a single element as an object and repeats as an array; this takes the first. */
function primero(valor: unknown): Nodo | undefined {
  return (Array.isArray(valor) ? valor[0] : valor) as Nodo | undefined
}

/** The first `hijo` element of `padre`, whichever way the parser collapsed repeats. */
function hijo(padre: unknown, nombre: string): Nodo | undefined {
  return primero(primero(padre)?.[nombre])
}

/** IVA is 0 or 16% of the subtotal to within a centavo; anything else is returned as a percent. */
function tasaInusual(subtotal: number, iva: number): number | null {
  if (iva === 0 || Math.abs(iva - subtotal * 0.16) <= 1) return null
  return subtotal === 0 ? null : Math.round((iva / subtotal) * 10_000) / 100
}

/** Reads one CFDI XML. Throws when the file is not a stamped CFDI. */
export function leerCfdi(xml: string): Cfdi {
  const comprobante = primero(parser.parse(xml)?.Comprobante)
  if (!comprobante) throw new Error('El archivo no es un CFDI')

  const timbre = hijo(comprobante.Complemento, 'TimbreFiscalDigital')
  if (!timbre?.UUID) throw new Error('El CFDI viene sin timbre fiscal')

  const moneda = String(comprobante.Moneda ?? 'MXN')
  const tipoCambio = moneda === 'MXN' ? 1 : Number(comprobante.TipoCambio ?? 1)
  const impuestos = primero(comprobante.Impuestos)
  const concepto = hijo(comprobante.Conceptos, 'Concepto')

  // Descuentos and retenciones are part of what the bank actually sees, so the total nets them;
  // IVA stays what was charged, retenciones what was withheld.
  const enPesos = (valor: unknown) => centavos(valor, tipoCambio)
  const subtotal = enPesos(comprobante.SubTotal) - enPesos(comprobante.Descuento)
  const iva = enPesos(impuestos?.TotalImpuestosTrasladados)
  const retenciones = enPesos(impuestos?.TotalImpuestosRetenidos)
  const original = () =>
    centavos(comprobante.SubTotal, 1) -
    centavos(comprobante.Descuento, 1) +
    centavos(impuestos?.TotalImpuestosTrasladados, 1) -
    centavos(impuestos?.TotalImpuestosRetenidos, 1)

  return {
    uuid: String(timbre.UUID).toLowerCase(),
    fecha: String(comprobante.Fecha ?? '').slice(0, 10),
    tipo: String(comprobante.TipoDeComprobante ?? 'I') as TipoCfdi,
    emisor: parte(primero(comprobante.Emisor)),
    receptor: parte(primero(comprobante.Receptor)),
    descripcion: String(concepto?.Descripcion ?? ''),
    subtotal,
    iva,
    retenciones,
    total: subtotal + iva - retenciones,
    // Judged in the CFDI's own currency, where the SAT's centavo rounding happened.
    tasaIvaInusual: tasaInusual(
      centavos(comprobante.SubTotal, 1) - centavos(comprobante.Descuento, 1),
      centavos(impuestos?.TotalImpuestosTrasladados, 1)
    ),
    moneda,
    montoOriginal: moneda === 'MXN' ? null : original()
  }
}

function parte(p: Nodo | undefined): Parte {
  return { rfc: String(p?.Rfc ?? ''), nombre: p?.Nombre === undefined ? null : String(p.Nombre) }
}
