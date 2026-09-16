import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { leerRutas } from './rutas'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dmm-rutas-'))
})

describe('las rutas que la app lee', () => {
  it('counts the loose files waiting in Entrada', () => {
    mkdirSync(join(root, 'Entrada'))
    writeFileSync(join(root, 'Entrada', 'factura.pdf'), '')
    writeFileSync(join(root, 'Entrada', '.DS_Store'), '')
    mkdirSync(join(root, 'Entrada', 'sin clasificar'))
    expect(leerRutas(root).entrada).toBe(2)
  })

  it('reports Entrada as unknown when the folder is not there', () => {
    expect(leerRutas(root).entrada).toBe(null)
  })

  it('has no external HDD until one is chosen', () => {
    const r = leerRutas(root)
    expect(r.hddRoot).toBe(null)
    expect(r.hddConectado).toBe(false)
  })

  it('reports the external HDD as connected only while its folder is reachable', () => {
    const hdd = mkdtempSync(join(tmpdir(), 'dmm-hdd-'))
    expect(leerRutas(root, hdd).hddConectado).toBe(true)
    expect(leerRutas(root, join(hdd, 'desconectado')).hddConectado).toBe(false)
  })
})
