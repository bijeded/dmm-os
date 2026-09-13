import type { RouteObject } from 'react-router'
import { AppShell } from './components/AppShell'
import { Configuracion } from './components/Configuracion'
import { SectionPage } from './components/SectionPage'
import { sections } from './sections'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: sections.map(({ path, label }) => {
      const element = path === '/configuracion' ? <Configuracion /> : <SectionPage title={label} />
      return path === '/' ? { index: true, element } : { path: path.slice(1), element }
    })
  }
]
