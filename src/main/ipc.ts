import { contrato, recorrerContrato, type DmmHandlers } from '../shared/contrato'

interface IpcRegistrar {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void
}

/** Registers a handler for every endpoint in the contract; throws if one is missing. */
export function registerIpc(ipc: IpcRegistrar, handlers: DmmHandlers): void {
  recorrerContrato(contrato, (canal, ruta) => {
    const handler = ruta.reduce<unknown>((h, nombre) => (h as Record<string, unknown> | undefined)?.[nombre], handlers)
    if (typeof handler !== 'function') throw new Error(`Falta el handler de IPC para ${canal}`)
    ipc.handle(canal, (_event, ...args) => handler(...args))
  })
}
