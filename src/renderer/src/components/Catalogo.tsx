import { useEffect, useState } from 'react'
import { CATEGORIAS, NOMBRES_CATEGORIA, type Categoria, type ConceptoCatalogo } from '../../../shared/ipc'
import { pesos } from './Contactos'
import { Aviso, Seccion, inputCls, mensaje, useAccion } from './Seccion'
import { Button } from './ui/button'

interface Borrador {
  id?: number
  concepto: string
  categoria: Categoria
  /** As typed, in pesos. */
  precio: string
}

const nuevo: Borrador = { concepto: '', categoria: 'website', precio: '' }

/** Configuración → Catálogo: default prices a new Cotización copies; editing one never touches past quotes. */
export function Catalogo() {
  const api = window.dmm.catalogo
  const [conceptos, setConceptos] = useState<ConceptoCatalogo[] | null>(null)
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [aBorrar, setABorrar] = useState<ConceptoCatalogo | null>(null)
  const { error, setError, ocupado, correr } = useAccion()

  useEffect(() => {
    api.listar().then(setConceptos, (e) => setError(mensaje(e)))
  }, [api, setError])

  const guardar = (b: Borrador) =>
    correr(async () => {
      const { id, concepto, categoria, precio } = b
      if (precio.trim() === '') throw new Error('El concepto necesita precio')
      setConceptos(await api.guardar({ ...(id === undefined ? {} : { id }), concepto, categoria, precio: Math.round(Number(precio) * 100) }))
      setBorrador(null)
    })

  const cambiar = (campo: Partial<Borrador>) => setBorrador((b) => b && { ...b, ...campo })

  return (
    <Seccion id="catalogo" titulo="Catálogo">
      {conceptos && (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left font-mono text-[10px] tracking-[.12em] text-on-surface-muted uppercase">
              <th className="pb-2 font-semibold">Concepto</th>
              <th className="pb-2 font-semibold">Categoría</th>
              <th className="pb-2 text-right font-semibold">Precio</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {conceptos.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="py-2">{c.concepto}</td>
                <td className="py-2 text-on-surface-muted">{NOMBRES_CATEGORIA[c.categoria]}</td>
                <td className="py-2 text-right font-mono">{pesos(c.precio)}</td>
                <td className="py-2 text-right whitespace-nowrap">
                  <Button variant="ghost" aria-label={`Editar ${c.concepto}`} disabled={ocupado} onClick={() => setBorrador({ ...c, precio: String(c.precio / 100) })}>
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`Borrar ${c.concepto}`}
                    disabled={ocupado}
                    onClick={() => setABorrar(c)}
                  >
                    Borrar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {aBorrar && (
        <div className="flex flex-wrap items-center gap-3 rounded-control border border-border-strong p-3 text-[13px]">
          <span>¿Borrar «{aBorrar.concepto}» del catálogo? Las cotizaciones existentes conservan su precio.</span>
          <Button
            disabled={ocupado}
            onClick={() => {
              const id = aBorrar.id
              setABorrar(null)
              correr(async () => setConceptos(await api.borrar(id)))
            }}
          >
            Sí, borrar
          </Button>
          <Button variant="ghost" onClick={() => setABorrar(null)}>
            No borrar
          </Button>
        </div>
      )}

      {borrador ? (
        <form
          className="flex flex-wrap items-end gap-3 text-[13px]"
          onSubmit={(e) => {
            e.preventDefault()
            guardar(borrador)
          }}
        >
          <label className="flex flex-col gap-1">
            Concepto
            <input value={borrador.concepto} onChange={(e) => cambiar({ concepto: e.target.value })} className={`${inputCls} w-56`} />
          </label>
          <label className="flex flex-col gap-1">
            Categoría
            <select value={borrador.categoria} onChange={(e) => cambiar({ categoria: e.target.value as Categoria })} className={`${inputCls} w-32`}>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {NOMBRES_CATEGORIA[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Precio
            <input type="number" min={0} step="0.01" value={borrador.precio} onChange={(e) => cambiar({ precio: e.target.value })} className={inputCls} />
          </label>
          <Button type="submit" disabled={ocupado}>
            Guardar
          </Button>
          <Button type="button" variant="ghost" onClick={() => setBorrador(null)}>
            Cancelar
          </Button>
        </form>
      ) : (
        <div>
          <Button variant="secondary" onClick={() => setBorrador(nuevo)}>
            Agregar concepto
          </Button>
        </div>
      )}
      <Aviso error={error} />
    </Seccion>
  )
}
