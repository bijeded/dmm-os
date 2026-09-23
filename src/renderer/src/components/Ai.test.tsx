// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { AgenteOSkill, AsignacionCosto, FilaProyectoAi, FilaSuscripcion, PeriodoAi, ResumenAi, UsoModelo } from '../../../shared/dominio'
import type { DmmApi } from '../../../shared/contrato'
import { dia, monto } from '../../../shared/formato'
import { fecha } from './Seccion'
import { Ai } from './Ai'

const ESCANEO = '2026-09-12T15:14:00.000Z'

const SUSCRIPCIONES_MES: FilaSuscripcion[] = [
  { id: 7, proveedor: 'Anthropic', plan: 'Claude Pro', fecha: '2026-09-18', monto: 36_000, origen: 'cfdi' },
  { id: 5, proveedor: 'OpenAI', plan: 'API créditos', fecha: '2026-09-02', monto: 18_000, origen: 'manual' }
]
const SUSCRIPCION_AGOSTO: FilaSuscripcion = { id: 3, proveedor: 'Anthropic', plan: 'Claude Pro', fecha: '2026-08-18', monto: 36_000, origen: 'cfdi' }

const modelo = (proveedor: string, familia: string, tokens: number, costoUsd: number): UsoModelo => ({ proveedor, familia, tokens, costoUsd })

const MODELOS: Record<PeriodoAi, UsoModelo[]> = {
  mes: [modelo('claude', 'haiku', 900_000, 120), modelo('claude', 'sonnet', 6_400_000, 3_820), modelo('claude', 'opus', 8_400_000, 5_460), modelo('openai', 'gpt', 0, 0)],
  todo: [modelo('claude', 'haiku', 2_100_000, 280), modelo('claude', 'sonnet', 21_000_000, 12_500), modelo('claude', 'opus', 24_100_000, 18_270), modelo('openai', 'gpt', 1_000_000, 0)]
}

const proyectoAi = (id: number, nombre: string, cambios: Partial<FilaProyectoAi> = {}): FilaProyectoAi => ({
  id,
  referencia: `PRY-00${id}`,
  nombre,
  etiqueta: 'cliente',
  contactoId: 20 + id,
  contacto: 'Hotel Aura',
  clienteFinal: null,
  categoria: 'ai',
  fechaInicio: '2026-04-10',
  estado: 'en_curso',
  carpeta: { estado: 'disponible', ruta: `Proyectos/${nombre}`, abrible: true },
  modelos: [],
  tokens: 0,
  costoUsd: 0,
  costoApiMxn: null,
  costoReal: 0,
  ...cambios
})

const PROYECTOS: Record<PeriodoAi, FilaProyectoAi[]> = {
  mes: [
    proyectoAi(1, 'Aura', { estado: 'completado', modelos: ['sonnet', 'opus'], tokens: 9_100_000, costoUsd: 5_326, costoApiMxn: 98_000, costoReal: 55_000, carpeta: { estado: 'archivado', ruta: 'Archivo/Proyectos/Aura', abrible: false } }),
    proyectoAi(4, 'Chatbot Terra', { contacto: 'Grupo Terra', clienteFinal: 'Terra Norte', fechaInicio: '2025-11-02', estado: 'pausado', costoApiMxn: 0, carpeta: { estado: 'no_disponible', ruta: 'Proyectos/Chatbot Terra', abrible: false } }),
    proyectoAi(3, 'Netdeckr', { referencia: null, etiqueta: 'personal', contactoId: null, contacto: null, modelos: ['opus'], tokens: 6_600_000, costoUsd: 3_315, costoApiMxn: 61_000, costoReal: 22_700 })
  ],
  todo: [
    proyectoAi(1, 'Aura', { estado: 'completado', modelos: ['haiku', 'sonnet', 'opus'], tokens: 30_000_000, costoUsd: 250_000, costoReal: 210_000 }),
    proyectoAi(4, 'Chatbot Terra', { contacto: 'Grupo Terra', fechaInicio: '2025-11-02', estado: 'pausado', modelos: ['haiku'], tokens: 400_000, costoUsd: 2_200 }),
    proyectoAi(3, 'Netdeckr', { referencia: null, etiqueta: 'personal', contactoId: null, contacto: null, modelos: ['opus'], tokens: 16_000_000, costoUsd: 60_000 })
  ]
}

/** September's pool of $540 split 58% / 42% by tokens. */
const ASIGNACION: AsignacionCosto = {
  mes: '2026-09',
  total: 54_000,
  criterio: 'tokens',
  filas: [
    { proyectoId: 1, nombre: 'Aura', tokens: 9_100_000, parte: 0.58, monto: 31_300 },
    { proyectoId: 3, nombre: 'Netdeckr', tokens: 6_600_000, parte: 0.42, monto: 22_700 }
  ],
  sinAsignar: 0
}

const resumen = (periodo: PeriodoAi, cambios: Partial<ResumenAi> = {}): ResumenAi => ({
  periodo,
  tokens: periodo === 'mes' ? 15_700_000 : 48_200_000,
  tokensAhorrados: periodo === 'mes' ? 4_200_000 : 9_100_000,
  ahorro: periodo === 'mes' ? 0.211 : 0.159,
  costoApiUsd: periodo === 'mes' ? 9_400 : 31_050,
  costoApiMxn: periodo === 'mes' ? 172_960 : 571_320,
  tipoCambio: 18.4,
  modelos: MODELOS[periodo],
  suscripciones: periodo === 'mes' ? SUSCRIPCIONES_MES : [...SUSCRIPCIONES_MES, SUSCRIPCION_AGOSTO],
  suscripcionesTotal: periodo === 'mes' ? 54_000 : 90_000,
  ingresoProyectos: periodo === 'mes' ? 5_800_000 : 12_300_000,
  ingresoAi: periodo === 'mes' ? 1_800_000 : 7_450_000,
  proyectos: PROYECTOS[periodo],
  sinProyecto: periodo === 'mes' ? { tokens: 500_000, costoUsd: 900, costoApiMxn: 16_560 } : { tokens: 1_800_000, costoUsd: 3_100, costoApiMxn: null },
  asignacion: ASIGNACION,
  ultimoEscaneo: ESCANEO,
  avisos: [],
  ...cambios
})

const AGENTES: AgenteOSkill[] = [
  { tipo: 'agente', nombre: 'code-reviewer', descripcion: 'Revisa cambios antes de publicarlos.', archivo: 'agents/code-reviewer.md', usadoEn: ['Aura', 'Netdeckr'] },
  { tipo: 'skill', nombre: 'design-md-planner', descripcion: null, archivo: 'skills/design-md-planner/SKILL.md', usadoEn: ['Netdeckr'] },
  { tipo: 'skill', nombre: 'newsletter-writer', descripcion: 'Escribe el boletín.', archivo: 'skills/newsletter-writer/SKILL.md', usadoEn: [] }
]

let api: DmmApi['ai']
let abrirCarpeta: DmmApi['proyectos']['abrirCarpeta']
let router: ReturnType<typeof createMemoryRouter>

const montar = (ai: Partial<DmmApi['ai']> = {}) => {
  api = {
    resumen: vi.fn(async (periodo: PeriodoAi) => resumen(periodo)),
    leerUso: vi.fn(async () => ({ ultimoEscaneo: ESCANEO, avisos: [] })),
    agentesYSkills: vi.fn(async () => AGENTES),
    abrir: vi.fn(async () => {}),
    ...ai
  }
  abrirCarpeta = vi.fn(async () => {})
  window.dmm = { ai: api, proyectos: { abrirCarpeta } } as unknown as DmmApi
  router = createMemoryRouter(
    [
      { path: '/ai', element: <Ai /> },
      { path: '/proyectos/:id', element: <p>Ficha del proyecto</p> }
    ],
    { initialEntries: ['/ai'] }
  )
  render(<RouterProvider router={router} />)
}

/** The Proyectos AI table's rows, each as its cells' text. */
const filasProyectos = () =>
  within(screen.getByRole('table', { name: 'Proyectos AI' }))
    .getAllByRole('row')
    .slice(1)
    .map((f) => within(f).getAllByRole('cell').map((c) => c.textContent))

const filaProyecto = (nombre: string) => within(screen.getByRole('table', { name: 'Proyectos AI' })).getByText(nombre).closest('tr') as HTMLElement

const agente = (nombre: string) => within(screen.getByRole('list', { name: 'Agentes y Skills' })).getByText(nombre).closest('li') as HTMLElement

const tarjeta = (label: RegExp) => within(screen.getByRole('list', { name: 'Resumen' })).getByText(label).closest('li') as HTMLElement

afterEach(cleanup)

describe('AI', () => {
  it('opens on Este mes with its token and API cost cards', async () => {
    montar()
    await screen.findByText('15.7 M')
    expect(api.resumen).toHaveBeenCalledWith('mes')
    expect(screen.getByRole('button', { name: 'Este mes' }).getAttribute('aria-pressed')).toBe('true')
    expect(tarjeta(/Tokens totales/).textContent).toContain('15.7 M')
    expect(tarjeta(/Tokens ahorrados/).textContent).toContain('4.2 M')
    expect(tarjeta(/Tokens ahorrados/).textContent).toContain('21.1% vía RTK')
    expect(tarjeta(/Costo API aprox/).textContent).toContain('$1,729.60')
    expect(tarjeta(/Costo API aprox/).textContent).toContain(`≈ ${monto(9_400, 'USD')}`)
  })

  it('switches to Todo el tiempo', async () => {
    montar()
    await screen.findByText('15.7 M')
    fireEvent.click(screen.getByRole('button', { name: 'Todo el tiempo' }))
    await screen.findByText('48.2 M')
    expect(api.resumen).toHaveBeenLastCalledWith('todo')
    expect(tarjeta(/Tokens ahorrados/).textContent).toContain('15.9% vía RTK')
    expect(tarjeta(/Costo API aprox/).textContent).toContain('$5,713.20')
  })

  it('shows the API cost in USD when the app has no tipo de cambio', async () => {
    montar({ resumen: vi.fn(async (p: PeriodoAi) => resumen(p, { costoApiMxn: null, tipoCambio: null })) })
    await screen.findByText('15.7 M')
    expect(tarjeta(/Costo API aprox/).textContent).toContain(monto(9_400, 'USD'))
    expect(tarjeta(/Costo API aprox/).textContent).toContain('sin tipo de cambio registrado')
  })

  it('shows when usage was last read, and Nunca before the first read', async () => {
    montar()
    expect(await screen.findByText(`Último escaneo: ${fecha(ESCANEO)}`)).toBeTruthy()
    cleanup()
    montar({ resumen: vi.fn(async (p: PeriodoAi) => resumen(p, { ultimoEscaneo: null, tokens: 0, tokensAhorrados: 0, ahorro: null, costoApiUsd: 0, costoApiMxn: 0 })) })
    expect(await screen.findByText('Último escaneo: Nunca')).toBeTruthy()
    expect(tarjeta(/Tokens ahorrados/).textContent).not.toContain('vía RTK')
  })

  it('reads usage again on demand, then shows the new figures', async () => {
    const figuras = [resumen('mes'), resumen('mes', { tokens: 16_000_000, ultimoEscaneo: '2026-09-22T15:00:00.000Z' })]
    montar({ resumen: vi.fn(async () => figuras.shift() ?? resumen('mes')) })
    await screen.findByText('15.7 M')
    fireEvent.click(screen.getByRole('button', { name: 'Leer uso' }))
    await screen.findByText('16.0 M')
    expect(api.leerUso).toHaveBeenCalledOnce()
    expect(screen.getByText(`Último escaneo: ${fecha('2026-09-22T15:00:00.000Z')}`)).toBeTruthy()
  })

  it('says why a source could not be read, and still shows the cards', async () => {
    montar({ resumen: vi.fn(async (p: PeriodoAi) => resumen(p, { avisos: ['CC Usage: no está instalado (no se encontró `ccusage`)'] })) })
    const avisos = await screen.findByRole('list', { name: 'Avisos de lectura' })
    expect(within(avisos).getByText('CC Usage: no está instalado (no se encontró `ccusage`)')).toBeTruthy()
    expect(tarjeta(/Tokens totales/).textContent).toContain('15.7 M')
  })

  it('charts every model, grouped by provider, including one unused in the period', async () => {
    montar()
    const grafica = await screen.findByRole('img', { name: 'Tokens por modelo' })
    const barras = () => within(grafica).getAllByLabelText(/ · /).map((b) => b.getAttribute('aria-label'))
    expect(barras()).toEqual(['claude · haiku', 'claude · sonnet', 'claude · opus', 'openai · gpt'])
    expect(within(grafica).getByText('claude')).toBeTruthy()
    expect(within(grafica).getByText('openai')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Todo el tiempo' }))
    await screen.findByText('48.2 M')
    expect(barras()).toEqual(['claude · haiku', 'claude · sonnet', 'claude · opus', 'openai · gpt'])
  })

  it('shows a model’s tokens and API cost in the tooltip', async () => {
    montar()
    const grafica = await screen.findByRole('img', { name: 'Tokens por modelo' })
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.mouseEnter(within(grafica).getByLabelText('claude · sonnet'))
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip.textContent).toContain('claude · sonnet')
    expect(tooltip.textContent).toContain('6.4 M tokens')
    expect(tooltip.textContent).toContain(`≈ ${monto(3_820, 'USD')} API`)
    fireEvent.mouseEnter(within(grafica).getByLabelText('openai · gpt'))
    expect(screen.getByRole('tooltip').textContent).toContain('0 tokens')
    fireEvent.mouseLeave(grafica)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('says when no token usage has been read yet', async () => {
    montar({ resumen: vi.fn(async (p: PeriodoAi) => resumen(p, { modelos: [] })) })
    expect(await screen.findByText('Sin uso de tokens leído.')).toBeTruthy()
    expect(screen.queryByRole('img', { name: 'Tokens por modelo' })).toBeNull()
  })

  it('lists the period’s Suscripciones with their origin, and totals them on the card', async () => {
    montar()
    const tabla = await screen.findByRole('table', { name: 'Suscripciones' })
    const filas = within(tabla)
      .getAllByRole('row')
      .slice(1)
      .map((f) => within(f).getAllByRole('cell').map((c) => c.textContent))
    expect(filas).toEqual([
      ['Anthropic', 'Claude Pro', dia('2026-09-18'), '$360.00', 'CFDI recibido'],
      ['OpenAI', 'API créditos', dia('2026-09-02'), '$180.00', 'Manual']
    ])
    expect(tarjeta(/^Suscripciones$/).textContent).toContain('$540.00')
  })

  it('switches Suscripciones and their total to Todo el tiempo', async () => {
    montar()
    await screen.findByRole('table', { name: 'Suscripciones' })
    fireEvent.click(screen.getByRole('button', { name: 'Todo el tiempo' }))
    await screen.findByText(dia('2026-08-18'))
    expect(within(screen.getByRole('table', { name: 'Suscripciones' })).getAllByRole('row')).toHaveLength(4)
    expect(tarjeta(/^Suscripciones$/).textContent).toContain('$900.00')
  })

  it('says when the period has no Suscripciones', async () => {
    montar({ resumen: vi.fn(async (p: PeriodoAi) => resumen(p, { suscripciones: [], suscripcionesTotal: 0 })) })
    expect(await screen.findByText('Ninguna suscripción en el periodo.')).toBeTruthy()
    expect(screen.queryByRole('table', { name: 'Suscripciones' })).toBeNull()
    expect(tarjeta(/^Suscripciones$/).textContent).toContain('$0.00')
  })

  it('says why the figures could not be read', async () => {
    montar({ resumen: vi.fn(async () => Promise.reject(new Error('disco lleno'))) })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('disco lleno'))
  })

  it('lists the agents and skills with their type, description and the Proyectos that use them', async () => {
    montar()
    const lista = await screen.findByRole('list', { name: 'Agentes y Skills' })
    expect(within(lista).getAllByRole('listitem')).toHaveLength(3)
    expect(agente('code-reviewer').textContent).toContain('agente')
    expect(agente('code-reviewer').textContent).toContain('Revisa cambios antes de publicarlos.')
    expect(agente('code-reviewer').textContent).toContain('Usado en: Aura, Netdeckr')
    expect(agente('design-md-planner').textContent).toContain('skill')
    expect(agente('design-md-planner').textContent).toContain('Usado en: Netdeckr')
  })

  it('marks an item no Proyecto uses as en prueba', async () => {
    montar()
    await screen.findByRole('list', { name: 'Agentes y Skills' })
    expect(agente('newsletter-writer').textContent).toContain('Usado en: en prueba')
  })

  it('opens an agent’s or skill’s file', async () => {
    montar()
    await screen.findByRole('list', { name: 'Agentes y Skills' })
    fireEvent.click(within(agente('newsletter-writer')).getByRole('button', { name: 'Ver archivo' }))
    await waitFor(() => expect(api.abrir).toHaveBeenCalledWith('skills/newsletter-writer/SKILL.md'))
  })

  it('says why Agentes y Skills could not be read, and still shows the cards', async () => {
    montar({ agentesYSkills: vi.fn(async () => Promise.reject(new Error('No se encontró la carpeta AI/'))) })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('No se encontró la carpeta AI/'))
    expect(screen.queryByRole('list', { name: 'Agentes y Skills' })).toBeNull()
    expect((await screen.findByText('15.7 M'))).toBeTruthy()
  })

  it('says when AI/ has no agents or skills', async () => {
    montar({ agentesYSkills: vi.fn(async () => []) })
    expect(await screen.findByText('Ningún agente ni skill en AI/.')).toBeTruthy()
  })
})

describe('Ingreso cards', () => {
  it('shows what Proyectos AI were quoted and what AI income was collected, for each period', async () => {
    montar()
    await screen.findByText('15.7 M')
    expect(tarjeta(/Ingreso proyectos AI/).textContent).toContain('$58,000.00')
    expect(tarjeta(/Ingreso proyectos AI/).textContent).toContain('cotizado')
    expect(tarjeta(/^Ingreso AI$/).textContent).toContain('$18,000.00')
    expect(tarjeta(/^Ingreso AI$/).textContent).toContain('cobrado')
    fireEvent.click(screen.getByRole('button', { name: 'Todo el tiempo' }))
    await screen.findByText('48.2 M')
    expect(tarjeta(/Ingreso proyectos AI/).textContent).toContain('$123,000.00')
    expect(tarjeta(/^Ingreso AI$/).textContent).toContain('$74,500.00')
  })
})

describe('Proyectos AI', () => {
  it('lists the Proyectos AI in the order given, with models, tokens and API cost', async () => {
    montar()
    await screen.findByRole('table', { name: 'Proyectos AI' })
    expect(filasProyectos()).toEqual([
      ['Aura', 'PRY-001', 'Hotel Aura', 'sonnet, opus', '9.1 M', '$980.00', '$550.00', 'Completado', 'Archivado'],
      ['Chatbot Terra', 'PRY-004', 'Grupo Terra · Terra Norte', '—', '0', '$0.00', '$0.00', 'Pausado', 'No disponible'],
      ['Netdeckr', '—', 'Personal', 'opus', '6.6 M', '$610.00', '$227.00', 'En curso', 'Abrir'],
      ['Sin proyecto', '', '', '', '500.0 K', '$165.60', '', '', '']
    ])
  })

  it('shows the period’s usage', async () => {
    montar()
    await screen.findByRole('table', { name: 'Proyectos AI' })
    fireEvent.click(screen.getByRole('button', { name: 'Todo el tiempo' }))
    await screen.findByText('48.2 M')
    expect(filaProyecto('Aura').textContent).toContain('haiku, sonnet, opus')
    expect(filaProyecto('Aura').textContent).toContain('30.0 M')
    expect(filaProyecto('Aura').textContent).toContain('$2,100.00')
    expect(filaProyecto('Sin proyecto').textContent).toContain('1.8 M')
  })

  it('shows the API cost in USD when the app has no tipo de cambio', async () => {
    montar()
    await screen.findByRole('table', { name: 'Proyectos AI' })
    fireEvent.click(screen.getByRole('button', { name: 'Todo el tiempo' }))
    await screen.findByText('48.2 M')
    expect(filaProyecto('Aura').textContent).toContain(monto(250_000, 'USD'))
    expect(filaProyecto('Sin proyecto').textContent).toContain(monto(3_100, 'USD'))
  })

  const nombres = () => filasProyectos().map((f) => f[0])
  const elegir = (filtro: string, valor: string) => fireEvent.change(screen.getByRole('combobox', { name: filtro }), { target: { value: valor } })

  it('filters by cliente, including Personal', async () => {
    montar()
    await screen.findByRole('table', { name: 'Proyectos AI' })
    elegir('Cliente', '24')
    expect(nombres()).toEqual(['Chatbot Terra'])
    elegir('Cliente', 'personal')
    expect(nombres()).toEqual(['Netdeckr'])
  })

  it('filters by referencia, año, categoría, token usage and estado', async () => {
    montar()
    await screen.findByRole('table', { name: 'Proyectos AI' })
    fireEvent.change(screen.getByPlaceholderText('Buscar ref., proyecto AI…'), { target: { value: 'pry-004' } })
    expect(nombres()).toEqual(['Chatbot Terra'])
    fireEvent.change(screen.getByPlaceholderText('Buscar ref., proyecto AI…'), { target: { value: '' } })
    elegir('Año', '2025')
    expect(nombres()).toEqual(['Chatbot Terra'])
    elegir('Año', '')
    elegir('Categoría', 'personal')
    expect(nombres()).toEqual(['Netdeckr'])
    elegir('Categoría', 'cliente')
    expect(nombres()).toEqual(['Aura', 'Chatbot Terra'])
    elegir('Categoría', '')
    elegir('Uso tokens', 'sin_uso')
    expect(nombres()).toEqual(['Chatbot Terra'])
    elegir('Uso tokens', 'con_uso')
    expect(nombres()).toEqual(['Aura', 'Netdeckr'])
    elegir('Uso tokens', '')
    elegir('Estado', 'completado')
    expect(nombres()).toEqual(['Aura'])
  })

  it('says when no Proyecto AI matches', async () => {
    montar()
    await screen.findByRole('table', { name: 'Proyectos AI' })
    elegir('Estado', 'cancelado')
    expect(screen.getByText('Ningún proyecto AI coincide.')).toBeTruthy()
  })

  it('opens the Proyecto record from its row', async () => {
    montar()
    await screen.findByRole('table', { name: 'Proyectos AI' })
    fireEvent.click(filaProyecto('Netdeckr'))
    await screen.findByText('Ficha del proyecto')
    expect(router.state.location.pathname).toBe('/proyectos/3')
  })

  it('opens an available folder through the API, and shows Archivado and No disponible as they are', async () => {
    montar()
    await screen.findByRole('table', { name: 'Proyectos AI' })
    fireEvent.click(within(filaProyecto('Netdeckr')).getByRole('button', { name: 'Abrir' }))
    await waitFor(() => expect(abrirCarpeta).toHaveBeenCalledWith(3))
    expect(router.state.location.pathname).toBe('/ai')
    expect(within(filaProyecto('Aura')).queryByRole('button', { name: 'Abrir' })).toBeNull()
    expect(within(filaProyecto('Chatbot Terra')).queryByRole('button', { name: 'Abrir' })).toBeNull()
  })

  it('says why a folder could not be opened', async () => {
    montar()
    await screen.findByRole('table', { name: 'Proyectos AI' })
    vi.mocked(abrirCarpeta).mockRejectedValueOnce(new Error('La carpeta está No disponible'))
    fireEvent.click(within(filaProyecto('Netdeckr')).getByRole('button', { name: 'Abrir' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('La carpeta está No disponible'))
  })

  it('says when there are no Proyectos AI', async () => {
    montar({ resumen: vi.fn(async (p: PeriodoAi) => resumen(p, { proyectos: [], sinProyecto: { tokens: 0, costoUsd: 0, costoApiMxn: null } })) })
    expect(await screen.findByText('Ningún proyecto en la categoría AI.')).toBeTruthy()
    expect(screen.queryByRole('table', { name: 'Proyectos AI' })).toBeNull()
  })
})

describe('Asignación de costo', () => {
  /** The Asignación de costo table's rows, each as its cells' text. */
  const filasAsignacion = () =>
    within(screen.getByRole('table', { name: /Asignación de costo/ }))
      .getAllByRole('row')
      .slice(1)
      .map((f) => within(f).getAllByRole('cell').map((c) => c.textContent))

  const conAsignacion = (asignacion: Partial<AsignacionCosto>) => montar({ resumen: vi.fn(async (p: PeriodoAi) => resumen(p, { asignacion: { ...ASIGNACION, ...asignacion } })) })

  it('shows the month’s split by tokens, with Sin asignar noted', async () => {
    montar()
    await screen.findByRole('table', { name: /Asignación de costo · sep/ })
    expect(filasAsignacion()).toEqual([
      ['Aura', '9.1 M', '58%', '$313.00'],
      ['Netdeckr', '6.6 M', '42%', '$227.00'],
      ['Sin asignar', '—', '—', '$0.00']
    ])
    expect(screen.getByText('Por uso de tokens.')).toBeTruthy()
  })

  it('shows an even split when there is no usage data', async () => {
    conAsignacion({
      criterio: 'partes_iguales',
      filas: [
        { proyectoId: 1, nombre: 'Aura', tokens: 0, parte: 0.5, monto: 27_000 },
        { proyectoId: 3, nombre: 'Netdeckr', tokens: 0, parte: 0.5, monto: 27_000 }
      ]
    })
    await screen.findByRole('table', { name: /Asignación de costo/ })
    expect(filasAsignacion()).toEqual([
      ['Aura', '—', '50%', '$270.00'],
      ['Netdeckr', '—', '50%', '$270.00'],
      ['Sin asignar', '—', '—', '$0.00']
    ])
    expect(screen.getByText('Sin datos de uso: partes iguales entre los proyectos AI abiertos en el mes.')).toBeTruthy()
  })

  it('leaves the whole pool Sin asignar when there are no Proyectos AI', async () => {
    conAsignacion({ criterio: 'sin_proyectos', filas: [], sinAsignar: 54_000 })
    await screen.findByRole('table', { name: /Asignación de costo/ })
    expect(filasAsignacion()).toEqual([['Sin asignar', '—', '—', '$540.00']])
    expect(screen.getByText('Ningún proyecto AI abierto en el mes: todo queda sin asignar.')).toBeTruthy()
  })

  it('keeps showing this month’s split in Todo el tiempo', async () => {
    montar()
    await screen.findByRole('table', { name: /Asignación de costo · sep/ })
    fireEvent.click(screen.getByRole('button', { name: 'Todo el tiempo' }))
    await screen.findByText('48.2 M')
    expect(filasAsignacion()[0]).toEqual(['Aura', '9.1 M', '58%', '$313.00'])
  })
})
