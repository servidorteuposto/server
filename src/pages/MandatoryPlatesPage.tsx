import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import PlateCard from '../components/mandatory-plates/PlateCard'
import {
  MANDATORY_PLATES_MAX_CUSTOM,
  MANDATORY_PLATES_TITLE_MAX_LENGTH,
  STANDARD_PLATE_TEMPLATES,
  createCustomPlateKey,
} from '../config/mandatory-plates'
import {
  createCustomMandatoryPlate,
  deleteMandatoryPlate,
  getMyPostoId,
  listMandatoryPlates,
  saveMandatoryPlate,
  type MandatoryPlate,
} from '../lib/mandatory-plates'
import { describeOperationalSaveError } from '../lib/storage-errors'
import '../pages/RegulatoryDocumentsPage.css'
import './MandatoryEquipmentsPage.css'
import './MandatoryPlatesPage.css'

type MandatoryPlatesPageProps = {
  isReadOnly: boolean
}

export default function MandatoryPlatesPage({ isReadOnly }: MandatoryPlatesPageProps) {
  const [postoId, setPostoId] = useState<string | null>(null)
  const [plates, setPlates] = useState<MandatoryPlate[]>([])
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)

  const byKey = useMemo(() => {
    const map = new Map<string, MandatoryPlate>()
    for (const row of plates) map.set(row.plate_key, row)
    return map
  }, [plates])

  const customPlates = useMemo(
    () => plates.filter((row) => !row.is_standard).sort((a, b) => a.sort_order - b.sort_order),
    [plates],
  )

  const loadPage = useCallback(async () => {
    setLoading(true)
    setPageError(null)
    try {
      const id = await getMyPostoId()
      setPostoId(id)
      const rows = await listMandatoryPlates(id)
      setPlates(rows)
    } catch {
      setPageError('Não foi possível carregar as placas obrigatórias.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  function upsertPlate(saved: MandatoryPlate) {
    setPlates((current) => {
      const without = current.filter((row) => row.id !== saved.id && row.plate_key !== saved.plate_key)
      return [...without, saved]
    })
  }

  async function handleAddCustom(event: FormEvent) {
    event.preventDefault()
    if (!postoId || isReadOnly || adding) return

    const title = newTitle.trim()
    if (!title) {
      setPageError('Informe o título da placa.')
      return
    }
    if (title.length > MANDATORY_PLATES_TITLE_MAX_LENGTH) {
      setPageError(`O título deve ter no máximo ${MANDATORY_PLATES_TITLE_MAX_LENGTH} caracteres.`)
      return
    }
    if (customPlates.length >= MANDATORY_PLATES_MAX_CUSTOM) {
      setPageError(`É possível cadastrar no máximo ${MANDATORY_PLATES_MAX_CUSTOM} placas extras.`)
      return
    }

    setAdding(true)
    setPageError(null)
    try {
      const saved = await createCustomMandatoryPlate({
        postoId,
        plateKey: createCustomPlateKey(),
        title,
        sortOrder: 100 + customPlates.length,
      })
      upsertPlate(saved)
      setNewTitle('')
    } catch (error) {
      setPageError(describeOperationalSaveError(error, 'mandatory_plates'))
    } finally {
      setAdding(false)
    }
  }

  if (loading) {
    return <p className="reg-docs-page__loading">Carregando placas obrigatórias...</p>
  }

  return (
    <div className="reg-docs-page equip-page plates-page">
      <header className="reg-docs-page__header">
        <div className="reg-docs-page__header-text">
          <h1>Placas Obrigatórias</h1>
          <p>
            Tire a foto ao vivo da placa do órgão ambiental e da placa da ANP. Horário e localização
            entram no registro. Dá para incluir outras placas com o título que quiser.
          </p>
        </div>
      </header>

      {pageError && <p className="reg-doc-form__error reg-docs-page__banner">{pageError}</p>}

      <div className="reg-docs-page__grid">
        {STANDARD_PLATE_TEMPLATES.map((template) => {
          const plate = byKey.get(template.key) ?? null
          return (
            <PlateCard
              key={template.key}
              title={template.title}
              plate={plate}
              isStandard
              isReadOnly={isReadOnly}
              busy={busyKey === template.key}
              onSave={async ({ photo }) => {
                if (!postoId || isReadOnly) return
                setBusyKey(template.key)
                try {
                  const saved = await saveMandatoryPlate({
                    postoId,
                    plateKey: template.key,
                    title: template.title,
                    isStandard: true,
                    sortOrder: template.sortOrder,
                    existing: plate,
                    photo,
                  })
                  upsertPlate(saved)
                } finally {
                  setBusyKey(null)
                }
              }}
            />
          )
        })}

        {customPlates.map((plate) => (
          <PlateCard
            key={plate.id}
            title={plate.title}
            plate={plate}
            isStandard={false}
            isReadOnly={isReadOnly}
            busy={busyKey === plate.plate_key}
            onSave={async ({ photo }) => {
              if (!postoId || isReadOnly) return
              setBusyKey(plate.plate_key)
              try {
                const saved = await saveMandatoryPlate({
                  postoId,
                  plateKey: plate.plate_key,
                  title: plate.title,
                  isStandard: false,
                  sortOrder: plate.sort_order,
                  existing: plate,
                  photo,
                })
                upsertPlate(saved)
              } finally {
                setBusyKey(null)
              }
            }}
            onDelete={async () => {
              setBusyKey(plate.plate_key)
              try {
                await deleteMandatoryPlate(plate)
                setPlates((current) => current.filter((row) => row.id !== plate.id))
              } finally {
                setBusyKey(null)
              }
            }}
          />
        ))}
      </div>

      {!isReadOnly && (
        <form className="plates-page__add" onSubmit={(event) => void handleAddCustom(event)}>
          <h2>Adicionar outra placa</h2>
          <p>Escreva o nome da placa, por exemplo Bomba 01, e depois tire a foto ao vivo.</p>
          <div className="plates-page__add-row">
            <label className="reg-doc-form__field plates-page__title-field">
              <span>Nome da placa</span>
              <input
                type="text"
                value={newTitle}
                maxLength={MANDATORY_PLATES_TITLE_MAX_LENGTH}
                placeholder="Ex.: Bomba 01"
                onChange={(event) => setNewTitle(event.target.value)}
                disabled={adding}
              />
            </label>
            <button type="submit" className="btn btn--primary" disabled={adding || !newTitle.trim()}>
              {adding ? 'Adicionando...' : 'Adicionar placa'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
