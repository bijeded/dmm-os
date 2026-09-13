import { IPC, type AppInfo, type ConfigRespaldos, type EstadoRespaldos, type Respaldo, type ResultadoRestaurar } from '../shared/ipc'

interface IpcRegistrar {
  handle(channel: string, listener: (...args: unknown[]) => unknown): void
}

export interface RespaldosHandlers {
  estado(): EstadoRespaldos
  crear(): Respaldo
  configurar(config: ConfigRespaldos): EstadoRespaldos
  /** Without a path the user picks the file. */
  restaurar(path?: string): Promise<ResultadoRestaurar>
}

export function registerIpc(ipc: IpcRegistrar, info: AppInfo, respaldos?: RespaldosHandlers): void {
  ipc.handle(IPC.getAppInfo, () => info)
  if (!respaldos) return
  ipc.handle(IPC.respaldosEstado, () => respaldos.estado())
  ipc.handle(IPC.respaldosCrear, () => respaldos.crear())
  ipc.handle(IPC.respaldosConfigurar, (_event, config) => respaldos.configurar(config as ConfigRespaldos))
  ipc.handle(IPC.respaldosRestaurar, (_event, path) => respaldos.restaurar(path as string | undefined))
}
