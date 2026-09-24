import { Catalogo } from './Catalogo'
import { Exportar } from './Exportar'
import { tituloCls } from './estilos'
import { Logs } from './Logs'
import { Ubicacion } from './Ubicacion'

/** Configuración: where the app reads, what the imports found, default prices, and where the backups go. */
export function Configuracion() {
  return (
    <>
      <h1 className={tituloCls}>Configuración</h1>
      <Ubicacion />
      <Catalogo />
      <Logs />
      <Exportar />
    </>
  )
}
