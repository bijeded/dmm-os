import { describe, expect, it } from 'vitest'
import { categoriaDeServicio, cotizacionDePdf, leerPdfCotizacion, partidasDelMonto } from './pdf-cotizacion'

/** A quote in the legacy template: date, opening, the given service blocks, closing, Atención and Asunto. */
const plantilla = (bloques: string[], { fecha = 'Ciudad de México, 29 de octubre, 2021.', asunto = 'Video “Curso”.' } = {}) =>
  [
    fecha,
    'Por medio de la presente, le extiendo un cordial saludo y aprovecho la oportunidad para',
    'presentar la siguiente información:',
    ...bloques,
    '• No incluye IVA.',
    'Sin otro particular por el momento, quedo a sus órdenes.',
    'Atención:',
    'Claudia Morales.',
    'Flor de Letras.',
    'Asunto:',
    asunto
  ].join('\n')

const leer = (bloques: string[], opciones: Parameters<typeof plantilla>[1] = {}, anio = 2021) =>
  leerPdfCotizacion(plantilla(bloques, opciones), anio)
const cotizacion = (bloques: string[], opciones: Parameters<typeof plantilla>[1] = {}, anio = 2021) =>
  cotizacionDePdf(leer(bloques, opciones, anio), 'Flor de Letras')

describe('leerPdfCotizacion: fecha', () => {
  it('reads the Ciudad de México date line', () => {
    expect(leer([]).fecha).toBe('2021-10-29')
  })

  it('matches months regardless of case and accents, and setiembre', () => {
    expect(leer([], { fecha: 'Ciudad de México, 3 de MARZO, 2021.' }).fecha).toBe('2021-03-03')
    expect(leer([], { fecha: 'Ciudad de México, 5 de setiembre de 2021.' }).fecha).toBe('2021-09-05')
    expect(leer([], { fecha: 'Ciudad de México, 11de marzo, 2021.' }).fecha).toBe('2021-03-11')
  })

  it('reads the date of a quote written in English', () => {
    expect(leer([], { fecha: 'Mexico City, March 3, 2021.' }).fecha).toBe('2021-03-03')
  })

  it("keeps the day and month of last year's date typed in January, in the folder's year", () => {
    const pdf = leer([], { fecha: 'Ciudad de México, 21 de enero, 2021.' }, 2022)
    expect(pdf.fecha).toBe('2022-01-21')
    expect(pdf.añoCorregido).toBe(true)
  })

  it('moves 29 de febrero to the 28th in a year that has none', () => {
    expect(leer([], { fecha: 'Ciudad de México, 29 de febrero, 2020.' }, 2021).fecha).toBe('2021-02-28')
  })

  it('is null with no date line', () => {
    const pdf = leer([], { fecha: 'Presupuesto' })
    expect(pdf.fecha).toBeNull()
    expect(pdf.añoCorregido).toBe(false)
  })
})

describe('leerPdfCotizacion: price lines', () => {
  it('labels a price with its service line, footnote mark and colon removed', () => {
    const pdf = leer(['Video “Curso” : Elaboración de video:1', '• Guion.', 'Costo: $ 3,000.00'])
    expect(pdf.lineas).toEqual([{ etiqueta: 'Video “Curso” : Elaboración de video', monto: 300000, moneda: 'MXN', mxnImpreso: null, recurrente: false }])
    expect(pdf.proyecto).toBe('Curso')
  })

  it('takes the first service line of the block, not a sub-heading above the price', () => {
    const pdf = leer([
      'Sitio web “Citli Tours” : diseño y desarrollo:',
      '• Diseño web.',
      'Requisitos:',
      '• Hosting.',
      'de página web:',
      'Costo: $ 18,000.00',
      'Servicio webmaster: administración del sitio.',
      'Costo: $ 2,000.00 mensuales'
    ])
    expect(pdf.lineas.map((l) => l.etiqueta)).toEqual(['Sitio web “Citli Tours” : diseño y desarrollo', 'Servicio webmaster: administración del sitio'])
  })

  it('accepts services starting with eBook or eCommerce', () => {
    expect(leer(['eBook “Meditaciones” : Diseño de libro electrónico:1', 'Costo: $ 5,000.00']).lineas[0].etiqueta).toBe(
      'eBook “Meditaciones” : Diseño de libro electrónico'
    )
  })

  it('reads Costo especial, Price and amounts without cents', () => {
    const pdf = leer(['Sitio web: diseño:', 'Costo especial: $ 12,500.00', 'Landing: diseño:', 'Price: $9,000', 'Extra: extra:', 'Costo: $1,500 pesos'])
    expect(pdf.lineas.map((l) => l.monto)).toEqual([1250000, 900000, 150000])
  })

  it('ignores Costo unitario and Costo extra', () => {
    expect(leer(['Sitio web: diseño:', 'Costo unitario: $ 8.06', 'Costo extra: + $ 200.00 USD']).lineas).toEqual([])
  })

  it('puts an amount printed before its label, or on the next line, back in order', () => {
    const pdf = leer(['Webmaster: soporte:', '$ 300.00 usd mensuales.Costo:', 'Campaña: anuncios:', 'Costo:', '$ 3,000.00 más comisión'])
    expect(pdf.lineas).toEqual([
      { etiqueta: 'Webmaster: soporte', monto: 30000, moneda: 'USD', mxnImpreso: null, recurrente: true },
      { etiqueta: 'Campaña: anuncios', monto: 300000, moneda: 'MXN', mxnImpreso: null, recurrente: false }
    ])
  })

  it('takes the Total under a price per cuartilla', () => {
    expect(leer(['eBook “Meditaciones” : libro:', 'Costo: $ 65.00 por cuartilla', 'Total: $ 2,990.00']).lineas[0].monto).toBe(299000)
  })

  it.each([
    'mensuales',
    'mensual.',
    'por mes',
    'x mes',
    'al mes',
    'anual',
    'por año',
    'por un año.',
    'por 1 año',
    'mensuales x 1 año',
    'trimestral',
    'per year',
    'monthly'
  ])('marks "%s" recurring', (palabras) => {
    expect(leer(['Webmaster: soporte:', `Costo: $ 2,000.00 ${palabras}`]).lineas[0].recurrente).toBe(true)
  })

  it.each(['por sitio', 'por evento', '*', ''])('keeps "%s" one-off', (palabras) => {
    expect(leer(['Webmaster: soporte:', `Costo: $ 2,000.00 ${palabras}`]).lineas[0].recurrente).toBe(false)
  })

  it('reads USD written usd, Dlls or US$, and the pesos printed beside it', () => {
    const pdf = leer(['A: a:', 'Costo especial: $ 260.00 USD ($5,000.00 MXN)', 'B: b:', 'Costo: US$800 Dlls.', 'C: c:', 'Costo: $ 1,000.00 mxn'])
    expect(pdf.lineas.map((l) => [l.moneda, l.monto, l.mxnImpreso])).toEqual([
      ['USD', 26000, 500000],
      ['USD', 80000, null],
      ['MXN', 100000, null]
    ])
  })

  it('says a quote offers alternatives only for numbered Opción or Paquete lines', () => {
    expect(leer(['Opción 1', 'Sitio: a:', 'Costo: $ 1.00']).opciones).toBe(true)
    expect(leer(['Paquete 2: básico:', 'Costo: $ 1.00']).opciones).toBe(true)
    expect(leer(['Sitio: a:', 'Costo: $ 1.00'], { asunto: 'Paquete “Abogados”.' }).opciones).toBe(false)
    expect(leer(['Sitio: a:', '• Opciones de pago:', 'Opcional.', 'Costo: $ 1.00']).opciones).toBe(false)
  })

  it('reads the Asunto on the line after its label', () => {
    expect(leer([]).asunto).toBe('Video “Curso”')
  })

  it('takes the project name from the first price line that quotes one', () => {
    const pdf = leer(['Servicio webmaster: soporte:', 'Costo: $ 1.00', 'eCommerce “3 Moon Wishes” : tienda:', 'Costo: $ 2.00'])
    expect(pdf.proyecto).toBe('3 Moon Wishes')
  })
})

describe('categoriaDeServicio', () => {
  it.each([
    ['eCommerce “3 Moon Wishes” : tienda', 'ecommerce'],
    ['Sitio web Tienda en Línea', 'ecommerce'],
    ['Web App “Reservas”', 'app'],
    ['Aplicación móvil “La Z 1310”', 'app'],
    ['Plataforma Web', 'app'],
    ['Sitio Web “Clínica Dental”', 'website'],
    ['Portal Web', 'website'],
    ['Landing page “rewrite.mx”', 'website'],
    ['Servicio Hosting + Webmaster', 'website'],
    ['Rediseño', 'website'],
    ['Campaña Google Ads', 'marketing'],
    ['Marketing Digital', 'marketing'],
    ['Redes Sociales', 'marketing'],
    ['Newsletter', 'marketing'],
    ['eBook “Recetas”', 'other'],
    ['Video “Curso”', 'other'],
    ['Capacitación', 'other'],
    ['Diseño “Apple Store”', 'other'],
    [null, 'other']
  ] as const)('%s → %s', (etiqueta, categoria) => {
    expect(categoriaDeServicio(etiqueta)).toBe(categoria)
  })
})

describe('cotizacionDePdf', () => {
  it('makes one item per price, quantity 1, recurring ones marked', () => {
    const q = cotizacion(['Sitio web “Hospital Jardín”: sitio:', 'Costo: $ 18,000.00', 'Servicio webmaster: soporte:', 'Costo: $ 2,000.00 mensuales'])
    expect(q.partidas).toEqual([
      { concepto: 'Sitio web “Hospital Jardín”: sitio', categoria: 'website', cantidad: 1, precio: 1800000 },
      { concepto: 'Servicio webmaster: soporte', categoria: 'website', cantidad: 1, precio: 200000, recurrente: true }
    ])
    // A one-off price with a recurring line: the one-off is the Monto, paid once.
    expect(q.monto).toBe(1800000)
    expect(q.enMonto).toEqual([0])
    expect(q.facturacion).toBe('unica')
  })

  it('adds up several one-off prices', () => {
    const q = cotizacion(['A: a:', 'Costo: $ 10,000.00', 'B: b:', 'Costo: $ 4,000.00'])
    expect(q.monto).toBe(1400000)
    expect(q.enMonto).toEqual([0, 1])
  })

  it('takes the lowest of numbered alternatives', () => {
    const q = cotizacion(['Opción 1', 'Sitio: completo:', 'Costo: $ 25,000.00', 'Opción 2', 'Sitio: básico:', 'Costo: $ 18,000.00'])
    expect(q.monto).toBe(1800000)
  })

  it('adds up a named package', () => {
    const q = cotizacion(['Identidad: logo:', 'Costo: $ 5,000.00', 'Sitio web: sitio:', 'Costo: $ 12,000.00'], { asunto: 'Paquete “Abogados”.' })
    expect(q.monto).toBe(1700000)
  })

  it('bills a quote with only recurring prices monthly, at the recurring amount', () => {
    const q = cotizacion(['Servicio webmaster: soporte:', 'Costo: $ 2,000.00 mensuales'])
    expect(q.monto).toBe(200000)
    expect(q.facturacion).toBe('mensual')
  })

  it('labels a price with no service line with the Asunto, or the name', () => {
    expect(cotizacion(['Costo: $ 1,000.00']).partidas[0].concepto).toBe('Video “Curso”')
    expect(cotizacion(['Costo: $ 1,000.00'], { asunto: '' }).partidas[0].concepto).toBe('Flor de Letras')
  })

  it('has no items, a Monto of 0 and says so when the PDF has no price', () => {
    const q = cotizacion(['Sitio web: sitio:'])
    expect(q).toMatchObject({ partidas: [], monto: 0, facturacion: 'unica', moneda: 'MXN', falta: ['precio'] })
  })

  it('says when the fecha is missing or its year was corrected', () => {
    expect(cotizacion(['A: a:', 'Costo: $ 1.00'], { fecha: 'Presupuesto' }).falta).toEqual(['fecha'])
    expect(cotizacion(['A: a:', 'Costo: $ 1.00'], { fecha: 'Ciudad de México, 2 de enero, 2020.' }).falta).toEqual(['año'])
  })

  it('imports a USD quote in USD, its rate from the pesos it prints', () => {
    const q = cotizacion(['Sitio: sitio:', 'Costo especial: $ 260.00 USD ($5,000.00 MXN)'])
    expect(q).toMatchObject({ moneda: 'USD', monto: 26000, tipoCambio: 19.2308 })
  })

  it('leaves a USD quote with no printed pesos without a rate', () => {
    expect(cotizacion(['Sitio: sitio:', 'Costo: $ 1,200.00 USD'])).toMatchObject({ moneda: 'USD', monto: 120000, tipoCambio: null })
  })

  it('imports a mixed quote in pesos, a USD price with no pesos listed but left out of the Monto', () => {
    const q = cotizacion(['Sitio: sitio:', 'Costo: $ 29,976.00', 'Plugin: licencia:', 'Costo: $ 1,245.00 USD'])
    expect(q.moneda).toBe('MXN')
    expect(q.tipoCambio).toBeNull()
    expect(q.partidas[1]).toMatchObject({ concepto: 'Plugin: licencia (USD)', precio: 124500, sinConvertir: true })
    expect(q.monto).toBe(2997600)
    expect(q.enMonto).toEqual([0])
  })

  it("counts a mixed quote's USD price at the pesos it prints", () => {
    const q = cotizacion(['Sitio: sitio:', 'Costo: $ 10,000.00', 'Plugin: licencia:', 'Costo: $ 260.00 USD ($5,000.00 MXN)'])
    expect(q.moneda).toBe('MXN')
    expect(q.monto).toBe(1500000)
  })

  it('takes its categoría from the first price line, else the Asunto', () => {
    expect(cotizacion(['Web App “Reservas”: app:', 'Costo: $ 1.00', 'Sitio web: sitio:', 'Costo: $ 1.00']).categoria).toBe('app')
    expect(cotizacion([], { asunto: 'Campaña Google Ads.' }).categoria).toBe('marketing')
    expect(cotizacion([], { asunto: '' }).categoria).toBe('other')
  })
})

describe('partidasDelMonto', () => {
  it('is the one-off partidas, or all when every one is recurring, never one it cannot count', () => {
    expect(partidasDelMonto([{ recurrente: true }, {}, {}])).toEqual([1, 2])
    expect(partidasDelMonto([{ recurrente: true }, { recurrente: true }])).toEqual([0, 1])
    expect(partidasDelMonto([{}, { sinConvertir: true }])).toEqual([0])
  })
})
