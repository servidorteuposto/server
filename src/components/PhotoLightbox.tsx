import { useEffect } from 'react'
import './PhotoLightbox.css'

type PhotoLightboxProps = {
  url: string
  alt: string
  onClose: () => void
}

export default function PhotoLightbox({ url, alt, onClose }: PhotoLightboxProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="photo-lightbox"
      onClick={(event) => {
        event.stopPropagation()
        onClose()
      }}
      role="presentation"
    >
      <div
        className="photo-lightbox__dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={alt}
      >
        <button type="button" className="photo-lightbox__close" onClick={onClose} aria-label="Fechar">
          ×
        </button>
        <img src={url} alt={alt} className="photo-lightbox__img" />
      </div>
    </div>
  )
}
