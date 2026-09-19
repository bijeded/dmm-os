import { describe, expect, it } from 'vitest'
import { leerCfdi } from './cfdi'
import { cfdiXml } from './test-cfdi'

describe('leerCfdi', () => {
  it('reads the UUID, date and parties of a CFDI', () => {
    const cfdi = leerCfdi(cfdiXml())
    expect(cfdi.uuid).toBe('a1b2c3d4-0000-4444-8888-99aabbccddee')
    expect(cfdi.fecha).toBe('2026-02-03')
    expect(cfdi.emisor).toEqual({ rfc: 'DMM170101AB1', nombre: 'DMM STUDIOS SA DE CV' })
    expect(cfdi.receptor).toEqual({ rfc: 'EOC180202XY9', nombre: 'ESTUDIO OCHO SA DE CV' })
    expect(cfdi.descripcion).toBe('Diseño de sitio web')
  })

  it('reads amounts as centavos, IVA apart from the subtotal', () => {
    expect(leerCfdi(cfdiXml())).toMatchObject({ subtotal: 100_000, iva: 16_000, total: 116_000 })
  })

  it('treats a CFDI without transferred taxes as having no IVA', () => {
    expect(leerCfdi(cfdiXml({ iva: '0.00' }))).toMatchObject({ subtotal: 100_000, iva: 0, total: 100_000 })
  })

  it('takes a Descuento off the subtotal', () => {
    expect(leerCfdi(cfdiXml({ descuento: '250.00', iva: '120.00' }))).toMatchObject({
      subtotal: 75_000,
      iva: 12_000,
      total: 87_000
    })
  })

  it('reads a CFDI without retenciones as having none', () => {
    expect(leerCfdi(cfdiXml())).toMatchObject({ iva: 16_000, retenciones: 0, total: 116_000 })
  })

  it('keeps IVA and retenciones apart; the total is what the bank sees', () => {
    expect(leerCfdi(cfdiXml({ retenciones: '206.67' }))).toMatchObject({
      subtotal: 100_000,
      iva: 16_000,
      retenciones: 20_667,
      total: 95_333
    })
  })

  it('never makes IVA negative when more is withheld than charged', () => {
    expect(leerCfdi(cfdiXml({ iva: '160.00', retenciones: '266.67' }))).toMatchObject({
      iva: 16_000,
      retenciones: 26_667,
      total: 89_333
    })
  })

  it('converts retenciones on a foreign-currency CFDI and nets them from the original amount', () => {
    expect(
      leerCfdi(cfdiXml({ moneda: 'USD', tipoCambio: '18.50', subtotal: '100.00', iva: '16.00', retenciones: '10.00' }))
    ).toMatchObject({ subtotal: 185_000, iva: 29_600, retenciones: 18_500, total: 196_100, montoOriginal: 10_600 })
  })

  it('converts a foreign-currency CFDI to MXN and keeps the original amount', () => {
    expect(leerCfdi(cfdiXml({ moneda: 'USD', tipoCambio: '18.50', subtotal: '100.00', iva: '16.00' }))).toMatchObject({
      subtotal: 185_000,
      iva: 29_600,
      total: 214_600,
      moneda: 'USD',
      montoOriginal: 11_600
    })
  })

  it('leaves the original amount off a CFDI already in MXN', () => {
    expect(leerCfdi(cfdiXml())).toMatchObject({ moneda: 'MXN', montoOriginal: null })
  })

  it('reports the type of voucher so pagos are not read as income', () => {
    expect(leerCfdi(cfdiXml()).tipo).toBe('I')
    expect(leerCfdi(cfdiXml({ tipo: 'P' })).tipo).toBe('P')
  })

  it('rejects a file that is not a stamped CFDI', () => {
    expect(() => leerCfdi('<html><body>no</body></html>')).toThrow(/no es un CFDI/)
    expect(() =>
      leerCfdi(
        `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Fecha="2026-02-03T12:00:00" SubTotal="1" Total="1"/>`
      )
    ).toThrow(/sin timbre/)
  })
})
