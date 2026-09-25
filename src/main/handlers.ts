import { join } from 'node:path'
import type { Respaldos } from './backup'
import { borrarConcepto, guardarConcepto, listarCatalogo } from './catalogo'
import { borrarContacto, contactosCsv, fichaContacto, guardarContacto, listarContactos } from './contactos'
import type { Conexion } from './db'
import { coberturaCostos } from './db/cobertura'
import { DIAS_VENCIDA, resumenFinanzas } from './finanzas'
import { resumenInicio } from './inicio'
import {
  borrarCosto,
  borrarIngreso,
  cancelarCosto,
  cancelarIngreso,
  detenerCosto,
  nuevoCosto,
  nuevoIngreso,
  pagarCosto,
  pagarIngreso,
  reembolsar
} from './movimientos'
import {
  aceptarCotizacion,
  borrarCotizacion,
  cancelarCotizacion,
  enviarCotizacion,
  fichaCotizacion,
  guardarCotizacion,
  listarCotizaciones,
  rechazarCotizacion,
  type ImprimirPdf
} from './cotizar'
import {
  borrarProyecto,
  cancelarProyecto,
  carpetaAbrible,
  completarProyecto,
  fichaProyecto,
  guardarProyecto,
  listarProyectos,
  pausarProyecto,
  reanudarProyecto
} from './proyectos'
import { agregarTarea, borrarTarea, completarTarea, listarTareas } from './tareas'
import { escanearCarpetas, importarFacturas, marcarHddNoDisponible } from './importacion'
import { bloqueos, borrarImportado, reimportar } from './importacion/reimportar'
import { ejecutarCli, leerUso, resumenAi, type EjecutarUso } from './ai'
import { agentesYSkills, rutaAgenteOSkill } from './agentes-skills'
import { archivosLab, buscarLab, carpetasLab, rutaEnLab, vistaPreviaLab } from './lab'
import { dbAlDia } from './ledger'
import { leerRutas } from './rutas'
import { aceptarVincular, pendientes, responder } from './sugerencias'
import { sql } from 'drizzle-orm'
import { diaLocal } from '../shared/fechas'
import type { EstadoImportacion } from '../shared/dominio'
import type { AppInfo, DmmHandlers } from '../shared/contrato'

export interface HandlersOptions {
  conexion: Conexion
  info: AppInfo
  respaldos: Pick<Respaldos, 'estado' | 'crear' | 'configurar' | 'restaurar' | 'antesDeReimportar'>
  /** What only Electron can do: ask the user for a path (undefined when cancelled) and open a folder. */
  elegirRespaldo: () => Promise<string | undefined>
  elegirHdd: () => Promise<string | undefined>
  /** Answers with why the folder could not be opened, or '' when it was. */
  abrirCarpeta: (path: string) => Promise<string>
  imprimirPdf: ImprimirPdf
  /** Runs CC Usage or RTK; tests pass fixture output. */
  ejecutarUso?: EjecutarUso
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
  imprimirPdf,
  ejecutarUso = ejecutarCli,
  ahora = () => new Date().toISOString()
}: HandlersOptions): DmmHandlers {
  // The local calendar day, which is what a quote is accepted on.
  const hoy = () => diaLocal(new Date(ahora()))
  // Every entry of Contactos, Cotizaciones, Proyectos, Finanzas, Inicio and the AI resumen works on
  // an Al día db: a quote past its validity is expirada before anything judges it, and this month's
  // Periodos exist. Sections that never touch money use the connection directly.
  const alDiaDb = () => dbAlDia(conexion.db, hoy())

  // The external HDD is organised like the main root, and is usually disconnected. Its path is
  // read per call, so plugging the drive in needs no restart; when it is absent its Proyectos
  // become No disponible, never lost.
  const hddRoot = () => conexion.ajustes.leer('hdd.root') || undefined
  const rutas = () => leerRutas(info.dmmOsRoot, hddRoot())
  // Logs shows the last run of each importer; the runs themselves are not worth a table.
  const ultimo: EstadoImportacion = { facturas: null, carpetas: null }
  const diasVencida = () => Number(conexion.ajustes.leer('finanzas.diasVencida')) || DIAS_VENCIDA

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
        const log = escanearCarpetas(conexion.db, info.dmmOsRoot, hddRoot(), hoy())
        ultimo.carpetas = { corridoEn: ahora(), log }
        return log
      },
      vistaPrevia: () => {
        const copia = conexion.copiaEnMemoria()
        try {
          return escanearCarpetas(copia.db, info.dmmOsRoot, hddRoot(), hoy())
        } finally {
          copia.close()
        }
      },
      vistaPreviaDesdeCero: () => {
        const copia = conexion.copiaEnMemoria()
        try {
          // Off on the throwaway copy only: the preview runs even while hand-made records
          // reference imported ones, and the scan never follows those references.
          copia.db.run(sql`PRAGMA foreign_keys = OFF`)
          borrarImportado(copia.db)
          const log = escanearCarpetas(copia.db, info.dmmOsRoot, hddRoot(), hoy())
          return { log, bloqueos: bloqueos(conexion.db, { root: info.dmmOsRoot, hddRoot: hddRoot() }) }
        } finally {
          copia.close()
        }
      },
      reimportar: () => {
        const r = reimportar(conexion.db, {
          root: info.dmmOsRoot,
          hddRoot: hddRoot(),
          hoy: hoy(),
          respaldar: () => void respaldos.antesDeReimportar()
        })
        if (r.reimportado) {
          ultimo.carpetas = { corridoEn: ahora(), log: r.carpetas }
          ultimo.facturas = { corridoEn: ahora(), log: r.facturas }
        }
        return r
      },
      estado: () => ultimo,
      sugerencias: () => pendientes(conexion.db),
      responder: (id, respuesta) => {
        responder(conexion.db, id, respuesta, hoy())
        return pendientes(conexion.db)
      },
      aceptarVincular: () => aceptarVincular(conexion.db, hoy())
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
        const sub = { raiz: '', entrada: 'Entrada', facturas: 'Facturas' }[carpeta]
        const error = await abrirCarpeta(join(info.dmmOsRoot, sub))
        if (error) throw new Error(error)
      }
    },
    contactos: {
      listar: () => listarContactos(alDiaDb()),
      ficha: (id) => fichaContacto(alDiaDb(), info.dmmOsRoot, id),
      guardar: (contacto) => guardarContacto(alDiaDb(), contacto),
      borrar: (id) => borrarContacto(alDiaDb(), id),
      csv: () => contactosCsv(alDiaDb())
    },
    catalogo: {
      listar: () => listarCatalogo(conexion.db),
      guardar: (concepto) => guardarConcepto(conexion.db, concepto),
      borrar: (id) => borrarConcepto(conexion.db, id)
    },
    cotizaciones: {
      listar: () => listarCotizaciones(alDiaDb()),
      ficha: (id) => fichaCotizacion(alDiaDb(), id),
      guardar: (cotizacion) => guardarCotizacion(alDiaDb(), cotizacion),
      enviar: (id) => enviarCotizacion(alDiaDb(), info.dmmOsRoot, id, imprimirPdf),
      aceptar: (id, tipoCambio) => aceptarCotizacion(alDiaDb(), info.dmmOsRoot, id, hoy(), tipoCambio),
      rechazar: (id) => rechazarCotizacion(alDiaDb(), id),
      cancelar: (id) => cancelarCotizacion(alDiaDb(), id),
      borrar: (id) => borrarCotizacion(alDiaDb(), id),
      abrirPdf: async (id) => {
        const { pdf } = fichaCotizacion(alDiaDb(), id)
        if (!pdf) throw new Error('La cotización no tiene PDF')
        const error = await abrirCarpeta(join(info.dmmOsRoot, pdf))
        if (error) throw new Error(error)
      }
    },
    proyectos: {
      listar: () => listarProyectos(alDiaDb(), info.dmmOsRoot),
      ficha: (id) => fichaProyecto(alDiaDb(), info.dmmOsRoot, id),
      guardar: (proyecto) => guardarProyecto(alDiaDb(), info.dmmOsRoot, proyecto, hoy()),
      pausar: (id) => pausarProyecto(alDiaDb(), info.dmmOsRoot, id),
      reanudar: (id) => reanudarProyecto(alDiaDb(), info.dmmOsRoot, id),
      completar: (id) => completarProyecto(alDiaDb(), info.dmmOsRoot, id, hoy()),
      cancelar: (id) => cancelarProyecto(alDiaDb(), info.dmmOsRoot, id, hoy()),
      borrar: (id) => borrarProyecto(alDiaDb(), id),
      abrirCarpeta: async (id) => {
        const error = await abrirCarpeta(carpetaAbrible(alDiaDb(), info.dmmOsRoot, id))
        if (error) throw new Error(error)
      }
    },
    finanzas: {
      coberturaCostos: (desde, hasta) => coberturaCostos(alDiaDb(), desde, hasta),
      resumen: (periodo) => resumenFinanzas(alDiaDb(), periodo, hoy(), diasVencida()),
      configurarVencida: (dias) => {
        if (!Number.isInteger(dias) || dias < 1) throw new Error('Los días deben ser un entero mayor a cero')
        conexion.ajustes.escribir('finanzas.diasVencida', String(dias))
      },
      nuevoIngreso: (ingreso) => nuevoIngreso(alDiaDb(), ingreso, hoy()),
      nuevoCosto: (costo) => nuevoCosto(alDiaDb(), costo, hoy()),
      pagarIngreso: (id) => pagarIngreso(alDiaDb(), id, hoy()),
      cancelarIngreso: (id) => cancelarIngreso(alDiaDb(), id),
      borrarIngreso: (id) => borrarIngreso(alDiaDb(), id),
      reembolsar: (id, monto) => reembolsar(alDiaDb(), id, monto, hoy()),
      pagarCosto: (id) => pagarCosto(alDiaDb(), id, hoy()),
      cancelarCosto: (id) => cancelarCosto(alDiaDb(), id, hoy()),
      borrarCosto: (id) => borrarCosto(alDiaDb(), id, hoy()),
      detenerCosto: (id) => detenerCosto(alDiaDb(), id, hoy())
    },
    tareas: {
      listar: () => listarTareas(conexion.db, hoy()),
      agregar: (texto) => agregarTarea(conexion.db, texto, hoy()),
      completar: (id) => completarTarea(conexion.db, id, hoy()),
      borrar: (id) => borrarTarea(conexion.db, id, hoy())
    },
    inicio: {
      resumen: () => resumenInicio(alDiaDb(), info.dmmOsRoot, hoy(), diasVencida())
    },
    lab: {
      carpetas: () => carpetasLab(info.dmmOsRoot),
      archivos: (carpeta) => archivosLab(info.dmmOsRoot, carpeta),
      buscar: (consulta) => buscarLab(info.dmmOsRoot, consulta),
      vistaPrevia: (ruta) => vistaPreviaLab(info.dmmOsRoot, ruta),
      abrir: async (ruta) => {
        const error = await abrirCarpeta(rutaEnLab(info.dmmOsRoot, ruta))
        if (error) throw new Error(error)
      }
    },
    ai: {
      resumen: (periodo) => resumenAi(alDiaDb(), conexion.ajustes, info.dmmOsRoot, periodo, hoy()),
      leerUso: () => leerUso(conexion.db, conexion.ajustes, info.dmmOsRoot, ejecutarUso, ahora()),
      agentesYSkills: () => agentesYSkills(conexion.db, info.dmmOsRoot),
      abrir: async (archivo) => {
        const error = await abrirCarpeta(rutaAgenteOSkill(info.dmmOsRoot, archivo))
        if (error) throw new Error(error)
      }
    }
  }
}
