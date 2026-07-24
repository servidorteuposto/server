import { useCallback, useEffect, useMemo, useState } from 'react'
import EquipmentCard from '../components/mandatory-equipments/EquipmentCard'
import { MANDATORY_EQUIPMENT_TEMPLATES } from '../config/mandatory-equipments'
import {
  getMyPostoId,
  listMandatoryEquipments,
  saveMandatoryEquipment,
  type MandatoryEquipment,
} from '../lib/mandatory-equipments'
import '../pages/RegulatoryDocumentsPage.css'
import './MandatoryEquipmentsPage.css'

type MandatoryEquipmentsPageProps = {
  isReadOnly: boolean
}

export default function MandatoryEquipmentsPage({ isReadOnly }: MandatoryEquipmentsPageProps) {
  const [postoId, setPostoId] = useState<string | null>(null)
  const [equipments, setEquipments] = useState<MandatoryEquipment[]>([])
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)

  const byKey = useMemo(() => {
    const map = new Map<string, MandatoryEquipment>()
    for (const row of equipments) map.set(row.equipment_key, row)
    return map
  }, [equipments])

  const loadPage = useCallback(async () => {
    setLoading(true)
    setPageError(null)
    try {
      const id = await getMyPostoId()
      setPostoId(id)
      const rows = await listMandatoryEquipments(id)
      setEquipments(rows)
    } catch {
      setPageError('Não foi possível carregar os equipamentos obrigatórios.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  if (loading) {
    return <p className="reg-docs-page__loading">Carregando equipamentos obrigatórios...</p>
  }

  return (
    <div className="reg-docs-page equip-page">
      <header className="reg-docs-page__header">
        <div className="reg-docs-page__header-text">
          <h1>Equipamentos Obrigatórios</h1>
          <p>
            Cadastre termômetros, densímetros, balde aferidor e proveta. Se faltar foto, certificado
            ou identificação, o status fica como EQUIPAMENTO NÃO DE ACORDO. Ao substituir, os arquivos
            antigos são removidos.
          </p>
        </div>
      </header>

      {pageError && <p className="reg-doc-form__error reg-docs-page__banner">{pageError}</p>}

      <div className="reg-docs-page__grid">
        {MANDATORY_EQUIPMENT_TEMPLATES.map((template) => {
          const equipment = byKey.get(template.key) ?? null
          return (
            <EquipmentCard
              key={template.key}
              template={template}
              equipment={equipment}
              isReadOnly={isReadOnly}
              busy={busyKey === template.key}
              onSave={async (payload) => {
                if (!postoId || isReadOnly) return
                setBusyKey(template.key)
                try {
                  const saved = await saveMandatoryEquipment({
                    postoId,
                    equipmentKey: template.key,
                    existing: equipment,
                    ...payload,
                  })
                  setEquipments((current) => {
                    const without = current.filter((row) => row.equipment_key !== template.key)
                    return [...without, saved]
                  })
                } finally {
                  setBusyKey(null)
                }
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
