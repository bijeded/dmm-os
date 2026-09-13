import { contextBridge, ipcRenderer } from 'electron'
import { crearApi } from '../shared/ipc'

contextBridge.exposeInMainWorld('dmm', crearApi((canal, ...args) => ipcRenderer.invoke(canal, ...args)))
