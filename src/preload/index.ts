import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type DmmApi } from '../shared/ipc'

const api: DmmApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),
  respaldos: {
    estado: () => ipcRenderer.invoke(IPC.respaldosEstado),
    crear: () => ipcRenderer.invoke(IPC.respaldosCrear),
    configurar: (config) => ipcRenderer.invoke(IPC.respaldosConfigurar, config),
    restaurar: (path) => ipcRenderer.invoke(IPC.respaldosRestaurar, path)
  }
}

contextBridge.exposeInMainWorld('dmm', api)
