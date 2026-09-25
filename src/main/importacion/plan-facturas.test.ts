import { describe, expect, it } from 'vitest'
import { leerCfdi } from '../cfdi'
import { cfdiXml, complementoXml, type PagoXml } from '../test-cfdi'
import { enCarpetaCancelada, planearFacturas, type Lectura } from './plan-facturas'

const FACTURA = 'b08fcf62-e2e6-48a3-977f-ed0a05c25edc'
const OTRA = 'ea1cd75e-e1a4-448f-828a-1ea0ef784596'

const lectura = (archivo: string, xml: string): Lectura => ({ archivo, cfdi: leerCfdi(xml) })
const factura = (archivo: string, uuid: string, opciones: Parameters<typeof cfdiXml>[0] = {}) =>
  lectura(archivo, cfdiXml({ uuid, ...opciones }))
const pago = (parcialidad: number, fecha: string, pagado: string, saldo: string): PagoXml => ({
  factura: FACTURA,
  parcialidad,
  fecha,
  pagado,
  saldoAnterior: '0',
  saldo
})

describe('enCarpetaCancelada', () => {
  it('finds a cancel folder at any depth, ignoring case and accents', () => {
    expect(enCarpetaCancelada('Facturas/Emitidas/2023/07/Cancelación/a.xml')).toBe(true)
    expect(enCarpetaCancelada('Facturas/Emitidas/2019/02/comprobante de pago/cancelada/a.xml')).toBe(true)
    expect(enCarpetaCancelada('Facturas/Recibidas/2025/03/CANCELADAS/a.xml')).toBe(true)
  })

  it('does not read the file name or the Facturas folders themselves as a cancel folder', () => {
    expect(enCarpetaCancelada('Facturas/Emitidas/2020/05/cancelada.xml')).toBe(false)
    expect(enCarpetaCancelada('Facturas/Emitidas/2019/08/Comprobante de Pago/a.xml')).toBe(false)
  })
})

describe('planearFacturas', () => {
  it('leaves out a CFDI filed as cancelled, even when the same UUID sits in another folder too', () => {
    const plan = planearFacturas([
      factura('Facturas/Emitidas/2019/08/Canceladas/a.xml', OTRA),
      factura('Facturas/Emitidas/2019/08/a.xml', OTRA),
      factura('Facturas/Emitidas/2019/08/b.xml', FACTURA)
    ])
    expect(plan.canceladas).toEqual(new Map([[OTRA, 'carpeta']]))
    expect(plan.importar.map((l) => l.cfdi.uuid)).toEqual([FACTURA])
    expect(plan.omitidas).toEqual({ carpeta: 2, sustituida: 0 })
  })

  it('leaves out a CFDI that a kept CFDI replaces, whether or not its file is there', () => {
    const plan = planearFacturas([
      factura('Facturas/Emitidas/2020/05/a.xml', OTRA),
      factura('Facturas/Emitidas/2020/08/c.xml', 'c79a953d-d29f-4990-b91c-25d9a675c332', {
        sustituye: [OTRA, '11111111-2222-3333-4444-555555555555']
      })
    ])
    expect(plan.canceladas).toEqual(
      new Map([
        [OTRA, 'sustituida'],
        ['11111111-2222-3333-4444-555555555555', 'sustituida']
      ])
    )
    expect(plan.importar.map((l) => l.cfdi.uuid)).toEqual(['c79a953d-d29f-4990-b91c-25d9a675c332'])
    expect(plan.omitidas).toEqual({ carpeta: 0, sustituida: 1 })
  })

  it('does not let a cancelled complemento that names an invoice with relación 04 knock it out', () => {
    const plan = planearFacturas([
      factura('Facturas/Emitidas/2018/11/b.xml', FACTURA),
      factura('Facturas/Emitidas/2018/12/Canceladas/p.xml', 'ef685f58-9613-4303-b03c-1751e94b6722', {
        tipo: 'P',
        sustituye: [FACTURA]
      })
    ])
    expect(plan.canceladas.has(FACTURA)).toBe(false)
    expect(plan.importar.map((l) => l.cfdi.uuid)).toEqual([FACTURA])
  })

  it('collects each invoice payment once, in parcialidad order, ignoring cancelled complementos', () => {
    const plan = planearFacturas([
      lectura(
        'Facturas/Emitidas/2020/08/p2.xml',
        complementoXml({ uuid: 'c2000000-0000-4444-8888-99aabbccddee', pagos: [pago(2, '2020-08-13', '600.00', '0')] })
      ),
      lectura(
        'Facturas/Emitidas/2019/09/p1.xml',
        complementoXml({ uuid: 'c1000000-0000-4444-8888-99aabbccddee', pagos: [pago(1, '2019-09-12', '400.00', '600.00')] })
      ),
      lectura(
        'Facturas/Emitidas/2019/09/copia/p1.xml',
        complementoXml({ uuid: 'c1111111-0000-4444-8888-99aabbccddee', pagos: [pago(1, '2019-09-12', '400.00', '600.00')] })
      ),
      lectura(
        'Facturas/Emitidas/2019/09/Canceladas/p0.xml',
        complementoXml({ uuid: 'c0000000-0000-4444-8888-99aabbccddee', pagos: [pago(3, '2019-09-01', '1.00', '0')] })
      )
    ])
    expect(plan.pagos.get(FACTURA)?.map((p) => [p.parcialidad, p.fecha])).toEqual([
      [1, '2019-09-12'],
      [2, '2020-08-13']
    ])
  })

  it('skips documents that are not CFDIs', () => {
    const plan = planearFacturas([{ archivo: 'Facturas/Emitidas/2019/02/CEP-1.xml', cfdi: null }])
    expect(plan.importar).toEqual([])
    expect(plan.omitidas).toEqual({ carpeta: 0, sustituida: 0 })
  })
})
