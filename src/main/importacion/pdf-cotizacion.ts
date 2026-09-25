import type { Categoria, FaltaPdf, Moneda, PartidaCotizacion } from '../../shared/dominio'

/**
 * Reading a legacy Cotización off the text of its PDF. Every quote from 2017 on uses one
 * template: a `Ciudad de México, D de mes, AAAA.` date, service lines such as
 * `Sitio web “Citli Tours” : diseño y desarrollo:` each followed by bullets and a
 * `Costo: $ 8,000.00` line, and an `Asunto:`. Pure: text in, what the Cotización should say out.
 */

/** One `Costo:` line of the PDF. Amounts in centavos, or US cents when `moneda` is USD. */
export interface LineaPrecio {
  /** The service line the price belongs to, footnote marks and trailing colon removed. */
  etiqueta: string | null
  monto: number
  moneda: Moneda
  /** The peso amount printed beside a USD one, as in `$ 260.00 USD ($5,000.00 MXN)`. */
  mxnImpreso: number | null
  /** Charged every month or year (`mensuales`, `por mes`, `por 1 año`…), not once. */
  recurrente: boolean
}

export interface PdfCotizacion {
  /** `YYYY-MM-DD`, in the year of the folder the file is filed under; `null` when the PDF has none. */
  fecha: string | null
  /** The PDF printed another year, and the folder's was used instead. */
  añoCorregido: boolean
  lineas: LineaPrecio[]
  /**
   * The quote offers numbered alternatives (`Opción 1`, `Paquete 2`) rather than adding them up.
   * A lone `Paquete “Abogados”` names the whole bundle, whose prices do add up.
   */
  opciones: boolean
  asunto: string | null
  /** The first project named in curly quotes on a price line's service line. */
  proyecto: string | null
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre'
]

/** Lowercase, without accents, for matching words the PDFs spell either way. */
const plano = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

const esViñeta = (l: string) => /^[•·\-–*]/.test(l)

// `Costo: $ 8,000.00 mensuales`, `Costo especial: US$260 Dlls.`, and `Price:` in the quotes
// written in English; `Costo unitario` and `Costo extra` are not prices.
const PRECIO = /^(?:Costo(?: especial)?|Price):\s*(US\s?\$|\$)\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?(.*)$/i
const RECURRENTE =
  /\b(mensual(es)?|por mes|x mes|al mes|anual(es)?|por (un |1 )?ano|x (un |1 )?ano|trimestral|monthly|per month|a month|yearly|annual(ly)?|per year|a year)\b/
const USD = /\b(usd|dlls?|dolares)\b/
const MXN_IMPRESO = /\(\s*\$\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?\s*(mxn|pesos)/i
// `Costo: $ 65.00 por cuartilla` is a unit price; the `Total: $ 2,990.00` under it is what was quoted.
const TOTAL = /^Total:\s*\$\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?/i
const NOMBRE_ENTRE_COMILLAS = /[“"]\s*([^“”"]+?)\s*[”“"]/
// Lines that carry a colon but never name a service.
const NO_ES_SERVICIO = /^(nota|costo|atencion|asunto|incluye|el costo|los costos|opcional|importante)\b/

const centavos = (enteros: string, decimales: string | undefined) =>
  Number(enteros.replace(/,/g, '')) * 100 + Math.round(Number(decimales ?? '0') * 100)

/**
 * PDF.js sometimes emits a price out of order: `$ 300.00 usd mensuales.Costo:`, or `Costo:` on
 * a line of its own with the amount on the next. Both are put back as one `Costo: …` line.
 */
function lineasOrdenadas(texto: string): string[] {
  const lineas = texto
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
  const r: string[] = []
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i]
    const alReves = l.match(/^(\$.*?)\s*((?:Costo(?: especial)?|Price):)\s*$/i)
    if (alReves) r.push(`${alReves[2]} ${alReves[1]}`)
    else if (/^(?:Costo(?: especial)?|Price):$/i.test(l) && /^(US\s?)?\$/.test(lineas[i + 1] ?? '')) r.push(`${l} ${lineas[++i]}`)
    else r.push(l)
  }
  return r
}

/** `Sitio web “Citli Tours” : agregar contenido:1` → `Sitio web “Citli Tours” : agregar contenido`. */
const limpiarEtiqueta = (l: string) => l.replace(/[\d\s]+$/, '').replace(/[\s:.]+$/, '').trim()

/**
 * The service line a price belongs to. A service block opens with it (`Sitio web “X” : …`,
 * `Soporte: …`), then bullets and sub-headings, then the price, so it is the first line after the
 * previous price that is not a bullet, starts with a capital, and has a colon after a short
 * label. Lowercase lines are the tail of a wrapped bullet or description.
 */
function etiquetaSobre(lineas: string[], i: number): string | null {
  let desde = i - 1
  while (desde >= 0 && !PRECIO.test(lineas[desde])) desde--
  for (let j = desde + 1; j < i; j++) {
    const l = lineas[j]
    // `eBook` and `eCommerce` are the lowercase starts a service may have.
    if (esViñeta(l) || !/^(\p{Lu}|e\p{Lu})/u.test(l)) continue
    const dosPuntos = l.indexOf(':')
    if (dosPuntos <= 0 || dosPuntos > 80 || NO_ES_SERVICIO.test(plano(l))) continue
    return limpiarEtiqueta(l)
  }
  return null
}

/** `29 de octubre, 2021`, or `October 29, 2021` in the quotes written in English. */
function fechaEn(linea: string): { dia: number; mes: number; año: number } | null {
  const l = plano(linea)
  const es = l.match(/\b(\d{1,2}) ?de ([a-z]+),? (?:del? )?(\d{4})\b/)
  if (es) return { dia: Number(es[1]), mes: MESES.indexOf(es[2] === 'setiembre' ? 'septiembre' : es[2]) + 1, año: Number(es[3]) }
  const en = l.match(/\b([a-z]+) (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})\b/)
  if (en) return { dia: Number(en[2]), mes: MONTHS.indexOf(en[1]) + 1, año: Number(en[3]) }
  return null
}

/**
 * The first date of the text. Quotes are filed by the year they were made, and a PDF dated in
 * another year is the previous year typed by habit in January (`20 de enero, 2020` filed under
 * 2021), so the folder's year wins and the day and month are kept.
 */
function leerFecha(lineas: string[], anio: number): { fecha: string; añoCorregido: boolean } | null {
  for (const l of lineas) {
    const f = fechaEn(l)
    if (!f || f.mes === 0 || f.dia < 1 || f.dia > 31) continue
    // A day the month does not have (`31 de febrero`, or the 29th moved to a common year) is its last.
    const dia = Math.min(f.dia, new Date(anio, f.mes, 0).getDate())
    return {
      fecha: `${anio}-${String(f.mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
      añoCorregido: f.año !== anio
    }
  }
  return null
}

function leerAsunto(lineas: string[]): string | null {
  const i = lineas.findIndex((l) => /^Asunto:/i.test(l))
  if (i === -1) return null
  const resto = lineas[i].replace(/^Asunto:\s*/i, '')
  return limpiarEtiqueta(resto || (lineas[i + 1] ?? '')) || null
}

/** `folderAnio` is the `Cotizaciones/<year>/` the file is filed under. */
export function leerPdfCotizacion(texto: string, folderAnio: number): PdfCotizacion {
  const lineas = lineasOrdenadas(texto)
  const precios: LineaPrecio[] = []
  lineas.forEach((l, i) => {
    const m = l.match(PRECIO)
    if (!m) return
    const [, signo, enteros, decimales, resto] = m
    const restoPlano = plano(resto)
    const impreso = resto.match(MXN_IMPRESO)
    const total = lineas[i + 1]?.match(TOTAL)
    precios.push({
      etiqueta: etiquetaSobre(lineas, i),
      monto: total ? centavos(total[1], total[2]) : centavos(enteros, decimales),
      moneda: /^US/i.test(signo) || USD.test(restoPlano.replace(MXN_IMPRESO, '')) ? 'USD' : 'MXN',
      mxnImpreso: impreso ? centavos(impreso[1], impreso[2]) : null,
      recurrente: RECURRENTE.test(restoPlano)
    })
  })
  const proyecto =
    precios.map((p) => p.etiqueta?.match(NOMBRE_ENTRE_COMILLAS)?.[1]).find((n) => n !== undefined && n !== '') ?? null
  const fecha = leerFecha(lineas, folderAnio)
  return {
    fecha: fecha?.fecha ?? null,
    añoCorregido: fecha?.añoCorregido ?? false,
    lineas: precios,
    opciones: lineas.some((l) => !esViñeta(l) && /^(opcion|paquete)\s*\d/.test(plano(l))),
    asunto: leerAsunto(lineas),
    proyecto
  }
}

/** The Categoría a service label means; the first rule that matches wins, so "Web App" is an app. */
const CATEGORIAS_DE_SERVICIO: [Categoria, RegExp][] = [
  ['ecommerce', /\be-?commerce\b|tienda en linea/],
  ['app', /\bweb app\b|\bapps?\b|aplicacion|plataforma/],
  ['website', /\bsitio\b|\bwebsite\b|\bportal\b|\blanding\b|webmaster|rediseno/],
  ['marketing', /campana|marketing|redes sociales|newsletter/]
]

/** The label part of a service line: what comes before its quoted name or colon. */
const etiquetaCorta = (etiqueta: string) => etiqueta.split(/[“":]/)[0]

export function categoriaDeServicio(etiqueta: string | null): Categoria {
  const texto = plano(etiquetaCorta(etiqueta ?? ''))
  return CATEGORIAS_DE_SERVICIO.find(([, re]) => re.test(texto))?.[0] ?? 'other'
}

/** What a legacy Cotización takes from its PDF. Money in the quote's currency, before IVA. */
export interface CotizacionDePdf {
  fecha: string | null
  partidas: PartidaCotizacion[]
  /** The partidas the Monto is made of: the one-off ones, or the recurring ones when there is no other. */
  enMonto: number[]
  monto: number
  facturacion: 'unica' | 'mensual'
  moneda: Moneda
  tipoCambio: number | null
  categoria: Categoria
  proyecto: string | null
  falta: FaltaPdf[]
}

/**
 * A Cotización's stored `items` as partidas. A row that took the column's default holds the
 * string "[]" rather than a list, and has none.
 */
export function partidasGuardadas(items: unknown): PartidaCotizacion[] {
  return Array.isArray(items) ? (items as PartidaCotizacion[]) : []
}

/**
 * Which partidas make the Monto: the one-off ones, or every one when all are recurring. A
 * partida priced in a currency the quote cannot count (`sinConvertir`) is never among them.
 */
export function partidasDelMonto(partidas: readonly Pick<PartidaCotizacion, 'recurrente' | 'sinConvertir'>[]): number[] {
  const contables = partidas.flatMap((p, i) => (p.sinConvertir ? [] : [i]))
  const unicas = contables.filter((i) => !partidas[i].recurrente)
  return unicas.length > 0 ? unicas : contables
}

/**
 * Items, Monto, facturación, currency and categoría of a legacy Cotización. `nombre` labels a
 * price the PDF gives no service line for, when it has no Asunto either.
 */
export function cotizacionDePdf(pdf: PdfCotizacion, nombre: string): CotizacionDePdf {
  const usd = pdf.lineas.length > 0 && pdf.lineas.every((l) => l.moneda === 'USD')
  const moneda: Moneda = usd ? 'USD' : 'MXN'
  const conImpreso = pdf.lineas.find((l) => l.moneda === 'USD' && l.mxnImpreso !== null)
  const tipoCambio = conImpreso ? Math.round((conImpreso.mxnImpreso! / conImpreso.monto) * 10000) / 10000 : null

  const partidas: PartidaCotizacion[] = pdf.lineas.map((l) => {
    const concepto = l.etiqueta ?? pdf.asunto ?? nombre
    // A USD price in a peso quote counts at the pesos it prints, else at the quote's printed rate.
    const enPesos = !usd && l.moneda === 'USD' ? (l.mxnImpreso ?? (tipoCambio ? Math.round(l.monto * tipoCambio) : null)) : l.monto
    return {
      concepto: enPesos === null ? `${concepto} (USD)` : concepto,
      categoria: categoriaDeServicio(l.etiqueta ?? pdf.asunto),
      cantidad: 1,
      precio: enPesos ?? l.monto,
      ...(l.recurrente && { recurrente: true }),
      ...(enPesos === null && { sinConvertir: true })
    }
  })

  const enMonto = partidasDelMonto(partidas)
  const precios = enMonto.map((i) => partidas[i].precio)
  const monto = precios.length === 0 ? 0 : pdf.opciones ? Math.min(...precios) : precios.reduce((s, p) => s + p, 0)
  const falta: FaltaPdf[] = []
  if (pdf.fecha === null) falta.push('fecha')
  if (pdf.añoCorregido) falta.push('año')
  // No price at all, or only ones in a currency the quote cannot count: either way no Monto.
  if (enMonto.length === 0) falta.push('precio')

  return {
    fecha: pdf.fecha,
    partidas,
    enMonto,
    monto,
    facturacion: enMonto.length > 0 && enMonto.every((i) => partidas[i].recurrente) ? 'mensual' : 'unica',
    moneda,
    tipoCambio: usd ? tipoCambio : null,
    categoria: categoriaDeServicio(pdf.lineas[0]?.etiqueta ?? pdf.asunto),
    proyecto: pdf.proyecto,
    falta
  }
}
