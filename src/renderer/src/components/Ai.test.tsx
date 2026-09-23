// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { AgenteOSkill, FilaSuscripcion, PeriodoAi, ResumenAi, UsoModelo } from '../../../shared/dominio'
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

const montar = (ai: Partial<DmmApi['ai']> = {}) => {
  api = {
    resumen: vi.fn(async (periodo: PeriodoAi) => resumen(periodo)),
    leerUso: vi.fn(async () => ({ ultimoEscaneo: ESCANEO, avisos: [] })),
    agentesYSkills: vi.fn(async () => AGENTES),
    abrir: vi.fn(async () => {}),
    ...ai
  }
  window.dmm = { ai: api } as unknown as DmmApi
  render(<Ai />)
}

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
