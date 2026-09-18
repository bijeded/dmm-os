import type { RouteObject } from 'react-router'
import { AppShell } from './components/AppShell'
import { Configuracion } from './components/Configuracion'
import { Contactos } from './components/Contactos'
import { FichaContacto } from './components/FichaContacto'
import { SectionPage } from './components/SectionPage'
import { sections } from './sections'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      ...sections.map(({ path, label }) => {
        const element = path === '/configuracion' ? <Configuracion /> : path === '/contactos' ? <Contactos /> : <SectionPage title={label} />
        return path === '/' ? { index: true, element } : { path: path.slice(1), element }
      }),
      { path: 'contactos/:id', element: <FichaContacto /> }
    ]
  }
]
