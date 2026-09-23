import type { ReactElement } from 'react'
import type { RouteObject } from 'react-router'
import { Ai } from './components/Ai'
import { AppShell } from './components/AppShell'
import { Configuracion } from './components/Configuracion'
import { Contactos } from './components/Contactos'
import { Cotizaciones } from './components/Cotizaciones'
import { FichaCotizacion } from './components/FichaCotizacion'
import { FichaContacto } from './components/FichaContacto'
import { FichaProyecto } from './components/FichaProyecto'
import { Finanzas } from './components/Finanzas'
import { Inicio } from './components/Inicio'
import { Lab } from './components/Lab'
import { NuevaCotizacion } from './components/NuevaCotizacion'
import { NuevoCosto, NuevoIngreso } from './components/NuevoMovimiento'
import { NuevoProyecto } from './components/NuevoProyecto'
import { Proyectos } from './components/Proyectos'
import { SectionPage } from './components/SectionPage'
import { sections } from './sections'

// Sections with a screen of their own; the rest show a placeholder.
const pantallas: Record<string, ReactElement> = {
  '/': <Inicio />,
  '/ai': <Ai />,
  '/configuracion': <Configuracion />,
  '/contactos': <Contactos />,
  '/cotizaciones': <Cotizaciones />,
  '/finanzas': <Finanzas />,
  '/lab': <Lab />,
  '/proyectos': <Proyectos />
}

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      ...sections.map(({ path, label }) => {
        const element = pantallas[path] ?? <SectionPage title={label} />
        return path === '/' ? { index: true, element } : { path: path.slice(1), element }
      }),
      { path: 'contactos/:id', element: <FichaContacto /> },
      { path: 'cotizaciones/nueva', element: <NuevaCotizacion /> },
      { path: 'cotizaciones/:id', element: <FichaCotizacion /> },
      { path: 'cotizaciones/:id/editar', element: <NuevaCotizacion /> },
      { path: 'proyectos/nuevo', element: <NuevoProyecto /> },
      { path: 'proyectos/:id', element: <FichaProyecto /> },
      { path: 'proyectos/:id/editar', element: <NuevoProyecto /> },
      { path: 'finanzas/ingresos/nuevo', element: <NuevoIngreso /> },
      { path: 'finanzas/costos/nuevo', element: <NuevoCosto /> }
    ]
  }
]
