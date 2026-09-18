import type { DmmApi } from '../shared/contrato'

declare global {
  interface Window {
    dmm: DmmApi
  }
}
