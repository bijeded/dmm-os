import { join } from 'node:path'
import { homedir } from 'node:os'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { createRespaldos } from './backup'
import { importarFacturas } from './facturas'
import { escanearCarpetas } from './escaneo'
import { coberturaCostos } from './db/cobertura'
import { createDatabase, type Conexion } from './db'
import { registerIpc } from './ipc'

app.setName('DMM OS')

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#0A0A0B',
    titleBarStyle: 'hiddenInset',
    webPreferences: { preload: join(import.meta.dirname, '../preload/index.mjs'), sandbox: false }
  })
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  // ~/Library/Application Support/DMM OS/
  const dbPath = join(app.getPath('userData'), 'dmm-os.db')
  const migrationsFolder = app.isPackaged ? join(process.resourcesPath, 'drizzle') : join(app.getAppPath(), 'drizzle')
  const backupsDir = join(homedir(), 'Desktop', 'Vault', 'Backups', 'DMM OS', 'DB')

  const database = createDatabase(migrationsFolder)
  const respaldos = createRespaldos({
    dir: backupsDir,
    dbPath,
    database,
    relaunch: () => {
      app.relaunch()
      app.exit(0)
    }
  })

  let conexion: Conexion
  try {
    conexion = database.abrir(dbPath, { antesDeMigrar: respaldos.antesDeMigrar })
  } catch (e) {
    // No migration runs without its backup; tell the user instead of exiting silently.
    dialog.showErrorBox('DMM OS no pudo abrir la base de datos', `No se pudo respaldar antes de actualizar los datos en ${backupsDir}.\n\n${String(e)}`)
    app.exit(1)
    return
  }
  app.on('will-quit', () => conexion.close())
  respaldos.conectar(conexion)
  respaldos.iniciar()

  const info = { version: app.getVersion(), dbPath, dmmOsRoot: join(homedir(), 'Desktop', 'DMM OS') }
  // The external HDD is organised like the main root, and is usually disconnected. Its path is
  // read per rescan, so plugging the drive in needs no restart; when it is absent its Proyectos
  // become No disponible, never lost.
  const hddRoot = () => conexion.ajustes.leer('hdd.root')
  registerIpc(ipcMain, {
    getAppInfo: () => info,
    respaldos: {
      estado: respaldos.estado,
      crear: respaldos.crear,
      configurar: respaldos.configurar,
      restaurar: async (path) => {
        let source = path
        if (!source) {
          const picked = await dialog.showOpenDialog({
            title: 'Restaurar respaldo',
            defaultPath: backupsDir,
            properties: ['openFile'],
            filters: [{ name: 'Respaldo de DMM OS', extensions: ['db'] }]
          })
          if (picked.canceled || !picked.filePaths[0]) return { restaurado: false }
          source = picked.filePaths[0]
        }
        return respaldos.restaurar(source)
      }
    },
    importacion: {
      facturas: () => importarFacturas(conexion.db, info.dmmOsRoot),
      carpetas: () => escanearCarpetas(conexion.db, info.dmmOsRoot, hddRoot())
    },
    finanzas: {
      coberturaCostos: (desde, hasta) => coberturaCostos(conexion.db, desde, hasta)
    }
  })
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
