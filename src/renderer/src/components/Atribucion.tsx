import { useEffect, useState } from 'react'
import { NOMBRES_ESTADO_PROYECTO, type EntidadCambioContacto, type FilaContacto, type OpcionesAsignar, type PreviaCambioContacto } from '../../../shared/dominio'
import { Campo } from './NuevaCotizacion'
import { campoCls } from './estilos'
import { Aviso, useAccion } from './Seccion'
import { Button } from './ui/button'

// The corrections of attribution, as dialogs: Fusionar en…, Cambiar contacto and Asignar proyecto.
// Main decides what is allowed and refuses the rest; each dialog shows why in place, and closing
// one writes nothing.

function Dialogo({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby={id} className="card flex w-full max-w-md flex-col gap-4 rounded-control border border-border-strong bg-surface-raised p-6">
        <h2 id={id} className="m-0 text-[15px] font-semibold text-on-surface">
          {titulo}
        </h2>
        {children}
      </div>
    </div>
  )
}

const textoCls = 'm-0 text-[13px] text-on-surface-muted'

/** The other Contactos, by name, to choose where records go. */
function useOtrosContactos(excepto: number | null) {
  const [contactos, setContactos] = useState<FilaContacto[]>([])
  const accion = useAccion()
  useEffect(() => {
    accion.correr(async () => setContactos((await window.dmm.contactos.listar()).contactos.filter((c) => c.id !== excepto)))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per dialog
  }, [excepto])
  return { contactos, ...accion }
}

function ElegirContacto({ contactos, valor, onCambio }: { contactos: FilaContacto[]; valor: number | null; onCambio: (id: number | null) => void }) {
  return (
    <Campo label="Contacto">
      <select value={valor ?? ''} onChange={(e) => onCambio(e.target.value ? Number(e.target.value) : null)} className={campoCls}>
        <option value="">Elige un contacto</option>
        {[...contactos]
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
      </select>
    </Campo>
  )
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/**
 * Fusionar en…: everything of this Contacto moves to the one chosen, which keeps its name and takes
 * this one's details where it has none; this Contacto is deleted.
 */
export function FusionarContacto({
  contacto,
  cuenta,
  onFusionado,
  onCerrar
}: {
  contacto: { id: number; nombre: string }
  cuenta: { cotizaciones: number; proyectos: number }
  onFusionado: (destinoId: number) => void
  onCerrar: () => void
}) {
  const { contactos, error, ocupado, correr } = useOtrosContactos(contacto.id)
  const [destino, setDestino] = useState<number | null>(null)
  const nombreDestino = contactos.find((c) => c.id === destino)?.nombre

  return (
    <Dialogo id="fusionar-titulo" titulo={`Fusionar a ${contacto.nombre} en…`}>
      <ElegirContacto contactos={contactos} valor={destino} onCambio={setDestino} />
      {nombreDestino && (
        <p className={textoCls}>
          {plural(cuenta.cotizaciones, 'cotización', 'cotizaciones')}, {plural(cuenta.proyectos, 'proyecto', 'proyectos')} y sus pagos pasan a {nombreDestino}, que conserva
          su nombre. {contacto.nombre} se elimina; su carpeta en disco no se toca.
        </p>
      )}
      <Aviso error={error} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar}>
          Cancelar
        </Button>
        <Button disabled={ocupado || destino === null} onClick={() => correr(async () => onFusionado(await window.dmm.contactos.fusionar(contacto.id, destino!)))}>
          Fusionar
        </Button>
      </div>
    </Dialogo>
  )
}

/**
 * Cambiar contacto: the Cotización and its Proyecto move together, with their Ingresos. What would
 * move, and the Contacto it would delete, is shown before confirming.
 */
export function CambiarContacto<F>({
  entidad,
  id,
  contactoId,
  onCambiado,
  onCerrar
}: {
  entidad: EntidadCambioContacto
  id: number
  contactoId: number
  onCambiado: (ficha: F) => void
  onCerrar: () => void
}) {
  const { contactos, error, ocupado, correr } = useOtrosContactos(contactoId)
  const [destino, setDestino] = useState<number | null>(null)
  const [previa, setPrevia] = useState<PreviaCambioContacto | null>(null)
  const nombreDestino = contactos.find((c) => c.id === destino)?.nombre

  const elegir = (nuevo: number | null) => {
    setDestino(nuevo)
    setPrevia(null)
    if (nuevo !== null) correr(async () => setPrevia(await window.dmm.contactos.previaCambio(entidad, id, nuevo)))
  }
  const cambiar = () =>
    correr(async () => {
      const api = entidad === 'cotizacion' ? window.dmm.cotizaciones : window.dmm.proyectos
      onCambiado((await api.cambiarContacto(id, destino!)) as F)
    })

  return (
    <Dialogo id="cambiar-contacto-titulo" titulo="Cambiar contacto">
      <ElegirContacto contactos={contactos} valor={destino} onCambio={elegir} />
      {previa && nombreDestino && (
        <p className={textoCls}>
          Pasan a {nombreDestino}: {plural(previa.cotizaciones, 'cotización', 'cotizaciones')}, {plural(previa.proyectos, 'proyecto', 'proyectos')} y{' '}
          {plural(previa.ingresos, 'ingreso', 'ingresos')}.
          {previa.borraContacto && ` ${previa.borraContacto} se queda sin registros y se elimina.`}
        </p>
      )}
      <Aviso error={error} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar}>
          Cancelar
        </Button>
        <Button disabled={ocupado || previa === null} onClick={cambiar}>
          Cambiar contacto
        </Button>
      </div>
    </Dialogo>
  )
}

const SIN_PROYECTO = ''

/**
 * Asignar proyecto: puts an imported invoice (its Parcialidades and Reembolsos together) on another
 * Proyecto of its Contacto, or on none. An invoice with no Contacto can go to any client Proyecto and
 * takes its Contacto.
 */
export function AsignarProyecto({ ingresoId, onAsignado, onCerrar }: { ingresoId: number; onAsignado: () => void; onCerrar: () => void }) {
  const [opciones, setOpciones] = useState<OpcionesAsignar | null>(null)
  const [elegido, setElegido] = useState(SIN_PROYECTO)
  const { error, ocupado, correr } = useAccion()

  useEffect(() => {
    correr(async () => {
      const o = await window.dmm.finanzas.opcionesAsignar(ingresoId)
      setOpciones(o)
      setElegido(o.actual === null ? SIN_PROYECTO : String(o.actual))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per invoice
  }, [ingresoId])

  const asignar = () =>
    correr(async () => {
      await window.dmm.finanzas.asignarProyecto(ingresoId, elegido === SIN_PROYECTO ? null : Number(elegido))
      onAsignado()
    })

  return (
    <Dialogo id="asignar-titulo" titulo={`Asignar proyecto al ingreso ${ingresoId}`}>
      {opciones && (
        <Campo label="Proyecto">
          <select value={elegido} onChange={(e) => setElegido(e.target.value)} className={campoCls}>
            <option value={SIN_PROYECTO}>Sin proyecto</option>
            {opciones.proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {[p.nombre, opciones.sinContacto && p.contacto, NOMBRES_ESTADO_PROYECTO[p.estado]].filter(Boolean).join(' · ')}
                {p.id === opciones.actual ? ' (actual)' : ''}
              </option>
            ))}
          </select>
        </Campo>
      )}
      {opciones?.sinContacto && <p className={textoCls}>La factura no tiene contacto: toma el del proyecto que elijas. Su RFC no se asigna a ese contacto.</p>}
      <p className={textoCls}>Se mueven juntas todas sus parcialidades y reembolsos.</p>
      <Aviso error={error} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar}>
          Cancelar
        </Button>
        <Button disabled={ocupado || opciones === null} onClick={asignar}>
          Asignar
        </Button>
      </div>
    </Dialogo>
  )
}
