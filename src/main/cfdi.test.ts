import { describe, expect, it } from 'vitest'
import { leerCfdi } from './cfdi'

const comprobante = (attrs: string, extra = '') => `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" ${attrs}>
  <cfdi:Emisor Rfc="DMM170101AB1" Nombre="DMM STUDIOS SA DE CV" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="EOC180202XY9" Nombre="ESTUDIO OCHO SA DE CV" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="81112100" Cantidad="1" Descripcion="Diseño de sitio web" ValorUnitario="1000.00" Importe="1000.00"/>
  </cfdi:Conceptos>
  ${extra}
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="A1B2C3D4-0000-4444-8888-99AABBCCDDEE" FechaTimbrado="2026-02-03T12:00:05"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`

const impuestos = '<cfdi:Impuestos TotalImpuestosTrasladados="160.00"/>'

const emitida = comprobante(
  'Fecha="2026-02-03T12:00:00" TipoDeComprobante="I" Moneda="MXN" SubTotal="1000.00" Total="1160.00"',
  impuestos
)

describe('leerCfdi', () => {
  it('reads the UUID, date and parties of a CFDI', () => {
    const cfdi = leerCfdi(emitida)
    expect(cfdi.uuid).toBe('a1b2c3d4-0000-4444-8888-99aabbccddee')
    expect(cfdi.fecha).toBe('2026-02-03')
    expect(cfdi.emisor).toEqual({ rfc: 'DMM170101AB1', nombre: 'DMM STUDIOS SA DE CV' })
    expect(cfdi.receptor).toEqual({ rfc: 'EOC180202XY9', nombre: 'ESTUDIO OCHO SA DE CV' })
    expect(cfdi.descripcion).toBe('Diseño de sitio web')
  })

  it('reads amounts as centavos, IVA apart from the subtotal', () => {
    expect(leerCfdi(emitida)).toMatchObject({ subtotal: 100_000, iva: 16_000, total: 116_000 })
  })

  it('treats a CFDI without transferred taxes as having no IVA', () => {
    const sinIva = comprobante(
      'Fecha="2026-02-03T12:00:00" TipoDeComprobante="I" Moneda="MXN" SubTotal="1000.00" Total="1000.00"'
    )
    expect(leerCfdi(sinIva)).toMatchObject({ subtotal: 100_000, iva: 0, total: 100_000 })
  })

  it('converts a foreign-currency CFDI to MXN and keeps the original amount', () => {
    const usd = comprobante(
      'Fecha="2026-02-03T12:00:00" TipoDeComprobante="I" Moneda="USD" TipoCambio="18.50" SubTotal="100.00" Total="116.00"',
      '<cfdi:Impuestos TotalImpuestosTrasladados="16.00"/>'
    )
    expect(leerCfdi(usd)).toMatchObject({
      subtotal: 185_000,
      iva: 29_600,
      total: 214_600,
      montoOriginal: 11_600,
      monedaOriginal: 'USD'
    })
  })

  it('leaves the original amount off a CFDI already in MXN', () => {
    expect(leerCfdi(emitida).montoOriginal).toBeNull()
  })

  it('reports the type of voucher so egresos are not read as income', () => {
    expect(leerCfdi(emitida).tipo).toBe('I')
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
