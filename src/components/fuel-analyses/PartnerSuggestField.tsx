import { useMemo, useState } from 'react'
import { formatCnpj } from '../../config/fuel-analyses'
import {
  PARTNER_CNPJ_HINT_MIN_DIGITS,
  PARTNER_NAME_HINT_MIN_CHARS,
} from '../../config/partners'
import {
  filterPartnersByCnpj,
  filterPartnersByName,
  type PostoPartner,
} from '../../lib/partners'
import '../../pages/DirectRegisterPage.css'

type PartnerSuggestFieldProps = {
  label: string
  mode: 'name' | 'cnpj'
  value: string
  partners: PostoPartner[]
  disabled?: boolean
  required?: boolean
  onChange: (value: string) => void
  onSelect: (partner: PostoPartner) => void
}

export default function PartnerSuggestField({
  label,
  mode,
  value,
  partners,
  disabled,
  required,
  onChange,
  onSelect,
}: PartnerSuggestFieldProps) {
  const [open, setOpen] = useState(false)

  const suggestions = useMemo(() => {
    if (mode === 'name') {
      return filterPartnersByName(partners, value, PARTNER_NAME_HINT_MIN_CHARS)
    }
    return filterPartnersByCnpj(partners, value, PARTNER_CNPJ_HINT_MIN_DIGITS)
  }, [mode, partners, value])

  function handleSelect(partner: PostoPartner) {
    onSelect(partner)
    setOpen(false)
  }

  return (
    <label className="reg-doc-form__field partner-suggest">
      <span>{label}</span>
      <input
        type="text"
        inputMode={mode === 'cnpj' ? 'numeric' : 'text'}
        value={value}
        onChange={(event) => {
          const next =
            mode === 'cnpj' ? formatCnpj(event.target.value) : event.target.value
          onChange(next)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 150)
        }}
        disabled={disabled}
        required={required}
        autoComplete="off"
        placeholder={
          mode === 'name'
            ? 'Digite ao menos 3 letras'
            : 'Digite ao menos 3 dígitos do CNPJ'
        }
      />
      {open && suggestions.length > 0 && (
        <ul className="partner-suggest__list" role="listbox">
          {suggestions.map((partner) => (
            <li key={partner.id}>
              <button
                type="button"
                className="partner-suggest__item"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(partner)}
              >
                <strong>{partner.razao_social}</strong>
                <span>CNPJ {formatCnpj(partner.cnpj)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  )
}
