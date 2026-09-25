// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { EstadoImportacion, LogCarpetas, ResultadoReimportar, Sugerencia, VistaPreviaDesdeCero } from '../../../shared/dominio'
import type { DmmApi } from '../../../shared/contrato'
import { Logs } from './Logs'

const vincular: Sugerencia = {
  id: 1,
  accion: 'vincular',
  entidad: 'cotizacion',
  motivo: 'carpeta "Sonrieme" con el mismo nombre',
  creadoEn: '2026-09-12T09:14:00.000Z',
  registro: 'Cotización 475 · Sonrieme',
  destino: 'Sonrieme'
}
const ubicacion: Sugerencia = {
  id: 2,
  accion: 'ubicacion',
  entidad: 'proyecto',
  motivo: 'cotización 300 aceptada sin carpeta: ¿archivado o no disponible?',
  creadoEn: '2026-09-12T09:14:01.000Z',
  registro: 'Proyecto Hotel Aura',
  destino: null
}

const estado: EstadoImportacion = {
  facturas: null,
  carpetas: {
    corridoEn: '2026-09-12T09:14:00.000Z',
    log: {
      cotizaciones: { importadas: 3, duplicadas: 211 },
      contactos: { creados: 2 },
      proyectos: { creados: 5, actualizados: 1 },
      proyectosSinCarpeta: 1,
      sugerencias: 2,
      hddConectado: false,
      errores: [{ archivo: 'Cotizaciones/2018/roto.pdf', error: 'PDF inválido' }],
      noDisponibles: ['Proyectos (HDD externo)'],
      mapa: 'leido',
      filasMapa: [{ linea: 7, problema: 'sin uso', enDisco: 'Appleseed Plataformma' }],
      subcarpetasSinProyecto: [],
      nuevos: { contactos: [], proyectos: [], rfcs: [] }
    }
  }
}

const vista: LogCarpetas = {
  cotizaciones: { importadas: 214, duplicadas: 0 },
  contactos: { creados: 3 },
  proyectos: { creados: 1, actualizados: 0 },
  proyectosSinCarpeta: 0,
  sugerencias: 0,
  hddConectado: false,
  errores: [],
  noDisponibles: [],
  mapa: 'leido',
  filasMapa: [{ linea: 4, problema: 'rfc generico', enDisco: 'Frida Communication' }],
  subcarpetasSinProyecto: ['Proyectos/DMM Studios/Multisite'],
  nuevos: {
    contactos: [
      { nombre: 'Appleseed', origen: 'cotizacion' },
      { nombre: 'Estudio Ocho', origen: 'clientes' },
      { nombre: 'Umanut', origen: 'mapa' }
    ],
    proyectos: [{ nombre: 'Web 2023', contacto: 'DMM Studios', origen: 'proyectos' }],
    rfcs: [{ contacto: 'Umanut', rfc: 'UMA2311072G4' }]
  }
}

const fusionar: Sugerencia = {
  id: 3,
  accion: 'fusionar',
  entidad: 'contacto',
  motivo: 'nombre parecido a "Sublime"',
  creadoEn: '2026-09-12T09:14:02.000Z',
  registro: 'Contacto Sublime Inspiración',
  destino: 'Sublime'
}

let api: DmmApi['importacion']
let reimportado: ResultadoReimportar
let desdeCero: VistaPreviaDesdeCero

const montar = (sugerencias: Sugerencia[] = [vincular, ubicacion], e: EstadoImportacion = estado, v: LogCarpetas = vista) => {
  api = {
    facturas: vi.fn(async () => ({ importados: 0, duplicados: 0, ignorados: 0, sugerencias: 0, rfcsDesconocidos: [], ivasInusuales: [], errores: [], noDisponibles: [], cancelados: 0, sustituidos: 0, recibidas: 0, noCfdi: [], cambios: { cancelados: [], refechados: [], divididos: [], intactos: [] } })),
    carpetas: vi.fn(async () => e.carpetas!.log),
    vistaPrevia: vi.fn(async () => v),
    vistaPreviaDesdeCero: vi.fn(async () => desdeCero),
    reimportar: vi.fn(async () => reimportado),
    estado: vi.fn(async () => e),
    sugerencias: vi.fn(async () => sugerencias),
    responder: vi.fn(async () => []),
    aceptarVincular: vi.fn(async () => [fusionar, ubicacion])
  }
  window.dmm = { importacion: api } as unknown as DmmApi
  render(<Logs />)
}

afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  reimportado = { reimportado: true, carpetas: estado.carpetas!.log, facturas: { importados: 0, duplicados: 0, ignorados: 0, sugerencias: 0, rfcsDesconocidos: [], ivasInusuales: [], errores: [], noDisponibles: [], cancelados: 0, sustituidos: 0, recibidas: 0, noCfdi: [], cambios: { cancelados: [], refechados: [], divididos: [], intactos: [] } } }
  desdeCero = { log: vista, bloqueos: [] }
})

describe('Configuración → Logs', () => {
  it('shows what the last rescan found, errors included', async () => {
    montar()
    expect(await screen.findByText(/3 importadas/)).toBeTruthy()
    expect(screen.getByText(/PDF inválido/)).toBeTruthy()
    expect(screen.getByText(/Proyectos \(HDD externo\)/)).toBeTruthy()
  })

  it('runs the rescan and the CFDI import from here', async () => {
    montar()
    await screen.findByText(/3 importadas/)
    fireEvent.click(screen.getByRole('button', { name: /Re-escanear carpetas/i }))
    await waitFor(() => expect(api.carpetas).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: /Importar facturas/i }))
    await waitFor(() => expect(api.facturas).toHaveBeenCalled())
  })

  it('lists each Sugerencia with what was guessed and why', async () => {
    montar()
    expect(await screen.findByText('Cotización 475 · Sonrieme')).toBeTruthy()
    expect(screen.getByText(/carpeta "Sonrieme" con el mismo nombre/)).toBeTruthy()
  })

  it('accepts a Sugerencia once and stops asking', async () => {
    montar([vincular])
    await screen.findByText('Cotización 475 · Sonrieme')
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }))
    await waitFor(() => expect(api.responder).toHaveBeenCalledWith(1, 'aceptada'))
    await waitFor(() => expect(screen.queryByText('Cotización 475 · Sonrieme')).toBe(null))
  })

  it('rejects a Sugerencia', async () => {
    montar([vincular])
    await screen.findByText('Cotización 475 · Sonrieme')
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }))
    await waitFor(() => expect(api.responder).toHaveBeenCalledWith(1, 'rechazada'))
  })

  it('asks an ubicación as Archivado or No disponible', async () => {
    montar([ubicacion])
    await screen.findByText('Proyecto Hotel Aura')
    expect(screen.queryByRole('button', { name: 'Aceptar' })).toBe(null)
    fireEvent.click(screen.getByRole('button', { name: 'Archivado' }))
    await waitFor(() => expect(api.responder).toHaveBeenCalledWith(2, 'aceptada'))
  })

  it('says so when nothing is waiting', async () => {
    montar([])
    expect(await screen.findByText(/Sin sugerencias pendientes/i)).toBeTruthy()
  })

  it('shows the map rows a real scan could not apply', async () => {
    montar()
    expect(await screen.findByText(/línea 7 \(Appleseed Plataformma\): no coincide con nada en disco/)).toBeTruthy()
  })

  it('shows the map error of a real scan', async () => {
    const roto: EstadoImportacion = {
      facturas: null,
      carpetas: { corridoEn: estado.carpetas!.corridoEn, log: { ...estado.carpetas!.log, mapa: { error: 'Clientes/_nombres.csv no tiene las columnas' } } }
    }
    montar([], roto)
    expect(await screen.findByText(/Clientes\/_nombres.csv no tiene las columnas/)).toBeTruthy()
  })
})

describe('Vista previa', () => {
  it('shows what a scan would add, by origin, and that nothing was saved', async () => {
    montar()
    await screen.findByText(/3 importadas/)
    const corridas = screen.getByText(/Carpetas ·/).parentElement!.textContent

    fireEvent.click(screen.getByRole('button', { name: 'Vista previa' }))
    await waitFor(() => expect(api.vistaPrevia).toHaveBeenCalled())
    expect(await screen.findByText(/Nada se guardó/)).toBeTruthy()
    expect(screen.getByText(/214 importadas/)).toBeTruthy()
    expect(screen.getByText('Contactos nuevos · Cotizaciones (1):').parentElement!.textContent).toContain('Appleseed')
    expect(screen.getByText('Contactos nuevos · Clientes/ (1):').parentElement!.textContent).toContain('Estudio Ocho')
    expect(screen.getByText('Contactos nuevos · Mapa de nombres (1):').parentElement!.textContent).toContain('Umanut')
    expect(screen.getByText('Proyectos nuevos · Proyectos/ (1):').parentElement!.textContent).toContain('Web 2023 (DMM Studios)')
    expect(screen.getByText(/RFC a asignar: Umanut UMA2311072G4/)).toBeTruthy()
    expect(screen.getByText(/línea 4 \(Frida Communication\): RFC genérico/)).toBeTruthy()
    expect(screen.getByText(/Subcarpeta sin Proyecto: Proyectos\/DMM Studios\/Multisite/)).toBeTruthy()

    expect(api.carpetas).not.toHaveBeenCalled()
    expect(screen.getByText(/Carpetas ·/).parentElement!.textContent).toBe(corridas)
  })

  it('shows only the error when the map cannot be read', async () => {
    montar([], estado, { ...vista, mapa: { error: 'Clientes/_nombres.csv no tiene las columnas' } })
    await screen.findByText(/3 importadas/)
    fireEvent.click(screen.getByRole('button', { name: 'Vista previa' }))
    expect(await screen.findByText(/Nada se guardó/)).toBeTruthy()
    expect(screen.getByText('Clientes/_nombres.csv no tiene las columnas')).toBeTruthy()
    expect(screen.queryByText(/214 importadas/)).toBe(null)
    expect(screen.queryByText(/Contactos nuevos/)).toBe(null)
  })

  it('shows what the last Facturas run skipped and corrected', async () => {
    montar([], {
      carpetas: null,
      facturas: {
        corridoEn: '2026-09-24T10:00:00.000Z',
        log: {
          importados: 0,
          duplicados: 468,
          ignorados: 6,
          sugerencias: 0,
          rfcsDesconocidos: [],
          ivasInusuales: [],
          errores: [],
          noDisponibles: [],
          cancelados: 19,
          sustituidos: 1,
          recibidas: 36,
          noCfdi: ['Facturas/Emitidas/2019/02/comprobante de pago/CEP-20190227-HSBC051240.xml'],
          cambios: {
            cancelados: [{ entidad: 'ingreso', id: 99, fecha: '2019-08-28', total: 9_914_320, motivo: 'cancelada' }],
            refechados: [],
            divididos: [{ entidad: 'ingreso', id: 94, fecha: '2019-08-29', total: 25_434_044, motivo: 'pagos' }],
            intactos: [{ entidad: 'ingreso', id: 7, fecha: '2018-04-10', total: 116_000, motivo: 'editado' }]
          }
        }
      }
    })
    expect(await screen.findByText(/19 canceladas · 1 sustituidas · 1 no son CFDI/)).toBeTruthy()
    expect(screen.getByText(/Recibidas: 36 leídas, no importadas/)).toBeTruthy()
    expect(screen.getByText(/Ingreso 99 · .* · \$99,143.20 \(en una carpeta de canceladas\)/)).toBeTruthy()
    expect(screen.getByText(/Ingreso 94 .* \$254,340.44 \(según sus complementos de pago\)/)).toBeTruthy()
    expect(screen.getByText(/Ingreso 7 .* \(editado a mano\)/)).toBeTruthy()
    expect(screen.getByText(/No es CFDI: .*CEP-20190227/)).toBeTruthy()
    expect(screen.queryByText(/Fecha de pago corregida/)).toBeNull()
  })
})

describe('Reimportar desde cero', () => {
  const pedir = async () => {
    montar()
    await screen.findByText(/3 importadas/)
    fireEvent.click(screen.getByRole('button', { name: 'Reimportar desde cero' }))
    expect(screen.getByText(/se pierden/)).toBeTruthy()
  }

  it('does nothing when the confirmation is declined', async () => {
    await pedir()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('button', { name: 'Sí, reimportar' })).toBe(null)
    expect(api.reimportar).not.toHaveBeenCalled()
  })

  it('reimports once confirmed, then refreshes the runs and the Sugerencias', async () => {
    await pedir()
    vi.mocked(api.estado).mockClear()
    vi.mocked(api.sugerencias).mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Sí, reimportar' }))
    await waitFor(() => expect(api.reimportar).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(api.sugerencias).toHaveBeenCalled())
    expect(api.estado).toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBe(null)
  })

  it('lists each block with its count when refused', async () => {
    reimportado = {
      reimportado: false,
      bloqueos: [
        { motivo: 'a_mano', registro: 'ingreso', cantidad: 1 },
        { motivo: 'a_mano', registro: 'cotizacion', cantidad: 2 },
        { motivo: 'mapa', error: 'Clientes/_nombres.csv no tiene las columnas' },
        { motivo: 'hdd', ruta: '/Volumes/HDD' }
      ]
    }
    await pedir()
    fireEvent.click(screen.getByRole('button', { name: 'Sí, reimportar' }))
    const aviso = await screen.findByRole('alert')
    expect(aviso.textContent).toContain('No se puede reimportar desde cero')
    expect(aviso.textContent).toContain('1 Ingreso registrado a mano')
    expect(aviso.textContent).toContain('2 Cotizaciones creadas en la app')
    expect(aviso.textContent).toContain('Clientes/_nombres.csv no tiene las columnas')
    expect(aviso.textContent).toContain('Conecta el disco externo (/Volumes/HDD)')
  })

  it('previews desde cero under its own heading, with the blocks above it', async () => {
    desdeCero = { log: vista, bloqueos: [{ motivo: 'a_mano', registro: 'ingreso', cantidad: 1 }] }
    montar()
    await screen.findByText(/3 importadas/)
    fireEvent.click(screen.getByRole('button', { name: 'Vista previa desde cero' }))
    expect(await screen.findByText(/Vista previa · Desde cero · Nada se guardó/)).toBeTruthy()
    expect(screen.getByText(/214 importadas/)).toBeTruthy()
    expect(screen.getByText(/Reimportar desde cero se rechazaría/).parentElement!.textContent).toContain('1 Ingreso registrado a mano')
    expect(api.vistaPrevia).not.toHaveBeenCalled()
    expect(api.reimportar).not.toHaveBeenCalled()
  })
})

describe('Aceptar todas', () => {
  it('is not offered with only fusionar and ubicación pending', async () => {
    montar([fusionar, ubicacion])
    await screen.findByText('Proyecto Hotel Aura')
    expect(screen.queryByRole('button', { name: 'Aceptar todas' })).toBe(null)
  })

  it('accepts every vincular and shows what is still pending', async () => {
    montar([vincular, fusionar, ubicacion])
    await screen.findByText('Cotización 475 · Sonrieme')
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar todas' }))
    await waitFor(() => expect(api.aceptarVincular).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText('Cotización 475 · Sonrieme')).toBe(null))
    expect(screen.getByText('Contacto Sublime Inspiración')).toBeTruthy()
    expect(screen.getByText('Proyecto Hotel Aura')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Aceptar todas' })).toBe(null)
  })
})
