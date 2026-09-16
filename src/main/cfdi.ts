import { XMLParser } from 'fast-xml-parser'

/** A stamped CFDI, read into the shape the app records money in: MXN centavos, IVA apart. */
export interface Cfdi {
  uuid: string
  /** Emission date, 'YYYY-MM-DD'. */
  fecha: string
  /** `I` ingreso, `E` egreso (nota de crédito), `P` pago, `N` nómina, `T` traslado. */
  tipo: string
  emisor: Parte
  receptor: Parte
  /** First concepto's description; what the money was for. */
  descripcion: string
  subtotal: number
  iva: number
  total: number
  /** The total in its original currency, when that currency was not MXN. */
  montoOriginal: number | null
  monedaOriginal: 'USD' | null
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

function primero<T>(valor: T | T[] | undefined): T | undefined {
  return Array.isArray(valor) ? valor[0] : valor
}

/** Reads one CFDI XML. Throws when the file is not a stamped CFDI. */
export function leerCfdi(xml: string): Cfdi {
  const comprobante = parser.parse(xml)?.Comprobante as Record<string, never> | undefined
  if (!comprobante) throw new Error('El archivo no es un CFDI')

  const timbre = primero<Record<string, string>>(
    (primero<Record<string, never>>(comprobante.Complemento) ?? {})?.TimbreFiscalDigital
  )
  if (!timbre?.UUID) throw new Error('El CFDI viene sin timbre fiscal')

  const moneda = String(comprobante.Moneda ?? 'MXN')
  const tipoCambio = moneda === 'MXN' ? 1 : Number(comprobante.TipoCambio ?? 1)
  const impuestos = primero<Record<string, string>>(comprobante.Impuestos)
  const concepto = primero<Record<string, string>>(
    (primero<Record<string, never>>(comprobante.Conceptos) ?? {})?.Concepto
  )
  const emisor = primero<Record<string, string>>(comprobante.Emisor)
  const receptor = primero<Record<string, string>>(comprobante.Receptor)

  const subtotal = centavos(comprobante.SubTotal, tipoCambio)
  const iva = centavos(impuestos?.TotalImpuestosTrasladados, tipoCambio)

  return {
    uuid: String(timbre.UUID).toLowerCase(),
    fecha: String(comprobante.Fecha ?? '').slice(0, 10),
    tipo: String(comprobante.TipoDeComprobante ?? 'I'),
    emisor: parte(emisor),
    receptor: parte(receptor),
    descripcion: String(concepto?.Descripcion ?? ''),
    subtotal,
    iva,
    total: subtotal + iva,
    montoOriginal: moneda === 'MXN' ? null : centavos(comprobante.Total, 1),
    monedaOriginal: moneda === 'MXN' ? null : (moneda as 'USD')
  }
}

function parte(p: Record<string, string> | undefined): Parte {
  return { rfc: String(p?.Rfc ?? ''), nombre: p?.Nombre ?? null }
}
