export const IPC = {
  getAppInfo: 'app:get-info'
} as const

export interface AppInfo {
  version: string
  dbPath: string
  dmmOsRoot: string
}

/** API exposed to the renderer as `window.dmm`. */
export interface DmmApi {
  getAppInfo(): Promise<AppInfo>
}
