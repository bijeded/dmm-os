import { useState } from 'react'
import type { ContactoNuevo } from '../../../shared/dominio'
import { Campo } from './NuevaCotizacion'
import { campoCls } from './estilos'
import { Aviso, useAccion } from './Seccion'
import { Button } from './ui/button'

type Campos = Omit<ContactoNuevo, 'id'>

const campos: [keyof Campos, string][] = [
  ['nombre', 'Nombre'],
  ['empresa', 'Empresa'],
  ['email', 'Email'],
  ['telefono', 'Teléfono / WhatsApp'],
  ['direccion', 'Dirección']
]

/**
 * New or edited Contacto, as a dialog. Estado is derived, so there is no field for it. Main trims
 * and blanks the fields and refuses a name another Contacto already has; the dialog stays open
 * showing why.
 */
export function FormContacto({ inicial, onGuardado, onCerrar }: { inicial?: ContactoNuevo; onGuardado: (id: number) => void; onCerrar: () => void }) {
  const [c, setC] = useState<Campos>({
    nombre: inicial?.nombre ?? '',
    empresa: inicial?.empresa ?? '',
    email: inicial?.email ?? '',
    telefono: inicial?.telefono ?? '',
    direccion: inicial?.direccion ?? '',
    notas: inicial?.notas ?? ''
  })
  const { error, ocupado, correr } = useAccion()
  const titulo = inicial?.id === undefined ? 'Nuevo contacto' : 'Editar contacto'

  const guardar = () => correr(async () => onGuardado(await window.dmm.contactos.guardar(inicial?.id === undefined ? c : { id: inicial.id, ...c })))

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="contacto-titulo"
        className="card flex w-full max-w-md flex-col gap-4 rounded-control border border-border-strong bg-surface-raised p-6"
        onSubmit={(e) => {
          e.preventDefault()
          guardar()
        }}
      >
        <h2 id="contacto-titulo" className="m-0 text-[15px] font-semibold text-on-surface">
          {titulo}
        </h2>
        {campos.map(([k, label]) => (
          <Campo key={k} label={label}>
            <input
              type={k === 'email' ? 'email' : 'text'}
              value={c[k] ?? ''}
              required={k === 'nombre'}
              onChange={(e) => setC({ ...c, [k]: e.target.value })}
              className={campoCls}
            />
          </Campo>
        ))}
        <Campo label="Notas">
          <textarea value={c.notas ?? ''} onChange={(e) => setC({ ...c, notas: e.target.value })} className={`${campoCls} h-20 py-2`} />
        </Campo>
        <Aviso error={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={ocupado}>
            Guardar
          </Button>
        </div>
      </form>
    </div>
  )
}
