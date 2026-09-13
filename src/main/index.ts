import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { createBackupService, installRestore, stageRestore } from './backup'
import { openDatabase } from './db'
import { registerIpc } from './ipc'

app.setName('DMM OS')

const HOUR_MS = 60 * 60 * 1000

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

  let opened: ReturnType<typeof openDatabase>
  try {
    opened = openDatabase(dbPath, migrationsFolder, {
      beforeMigrate: (s) => createBackupService({ sqlite: s, dir: backupsDir }).backupNow('migracion')
    })
  } catch (e) {
    // No migration runs without its backup; tell the user instead of exiting silently.
    dialog.showErrorBox('DMM OS no pudo abrir la base de datos', `No se pudo respaldar antes de actualizar los datos en ${backupsDir}.\n\n${String(e)}`)
    app.exit(1)
    return
  }
  const { sqlite, close } = opened
  app.on('will-quit', close)

  const respaldos = createBackupService({ sqlite, dir: backupsDir })
  const scheduled = () => {
    try {
      respaldos.respaldarSiToca()
    } catch (e) {
      console.error('[respaldos] scheduled backup failed', e)
    }
  }
  scheduled()
  const timer = setInterval(scheduled, HOUR_MS)

  registerIpc(ipcMain, { version: app.getVersion(), dbPath, dmmOsRoot: join(homedir(), 'Desktop', 'DMM OS') }, {
    estado: () => respaldos.estado(),
    crear: () => respaldos.backupNow('manual'),
    configurar: (config) => {
      respaldos.configurar(config)
      return respaldos.estado()
    },
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
      // Stage first: the safety backup below may prune the file being restored.
      const staged = stageRestore(source, dbPath, migrationsFolder)
      try {
        respaldos.backupNow('antes-de-restaurar')
      } catch (e) {
        rmSync(staged, { force: true })
        throw e
      }
      clearInterval(timer)
      close()
      installRestore(staged, dbPath)
      app.relaunch()
      app.exit(0)
      return { restaurado: true }
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
