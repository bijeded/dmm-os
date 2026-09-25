import { XMLParser } from 'fast-xml-parser'
import { TASA_IVA } from '../shared/montos'

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
  /** `PUE` paid in one go, `PPD` paid in parts or later; `null` on vouchers that carry none. */
  metodoPago: string | null
  /** UUIDs this CFDI replaces (CfdiRelacionados with TipoRelacion `04`), lowercase. */
  sustituye: string[]
  /** The payments a complemento de pago (tipo `P`) records; empty on any other voucher. */
  pagos: PagoCfdi[]
}

/** One invoice's share of a complemento de pago, in the invoice's own currency (MonedaDR). */
export interface PagoCfdi {
  /** The paid invoice's UUID, lowercase. */
  uuidFactura: string
  /** NumParcialidad: which payment of that invoice this is, from 1. */
  parcialidad: number
  /** FechaPago, 'YYYY-MM-DD'. */
  fecha: string
  /** ImpPagado, in centavos of the invoice's currency. */
  pagado: number
  /** ImpSaldoInsoluto, in centavos of the invoice's currency: what the invoice still owes after it. */
  saldo: number
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

/** Every element or repeat of `valor`, whichever way the parser collapsed it. */
function todos(valor: unknown): Nodo[] {
  if (valor === undefined || valor === null) return []
  return (Array.isArray(valor) ? valor : [valor]) as Nodo[]
}

/** Every `nombre` element under every `padre`. */
function hijos(padre: unknown, nombre: string): Nodo[] {
  return todos(padre).flatMap((p) => todos(p[nombre]))
}

/** IVA is 0 or 16% of the subtotal to within a centavo; anything else is returned as a percent. */
function tasaInusual(subtotal: number, iva: number): number | null {
  if (iva === 0 || Math.abs(iva - subtotal * TASA_IVA) <= 1) return null
  // IVA on a zero subtotal has no rate, and is as unusual as it gets.
  return subtotal === 0 ? 100 : Math.round((iva / subtotal) * 10_000) / 100
}

/** Reads one CFDI XML. Throws when the file is not a stamped CFDI. */
export function leerCfdi(xml: string): Cfdi {
  const cfdi = leerXml(xml)
  if (!cfdi) throw new Error('El archivo no es un CFDI')
  return cfdi
}

/**
 * Reads one XML from the Facturas folders. `null` means it is a well-formed document that is not a
 * CFDI at all (e.g. a CEP bank receipt), which is nothing to report. Throws when the file is not
 * well-formed XML, or is a CFDI without its timbre fiscal: those are real problems with an invoice.
 */
export function leerXml(xml: string): Cfdi | null {
  let documento: Nodo
  try {
    documento = parser.parse(xml, true)
  } catch {
    throw new Error('El archivo no es XML válido')
  }
  const comprobante = primero(documento?.Comprobante)
  if (!comprobante) return null

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
  // The same amounts in the CFDI's own currency, where the SAT's centavo rounding happened.
  const enOriginal = (valor: unknown) => centavos(valor, 1)
  const subtotalOriginal = enOriginal(comprobante.SubTotal) - enOriginal(comprobante.Descuento)
  const ivaOriginal = enOriginal(impuestos?.TotalImpuestosTrasladados)
  const original = () => subtotalOriginal + ivaOriginal - enOriginal(impuestos?.TotalImpuestosRetenidos)

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
    tasaIvaInusual: tasaInusual(subtotalOriginal, ivaOriginal),
    moneda,
    montoOriginal: moneda === 'MXN' ? null : original(),
    metodoPago: comprobante.MetodoPago === undefined ? null : String(comprobante.MetodoPago),
    sustituye: todos(comprobante.CfdiRelacionados)
      .filter((r) => String(r.TipoRelacion) === '04')
      .flatMap((r) => todos(r.CfdiRelacionado).map((c) => String(c.UUID).toLowerCase())),
    pagos: hijos(hijos(comprobante.Complemento, 'Pagos'), 'Pago').flatMap((pago) =>
      todos(pago.DoctoRelacionado).map((d) => ({
        uuidFactura: String(d.IdDocumento).toLowerCase(),
        parcialidad: Number(d.NumParcialidad ?? 1),
        fecha: String(pago.FechaPago ?? '').slice(0, 10),
        pagado: centavos(d.ImpPagado, 1),
        saldo: centavos(d.ImpSaldoInsoluto, 1)
      }))
    )
  }
}

function parte(p: Nodo | undefined): Parte {
  return { rfc: String(p?.Rfc ?? ''), nombre: p?.Nombre === undefined ? null : String(p.Nombre) }
}
