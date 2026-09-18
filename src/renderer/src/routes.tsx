import type { RouteObject } from 'react-router'
import { AppShell } from './components/AppShell'
import { Configuracion } from './components/Configuracion'
import { Contactos } from './components/Contactos'
import { Cotizaciones } from './components/Cotizaciones'
import { FichaCotizacion } from './components/FichaCotizacion'
import { FichaContacto } from './components/FichaContacto'
import { NuevaCotizacion } from './components/NuevaCotizacion'
import { SectionPage } from './components/SectionPage'
import { sections } from './sections'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      ...sections.map(({ path, label }) => {
        const element =
          path === '/configuracion' ? (
            <Configuracion />
          ) : path === '/contactos' ? (
            <Contactos />
          ) : path === '/cotizaciones' ? (
            <Cotizaciones />
          ) : (
            <SectionPage title={label} />
          )
        return path === '/' ? { index: true, element } : { path: path.slice(1), element }
      }),
      { path: 'contactos/:id', element: <FichaContacto /> },
      { path: 'cotizaciones/nueva', element: <NuevaCotizacion /> },
      { path: 'cotizaciones/:id', element: <FichaCotizacion /> },
      { path: 'cotizaciones/:id/editar', element: <NuevaCotizacion /> }
    ]
  }
]
