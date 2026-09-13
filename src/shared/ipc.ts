export const IPC = {
  getAppInfo: 'app:get-info',
  respaldosEstado: 'respaldos:estado',
  respaldosCrear: 'respaldos:crear',
  respaldosConfigurar: 'respaldos:configurar',
  respaldosRestaurar: 'respaldos:restaurar'
} as const

export const MOTIVOS_RESPALDO = ['semanal', 'migracion', 'manual', 'antes-de-restaurar'] as const
export type MotivoRespaldo = (typeof MOTIVOS_RESPALDO)[number]

export interface Respaldo {
  archivo: string
  path: string
  creadoEn: string
  motivo: MotivoRespaldo
  bytes: number
}

export interface EstadoRespaldos extends ConfigRespaldos {
  dir: string
  ultimo: string | null
  respaldos: Respaldo[]
}

export interface ConfigRespaldos {
  frecuenciaDias: number
  conservar: number
}

/** `restaurado: false` means the user cancelled the file picker. On success the app relaunches. */
export type ResultadoRestaurar = { restaurado: boolean }

export interface AppInfo {
  version: string
  dbPath: string
  dmmOsRoot: string
}

/** API exposed to the renderer as `window.dmm`. */
export interface DmmApi {
  getAppInfo(): Promise<AppInfo>
  respaldos: {
    estado(): Promise<EstadoRespaldos>
    crear(): Promise<Respaldo>
    configurar(config: ConfigRespaldos): Promise<EstadoRespaldos>
    /** Without a path the user picks the file. On success the app relaunches. */
    restaurar(path?: string): Promise<ResultadoRestaurar>
  }
}
