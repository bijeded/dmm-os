import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type DmmApi } from '../shared/ipc'

const api: DmmApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo)
}

contextBridge.exposeInMainWorld('dmm', api)
