import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { CATEGORIAS, NOMBRES_CATEGORIA, type Categoria, type FilaContacto, type ProyectoNuevo } from '../../../shared/ipc'
import { tituloCls } from './Contactos'
import { Campo, campoCls } from './NuevaCotizacion'
import { Aviso, useAccion } from './Seccion'
import { Button } from './ui/button'

const vacio = (): ProyectoNuevo => ({
  nombre: '',
  etiqueta: 'cliente',
  contactoId: null,
  clienteFinal: null,
  categoria: 'website',
  fechaInicio: null,
  fechaEntrega: null,
  notas: null
})

/**
 * Nuevo proyecto, or editing one (`/proyectos/:id/editar`). Creating it scaffolds its folder
 * in `Proyectos/`. A personal Proyecto has no Contacto; one from a Cotización keeps its Contacto.
 */
export function NuevoProyecto() {
  const params = useParams()
  const editando = params.id ? Number(params.id) : undefined
  const navigate = useNavigate()
  const [p, setP] = useState<ProyectoNuevo>(vacio)
  const [deCotizacion, setDeCotizacion] = useState(false)
  const [contactos, setContactos] = useState<FilaContacto[]>([])
  const { error, ocupado, correr } = useAccion()

  useEffect(() => {
    correr(async () => {
      setContactos((await window.dmm.contactos.listar()).contactos)
      if (editando !== undefined) {
        const f = await window.dmm.proyectos.ficha(editando)
        setP({ ...f, id: f.id })
        setDeCotizacion(f.cotizacionId !== null)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per Proyecto
  }, [editando])

  const cambiar = (cambios: Partial<ProyectoNuevo>) => setP((prev) => ({ ...prev, ...cambios }))
  const texto = (v: string) => v || null
  const personal = p.etiqueta === 'personal'

  const guardar = () =>
    correr(async () => {
      if (!personal && p.contactoId === null) throw new Error('Elige un contacto')
      const f = await window.dmm.proyectos.guardar(personal ? { ...p, contactoId: null, clienteFinal: null } : p)
      navigate(`/proyectos/${f.id}`)
    })

  return (
    <>
      <nav aria-label="Ruta" className="font-mono text-[10px] tracking-[.12em] text-on-surface-muted uppercase">
        <Link to="/proyectos" className="text-primary-text">
          Proyectos
        </Link>{' '}
        / {editando ? 'Editar' : 'Nuevo'}
      </nav>
      <div className="acts flex flex-wrap items-center justify-between gap-3">
        <h1 className={tituloCls}>{editando ? 'Editar proyecto' : 'Nuevo proyecto'}</h1>
        <div className="flex gap-2">
          <Button variant="ghost" disabled={ocupado} onClick={() => navigate(editando ? `/proyectos/${editando}` : '/proyectos')}>
            Cancelar
          </Button>
          <Button disabled={ocupado} onClick={guardar}>
            {editando ? 'Guardar' : 'Crear proyecto'}
          </Button>
        </div>
      </div>
      <Aviso error={error} />

      <section className="card grid grid-cols-2 gap-4 rounded-control border border-border p-6" aria-label="Datos">
        <Campo label="Nombre">
          <input value={p.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} className={campoCls} />
        </Campo>
        <Campo label="Tipo">
          <select
            value={p.etiqueta}
            disabled={deCotizacion}
            onChange={(e) => cambiar({ etiqueta: e.target.value as ProyectoNuevo['etiqueta'] })}
            className={campoCls}
          >
            <option value="cliente">Cliente</option>
            <option value="personal">Personal</option>
          </select>
        </Campo>
        {!personal && (
          <>
            <Campo label="Contacto">
              <select
                value={p.contactoId ?? ''}
                disabled={deCotizacion}
                onChange={(e) => cambiar({ contactoId: e.target.value ? Number(e.target.value) : null })}
                className={campoCls}
              >
                <option value="">Elige un contacto</option>
                {contactos.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Cliente final">
              <input value={p.clienteFinal ?? ''} onChange={(e) => cambiar({ clienteFinal: texto(e.target.value) })} className={campoCls} />
            </Campo>
          </>
        )}
        <Campo label="Categoría">
          <select value={p.categoria} onChange={(e) => cambiar({ categoria: e.target.value as Categoria })} className={campoCls}>
            {CATEGORIAS.map((k) => (
              <option key={k} value={k}>
                {NOMBRES_CATEGORIA[k]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Inicio">
          <input type="date" value={p.fechaInicio ?? ''} onChange={(e) => cambiar({ fechaInicio: texto(e.target.value) })} className={campoCls} />
        </Campo>
        <Campo label="Entrega">
          <input type="date" value={p.fechaEntrega ?? ''} onChange={(e) => cambiar({ fechaEntrega: texto(e.target.value) })} className={campoCls} />
        </Campo>
        <Campo label="Notas">
          <textarea value={p.notas ?? ''} onChange={(e) => cambiar({ notas: texto(e.target.value) })} className={`${campoCls} h-20 py-2`} />
        </Campo>
      </section>
      {!editando && <p className="m-0 text-[13px] text-on-surface-muted">Al crearlo se genera su carpeta en Proyectos/.</p>}
    </>
  )
}
