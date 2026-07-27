import { useEffect, useState } from 'react'
import {
  COOKIE_CONSENT_STORAGE_KEY,
  LEGAL_DOCUMENTS,
  buildLegalPath,
} from '../config/legal'
import './CookieConsent.css'

type ConsentValue = 'accepted' | 'essential' | null

function readConsent(): ConsentValue {
  try {
    const raw = localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)
    if (raw === 'accepted' || raw === 'essential') return raw
  } catch {
    // ignore
  }
  return null
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(readConsent() == null)
  }, [])

  function save(value: Exclude<ConsentValue, null>) {
    try {
      localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, value)
    } catch {
      // ignore
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="cookie-consent" role="dialog" aria-label="Aviso de cookies" aria-live="polite">
      <div className="cookie-consent__panel">
        <div className="cookie-consent__text">
          <strong>Cookies e privacidade</strong>
          <p>
            Usamos cookies essenciais para login e segurança. Preferências e cookies não essenciais
            (se houver) dependem do seu consentimento, conforme a LGPD.{' '}
            <a href={buildLegalPath('cookies')}>Política de Cookies</a>
            {' · '}
            <a href={buildLegalPath('privacidade')}>Privacidade</a>
          </p>
        </div>
        <div className="cookie-consent__actions">
          <button type="button" className="cookie-consent__btn cookie-consent__btn--ghost" onClick={() => save('essential')}>
            Só essenciais
          </button>
          <button type="button" className="cookie-consent__btn cookie-consent__btn--primary" onClick={() => save('accepted')}>
            Aceitar
          </button>
        </div>
        <div className="cookie-consent__links">
          {LEGAL_DOCUMENTS.map((doc) => (
            <a key={doc.id} href={buildLegalPath(doc.id)}>
              {doc.shortTitle}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
