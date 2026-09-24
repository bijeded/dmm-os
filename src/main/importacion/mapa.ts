import { clave } from '../nombres'

/**
 * Mapa de nombres: `Clientes/_nombres.csv`, the file where the user tells the folder scan which
 * Contacto, Proyecto and RFC a name on disk means. This module only parses and matches it; it
 * never touches the disk. The user edits the file in Numbers or a text editor, so it takes
 * commas or semicolons, quoted fields, a BOM and columns in any order.
 */

/** Where the map lives, relative to the `DMM OS` root. */
export const RUTA_MAPA = 'Clientes/_nombres.csv'

/** One usable row. `enDisco` is null for a row that only gives a Contacto its RFC. */
export interface FilaMapa {
  /** 1-based line of the file the row starts on, the header being line 1. */
  linea: number
  enDisco: string | null
  contacto: string
  proyecto: string | null
  clienteFinal: string | null
  rfc: string | null
}

/** A row the map itself cannot use, found while parsing. */
export interface FilaDescartada {
  linea: number
  problema: 'incompleta' | 'duplicada'
  enDisco: string
}

export interface Mapa {
  /** Every usable row, in file order. */
  readonly filas: readonly FilaMapa[]
  readonly descartadas: readonly FilaDescartada[]
  /** The row for a name found on disk (`carpeta/sub` for a subfolder), marking it used. */
  buscar(nombre: string): FilaMapa | undefined
  /** The same lookup, without marking the row used. */
  consultar(nombre: string): FilaMapa | undefined
  /** The rows declaring a subfolder of `carpeta` a Proyecto of its own. */
  subcarpetas(carpeta: string): FilaMapa[]
  /** Rows keyed by a name that no `buscar` found. RFC-only rows are never among them. */
  sinUso(): FilaMapa[]
  /** Records the Contacto a found row's name resolved to, for the RFC pass. */
  anotar(fila: FilaMapa, contactoId: number): void
  contactoDe(fila: FilaMapa): number | undefined
}

export interface ErrorMapa {
  error: string
}

const COLUMNAS = {
  'en disco': 'enDisco',
  contacto: 'contacto',
  proyecto: 'proyecto',
  'cliente final': 'clienteFinal',
  rfc: 'rfc'
} as const
type Columna = (typeof COLUMNAS)[keyof typeof COLUMNAS]

/**
 * The key a name is matched by: its `clave`, except that a `/` splits a folder from the
 * subfolder it declares, and survives. A name on disk never holds `/` (Finder stores it as `:`).
 */
function llave(nombre: string): string {
  const i = nombre.indexOf('/')
  return i === -1 ? clave(nombre) : `${clave(nombre.slice(0, i))}/${clave(nombre.slice(i + 1))}`
}

/** Rows of fields, each with the line it starts on. Quoted fields may hold the delimiter, `""` and newlines. */
function filasCsv(texto: string, delimitador: string): { linea: number; campos: string[] }[] {
  const filas: { linea: number; campos: string[] }[] = []
  let campos: string[] = []
  let campo = ''
  let entreComillas = false
  let linea = 1
  let inicio = 1
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"'
        i++
      } else if (c === '"') {
        entreComillas = false
      } else {
        if (c === '\n') linea++
        campo += c
      }
    } else if (c === '"') {
      entreComillas = true
    } else if (c === delimitador) {
      campos.push(campo)
      campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      campos.push(campo)
      filas.push({ linea: inicio, campos })
      campos = []
      campo = ''
      linea++
      inicio = linea
    } else {
      campo += c
    }
  }
  if (campo !== '' || campos.length > 0) {
    campos.push(campo)
    filas.push({ linea: inicio, campos })
  }
  return filas
}

/** The delimiter the header line uses: a semicolon when it has more of them than commas. */
function delimitadorDe(texto: string): string {
  const cabecera = texto.split(/\r?\n/, 1)[0]
  const cuenta = (d: string) => cabecera.split(d).length - 1
  return cuenta(';') > cuenta(',') ? ';' : ','
}

export function leerMapa(texto: string): Mapa | ErrorMapa {
  const limpio = texto.startsWith('\u{FEFF}') ? texto.slice(1) : texto
  const [cabecera, ...resto] = filasCsv(limpio, delimitadorDe(limpio))
  const columnas = (cabecera?.campos ?? []).map(
    (nombre) => (COLUMNAS as Record<string, Columna | undefined>)[clave(nombre)]
  )
  if (!columnas.includes('enDisco') || !columnas.includes('contacto')) {
    return { error: `${RUTA_MAPA} no tiene las columnas "en disco" y "contacto"` }
  }

  const filas: FilaMapa[] = []
  const descartadas: FilaDescartada[] = []
  const porLlave = new Map<string, FilaMapa>()
  for (const { linea, campos } of resto) {
    const valores: Partial<Record<Columna, string>> = {}
    columnas.forEach((columna, i) => {
      // A short row reads its missing fields as empty; a repeated column keeps its first value.
      if (columna && valores[columna] === undefined) valores[columna] = (campos[i] ?? '').trim()
    })
    const valor = (c: Columna) => valores[c] || null
    // A row with nothing the scan reads (blank, or only a note) is not a problem.
    if (Object.values(valores).every((v) => !v)) continue

    const enDisco = valor('enDisco')
    const contacto = valor('contacto')
    const rfc = valor('rfc')
    if (!contacto || (!enDisco && !rfc)) {
      descartadas.push({ linea, problema: 'incompleta', enDisco: enDisco ?? '' })
      continue
    }
    if (enDisco && porLlave.has(llave(enDisco))) {
      descartadas.push({ linea, problema: 'duplicada', enDisco })
      continue
    }
    const fila: FilaMapa = { linea, enDisco, contacto, proyecto: valor('proyecto'), clienteFinal: valor('clienteFinal'), rfc }
    filas.push(fila)
    if (enDisco) porLlave.set(llave(enDisco), fila)
  }

  const usadas = new Set<FilaMapa>()
  const contactos = new Map<FilaMapa, number>()
  return {
    filas,
    descartadas,
    consultar: (nombre) => porLlave.get(llave(nombre)),
    buscar(nombre) {
      const fila = porLlave.get(llave(nombre))
      if (fila) usadas.add(fila)
      return fila
    },
    subcarpetas(carpeta) {
      const prefijo = `${clave(carpeta)}/`
      return filas.filter((f) => f.enDisco !== null && llave(f.enDisco).startsWith(prefijo))
    },
    sinUso: () => filas.filter((f) => f.enDisco !== null && !usadas.has(f)),
    anotar: (fila, contactoId) => void contactos.set(fila, contactoId),
    contactoDe: (fila) => contactos.get(fila)
  }
}

/** The map when there is no file: every name imports as the disk writes it. */
export function mapaVacio(): Mapa {
  return leerMapa('en disco,contacto') as Mapa
}

export function esErrorMapa(m: Mapa | ErrorMapa): m is ErrorMapa {
  return 'error' in m
}
