import { Bot, Contact, FileText, FlaskConical, FolderKanban, LayoutGrid, Settings, Wallet, type LucideIcon } from 'lucide-react'

export interface Section {
  path: string
  label: string
  icon: LucideIcon
}

export const sections: Section[] = [
  { path: '/', label: 'Inicio', icon: LayoutGrid },
  { path: '/contactos', label: 'Contactos', icon: Contact },
  { path: '/cotizaciones', label: 'Cotizaciones', icon: FileText },
  { path: '/proyectos', label: 'Proyectos', icon: FolderKanban },
  { path: '/finanzas', label: 'Finanzas', icon: Wallet },
  { path: '/lab', label: 'Lab', icon: FlaskConical },
  { path: '/ai', label: 'AI', icon: Bot },
  { path: '/configuracion', label: 'Configuración', icon: Settings }
]
