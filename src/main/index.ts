import { join } from 'node:path'
import { homedir } from 'node:os'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { createRespaldos } from './backup'
import { createDatabase, type Conexion } from './db'
import { crearHandlers } from './handlers'
import { registerIpc } from './ipc'

app.setName('DMM OS')

/** Prints a page of HTML to a Letter PDF in a hidden window, backgrounds included. */
async function imprimirPdf(html: string): Promise<Uint8Array> {
  const win = new BrowserWindow({ show: false, webPreferences: { javascript: false } })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    return await win.webContents.printToPDF({ pageSize: 'Letter', printBackground: true, preferCSSPageSize: true })
  } finally {
    win.destroy()
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#0A0A0B',
    titleBarStyle: 'hiddenInset',
    // Centered on the header's 48px row, level with the DMM OS / <sección> path
    trafficLightPosition: { x: 18, y: 17 },
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
  const elegir = async (options: Electron.OpenDialogOptions) => {
    const picked = await dialog.showOpenDialog(options)
    return picked.canceled ? undefined : picked.filePaths[0]
  }

  registerIpc(
    ipcMain,
    crearHandlers({
      conexion,
      info,
      respaldos,
      elegirRespaldo: () =>
        elegir({
          title: 'Restaurar respaldo',
          defaultPath: backupsDir,
          properties: ['openFile'],
          filters: [{ name: 'Respaldo de DMM OS', extensions: ['db'] }]
        }),
      elegirHdd: () =>
        elegir({
          title: 'Disco externo',
          message: 'Elige la carpeta del disco externo, organizada como DMM OS',
          properties: ['openDirectory']
        }),
      abrirCarpeta: (path) => shell.openPath(path),
      imprimirPdf
    })
  )
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
