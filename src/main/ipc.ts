import { IPC, type AppInfo } from '../shared/ipc'

interface IpcRegistrar {
  handle(channel: string, listener: (...args: unknown[]) => unknown): void
}

export function registerIpc(ipc: IpcRegistrar, info: AppInfo): void {
  ipc.handle(IPC.getAppInfo, () => info)
}
