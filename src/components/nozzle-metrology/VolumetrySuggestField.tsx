import { useEffect, useMemo, useState } from 'react'
import {
  formatVolumetryLabel,
  parseVolumetryInput,
  suggestVolumetryOptions,
} from '../../config/nozzle-metrology'

type VolumetrySuggestFieldProps = {
  label: string
  value: number | null
  disabled?: boolean
  onChange: (value: number | null) => void
}

export default function VolumetrySuggestField({
  label,
  value,
  disabled,
  onChange,
}: VolumetrySuggestFieldProps) {
  const [text, setText] = useState(value == null ? '' : formatVolumetryLabel(value))
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setText(value == null ? '' : formatVolumetryLabel(value))
  }, [value])

  const suggestions = useMemo(() => suggestVolumetryOptions(text), [text])

  function commitRaw(raw: string) {
    const parsed = parseVolumetryInput(raw)
    if (parsed == null) {
      setText(value == null ? '' : formatVolumetryLabel(value))
      return
    }
    onChange(parsed)
    setText(formatVolumetryLabel(parsed))
  }

  function handleSelect(option: number) {
    onChange(option)
    setText(formatVolumetryLabel(option))
    setOpen(false)
  }

  return (
    <label className="reg-doc-form__field partner-suggest nozzle-vol-suggest">
      <span>{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={text}
        onChange={(event) => {
          const next = event.target.value
          setText(next)
          setOpen(true)
          const parsed = parseVolumetryInput(next)
          if (parsed != null) onChange(parsed)
          else if (!next.trim()) onChange(null)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => {
            setOpen(false)
            commitRaw(text)
          }, 150)
        }}
        disabled={disabled}
        autoComplete="off"
        placeholder="Ex.: -80"
      />
      {open && suggestions.length > 0 && (
        <ul className="partner-suggest__list" role="listbox">
          {suggestions.map((option) => (
            <li key={option}>
              <button
                type="button"
                className="partner-suggest__item"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(option)}
              >
                <strong>{formatVolumetryLabel(option)}</strong>
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  )
}
