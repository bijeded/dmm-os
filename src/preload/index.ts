import { contextBridge, ipcRenderer } from 'electron'
import { crearApi } from '../shared/contrato'

contextBridge.exposeInMainWorld('dmm', crearApi((canal, ...args) => ipcRenderer.invoke(canal, ...args)))
