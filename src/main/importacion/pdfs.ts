import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'
import { extractText, getDocumentProxy } from 'unpdf'
import { leerNombreArchivo } from '../cotizaciones'
import type { Db } from '../db'
import { cotizaciones } from '../db/schema'

/**
 * Reading the text of the archived Cotizaciones' PDFs, before the folder scan's transactions,
 * which cannot wait on a file. These are files from disk parsed in the main process: one that
 * cannot be read is `null`, never an error that stops the scan. (The PDF.js unpdf bundles, 6.x,
 * has no path that compiles font programs into code, so there is no `isEvalSupported` to turn
 * off.)
 */

/** Each legacy quote's text by its path relative to the `DMM OS` root; `null` when unreadable. */
export type PdfsLeidos = ReadonlyMap<string, string | null>

/** A quote is one or two pages; anything this large is not one, and is not opened. */
export const TAMANO_MAXIMO_PDF = 10 * 1024 * 1024

/** The page text, pages joined, one text line per line; `null` when unreadable or empty. */
export async function textoDePdf(datos: Uint8Array): Promise<string | null> {
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined
  try {
    // Errors only: a font PDF.js has to repair is not worth a console line per file.
    pdf = await getDocumentProxy(datos, { verbosity: 0 })
    const { text } = await extractText(pdf, { mergePages: true })
    return text.trim() === '' ? null : text
  } catch {
    return null
  } finally {
    await pdf?.loadingTask.destroy()
  }
}

/**
 * The text of every legacy quote under `Cotizaciones/<year>/`. Given `db`, only those whose Folio
 * it has not imported yet, since the PDF applies only when a Cotización is first imported;
 * without it, all of them, as Reimportar desde cero needs before it removes anything. New-format
 * quotes are the app's own and are not read.
 */
export async function leerPdfsCotizaciones(root: string, db?: Db): Promise<PdfsLeidos> {
  const importadas = new Set(
    (db?.select({ folio: cotizaciones.folio, sufijo: cotizaciones.folioSufijo }).from(cotizaciones).all() ?? []).map(
      (c) => `${c.folio}${c.sufijo}`
    )
  )
  const leidos = new Map<string, string | null>()
  for (const anio of listar(join(root, 'Cotizaciones'), true)) {
    const carpeta = posix.join('Cotizaciones', anio)
    for (const archivo of listar(join(root, carpeta), false)) {
      const nombre = leerNombreArchivo(archivo)
      if (!nombre || nombre.fecha !== null || importadas.has(`${nombre.folio}${nombre.sufijo ?? ''}`)) continue
      const ruta = posix.join(carpeta, archivo)
      leidos.set(ruta, await leer(join(root, ruta)))
    }
  }
  return leidos
}

async function leer(ruta: string): Promise<string | null> {
  try {
    if (statSync(ruta).size > TAMANO_MAXIMO_PDF) return null
    return await textoDePdf(new Uint8Array(readFileSync(ruta)))
  } catch {
    return null
  }
}

function listar(ruta: string, carpetas: boolean): string[] {
  try {
    return readdirSync(ruta, { withFileTypes: true })
      .filter((e) => (carpetas ? e.isDirectory() : e.isFile()) && !e.name.startsWith('.'))
      .map((e) => e.name)
  } catch {
    return []
  }
}
