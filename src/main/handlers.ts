import { join } from 'node:path'
import type { Respaldos } from './backup'
import { borrarContacto, contactosCsv, fichaContacto, listarContactos } from './contactos'
import type { Conexion } from './db'
import { coberturaCostos } from './db/cobertura'
import { escanearCarpetas, importarFacturas, marcarHddNoDisponible } from './importacion'
import { leerRutas } from './rutas'
import { pendientes, responder } from './sugerencias'
import type { AppInfo, DmmHandlers, EstadoImportacion } from '../shared/ipc'

export interface HandlersOptions {
  conexion: Conexion
  info: AppInfo
  respaldos: Pick<Respaldos, 'estado' | 'crear' | 'configurar' | 'restaurar'>
  /** What only Electron can do: ask the user for a path (undefined when cancelled) and open a folder. */
  elegirRespaldo: () => Promise<string | undefined>
  elegirHdd: () => Promise<string | undefined>
  /** Answers with why the folder could not be opened, or '' when it was. */
  abrirCarpeta: (path: string) => Promise<string>
  ahora?: () => string
}

/** Everything the renderer can ask of main, with the Electron-only parts passed in. */
export function crearHandlers({
  conexion,
  info,
  respaldos,
  elegirRespaldo,
  elegirHdd,
  abrirCarpeta,
  ahora = () => new Date().toISOString()
}: HandlersOptions): DmmHandlers {
  // The external HDD is organised like the main root, and is usually disconnected. Its path is
  // read per call, so plugging the drive in needs no restart; when it is absent its Proyectos
  // become No disponible, never lost.
  const hddRoot = () => conexion.ajustes.leer('hdd.root') || undefined
  const rutas = () => leerRutas(info.dmmOsRoot, hddRoot())
  // Logs shows the last run of each importer; the runs themselves are not worth a table.
  const ultimo: EstadoImportacion = { facturas: null, carpetas: null }

  return {
    getAppInfo: () => info,
    respaldos: {
      estado: respaldos.estado,
      crear: respaldos.crear,
      configurar: respaldos.configurar,
      restaurar: async (path) => {
        const source = path || (await elegirRespaldo())
        return source ? respaldos.restaurar(source) : { restaurado: false }
      }
    },
    importacion: {
      facturas: () => {
        const log = importarFacturas(conexion.db, info.dmmOsRoot)
        ultimo.facturas = { corridoEn: ahora(), log }
        return log
      },
      carpetas: () => {
        const log = escanearCarpetas(conexion.db, info.dmmOsRoot, hddRoot())
        ultimo.carpetas = { corridoEn: ahora(), log }
        return log
      },
      estado: () => ultimo,
      sugerencias: () => pendientes(conexion.db),
      responder: (id, respuesta) => {
        responder(conexion.db, id, respuesta)
        return pendientes(conexion.db)
      }
    },
    rutas: {
      leer: rutas,
      elegirHdd: async () => {
        const elegida = await elegirHdd()
        if (elegida) conexion.ajustes.escribir('hdd.root', elegida)
        return rutas()
      },
      olvidarHdd: () => {
        conexion.ajustes.escribir('hdd.root', '')
        // Its Proyectos stay; without a drive to look at, their locations are No disponible.
        marcarHddNoDisponible(conexion.db)
        return rutas()
      },
      abrir: async (carpeta) => {
        const error = await abrirCarpeta(carpeta === 'entrada' ? join(info.dmmOsRoot, 'Entrada') : info.dmmOsRoot)
        if (error) throw new Error(error)
      }
    },
    contactos: {
      listar: () => listarContactos(conexion.db),
      ficha: (id) => fichaContacto(conexion.db, info.dmmOsRoot, id),
      borrar: (id) => borrarContacto(conexion.db, id),
      csv: () => contactosCsv(conexion.db)
    },
    finanzas: {
      coberturaCostos: (desde, hasta) => coberturaCostos(conexion.db, desde, hasta)
    }
  }
}
