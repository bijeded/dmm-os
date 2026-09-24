import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { CATEGORIAS_COSTO, NOMBRES_CATEGORIA_COSTO, type CategoriaCosto, type FilaContacto, type FilaProyecto } from '../../../shared/dominio'
import { hoy } from '../../../shared/fechas'
import { centavosDe } from '../../../shared/montos'
import { Campo } from './NuevaCotizacion'
import { Aviso, useAccion } from './Seccion'
import { Button } from './ui/button'
import { campoCls, tituloCls } from './estilos'
import { useRuta } from './ruta'

function Formulario({ titulo, accion, ocupado, guardar, error, children }: { titulo: string; accion: string; ocupado: boolean; guardar: () => void; error: string | null; children: ReactNode }) {
  const navigate = useNavigate()
  useRuta(titulo)

  return (
    <>
      <div className="acts flex flex-wrap items-center justify-between gap-3">
        <h1 className={tituloCls}>{titulo}</h1>
        <div className="flex gap-2">
          <Button variant="ghost" disabled={ocupado} onClick={() => navigate('/finanzas')}>
            Cancelar
          </Button>
          <Button disabled={ocupado} onClick={guardar}>
            {accion}
          </Button>
        </div>
      </div>
      <Aviso error={error} />
      <section className="card grid grid-cols-2 gap-4 rounded-control border border-border p-6" aria-label="Datos">
        {children}
      </section>
    </>
  )
}

function useProyectos() {
  const [proyectos, setProyectos] = useState<FilaProyecto[]>([])
  const [contactos, setContactos] = useState<FilaContacto[]>([])
  const { error, ocupado, correr } = useAccion()
  useEffect(() => {
    correr(async () => {
      const [ps, cs] = await Promise.all([window.dmm.proyectos.listar(), window.dmm.contactos.listar()])
      setProyectos(ps.proyectos)
      setContactos(cs.contactos)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, [])
  return { proyectos, contactos, error, ocupado, correr }
}

function ElegirProyecto({ valor, proyectos, cambiar }: { valor: number | null; proyectos: FilaProyecto[]; cambiar: (id: number | null) => void }) {
  return (
    <Campo label="Proyecto">
      <select value={valor ?? ''} onChange={(e) => cambiar(e.target.value ? Number(e.target.value) : null)} className={campoCls}>
        <option value="">Sin proyecto</option>
        {proyectos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.referencia} · {p.nombre}
          </option>
        ))}
      </select>
    </Campo>
  )
}

/** Nuevo ingreso: typically uninvoiced history, which the Facturas run never brings in. */
export function NuevoIngreso() {
  const navigate = useNavigate()
  const { proyectos, contactos, error, ocupado, correr } = useProyectos()
  const [categoria, setCategoria] = useState<'factura' | 'sin_factura'>('sin_factura')
  const [facturado, setFacturado] = useState(false)
  const [proyectoId, setProyectoId] = useState<number | null>(null)
  const [contactoId, setContactoId] = useState<number | null>(null)
  const [fecha, setFecha] = useState(hoy)
  const [monto, setMonto] = useState('')
  const [conIva, setConIva] = useState(false)
  const [pagado, setPagado] = useState(true)
  const [notas, setNotas] = useState('')

  const guardar = () =>
    correr(async () => {
      const factura = categoria === 'factura'
      await window.dmm.finanzas.nuevoIngreso({
        categoria,
        facturado: factura && facturado,
        contactoId: proyectoId === null ? contactoId : null,
        proyectoId,
        fecha,
        subtotal: centavosDe(monto),
        conIva: factura && conIva,
        pagado,
        notas: notas || null
      })
      navigate('/finanzas')
    })

  return (
    <Formulario titulo="Nuevo ingreso" accion="Registrar ingreso" ocupado={ocupado} guardar={guardar} error={error}>
      <Campo label="Tipo">
        <select value={categoria} onChange={(e) => setCategoria(e.target.value as typeof categoria)} className={campoCls}>
          <option value="sin_factura">Sin factura</option>
          <option value="factura">Factura</option>
        </select>
      </Campo>
      <ElegirProyecto valor={proyectoId} proyectos={proyectos} cambiar={setProyectoId} />
      {proyectoId === null && (
        <Campo label="Contacto">
          <select value={contactoId ?? ''} onChange={(e) => setContactoId(e.target.value ? Number(e.target.value) : null)} className={campoCls}>
            <option value="">Sin contacto</option>
            {contactos.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nombre}
              </option>
            ))}
          </select>
        </Campo>
      )}
      <Campo label="Fecha">
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={campoCls} />
      </Campo>
      <Campo label="Monto (antes de IVA)">
        <input inputMode="decimal" placeholder="0.00" value={monto} onChange={(e) => setMonto(e.target.value)} className={campoCls} />
      </Campo>
      <div className="flex flex-col justify-end gap-2 text-[13px] text-on-surface">
        {categoria === 'factura' && (
          <>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={conIva} onChange={(e) => setConIva(e.target.checked)} /> Más 16% IVA
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={facturado} onChange={(e) => setFacturado(e.target.checked)} /> Ya facturado
            </label>
          </>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={pagado} onChange={(e) => setPagado(e.target.checked)} /> Pagado en esa fecha
        </label>
      </div>
      <Campo label="Notas">
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} className={`${campoCls} h-20 py-2`} />
      </Campo>
    </Formulario>
  )
}

/** Nuevo costo: one-time, or a monthly, MSI or annual series that generates a Costo per period. */
export function NuevoCosto() {
  const navigate = useNavigate()
  const { proyectos, error, ocupado, correr } = useProyectos()
  const [nombre, setNombre] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [referencia, setReferencia] = useState('')
  const [categoria, setCategoria] = useState<CategoriaCosto>('unico')
  const [proyectoId, setProyectoId] = useState<number | null>(null)
  const [fecha, setFecha] = useState(hoy)
  const [monto, setMonto] = useState('')
  const [conIva, setConIva] = useState(false)
  const [parcialidades, setParcialidades] = useState('12')
  const [suscripcionIa, setSuscripcionIa] = useState(false)
  const [pagado, setPagado] = useState(true)
  const unico = categoria === 'unico'

  const guardar = () =>
    correr(async () => {
      await window.dmm.finanzas.nuevoCosto({
        nombre,
        proveedor: proveedor || null,
        referencia: referencia || null,
        categoria,
        proyectoId,
        fecha,
        subtotal: centavosDe(monto),
        conIva,
        parcialidades: categoria === 'msi' ? Number(parcialidades) : null,
        suscripcionIa,
        pagado: unico && pagado
      })
      navigate('/finanzas')
    })

  return (
    <Formulario titulo="Nuevo costo" accion="Registrar costo" ocupado={ocupado} guardar={guardar} error={error}>
      <Campo label="Nombre">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={campoCls} />
      </Campo>
      <Campo label="Proveedor">
        <input value={proveedor} onChange={(e) => setProveedor(e.target.value)} className={campoCls} />
      </Campo>
      <Campo label="Tipo">
        <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaCosto)} className={campoCls}>
          {CATEGORIAS_COSTO.map((c) => (
            <option key={c} value={c}>
              {NOMBRES_CATEGORIA_COSTO[c]}
            </option>
          ))}
        </select>
      </Campo>
      <ElegirProyecto valor={proyectoId} proyectos={proyectos} cambiar={setProyectoId} />
      <Campo label={unico ? 'Fecha' : 'Primer pago'}>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={campoCls} />
      </Campo>
      <Campo label={categoria === 'msi' ? 'Monto por mensualidad' : unico ? 'Monto (antes de IVA)' : 'Monto por periodo'}>
        <input inputMode="decimal" placeholder="0.00" value={monto} onChange={(e) => setMonto(e.target.value)} className={campoCls} />
      </Campo>
      {categoria === 'msi' && (
        <Campo label="Mensualidades">
          <input type="number" min={2} value={parcialidades} onChange={(e) => setParcialidades(e.target.value)} className={campoCls} />
        </Campo>
      )}
      {unico && (
        <Campo label="Referencia">
          <input value={referencia} onChange={(e) => setReferencia(e.target.value)} className={campoCls} />
        </Campo>
      )}
      <div className="flex flex-col justify-end gap-2 text-[13px] text-on-surface">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={conIva} onChange={(e) => setConIva(e.target.checked)} /> Más 16% IVA
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={suscripcionIa} onChange={(e) => setSuscripcionIa(e.target.checked)} /> Suscripción de IA
        </label>
        {unico && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={pagado} onChange={(e) => setPagado(e.target.checked)} /> Pagado en esa fecha
          </label>
        )}
      </div>
      {!unico && <p className="col-span-2 m-0 text-[13px] text-on-surface-muted">Se genera un costo pendiente por periodo hasta el mes actual; márcalos pagados en Finanzas.</p>}
    </Formulario>
  )
}
