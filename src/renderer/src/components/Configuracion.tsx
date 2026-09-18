import { Catalogo } from './Catalogo'
import { Exportar } from './Exportar'
import { Logs } from './Logs'
import { Ubicacion } from './Ubicacion'

/** Configuración: where the app reads, what the imports found, default prices, and where the backups go. */
export function Configuracion() {
  return (
    <>
      <h1 className="m-0 font-display text-[29px] leading-[1.22] font-bold tracking-[-.01em] text-on-surface uppercase">Configuración</h1>
      <Ubicacion />
      <Catalogo />
      <Logs />
      <Exportar />
    </>
  )
}
