import type { DmmApi } from '../shared/ipc'

declare global {
  interface Window {
    dmm: DmmApi
  }
}
