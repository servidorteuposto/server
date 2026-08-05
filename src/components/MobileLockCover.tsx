import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import './MobileLockCover.css'

const STORAGE_KEY = 'teuposto_mobile_cover_unlocked'
const MOBILE_MQ = '(max-width: 960px)'
const UNLOCK_DISTANCE = 120
const UNLOCK_VELOCITY = 0.55

function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches
}

function wasUnlockedThisSession() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function markUnlocked() {
  try {
    sessionStorage.setItem(STORAGE_KEY, '1')
  } catch {
    /* ignore */
  }
}

type PointerSample = {
  y: number
  t: number
}

export default function MobileLockCover() {
  const [active, setActive] = useState(() => isMobileViewport() && !wasUnlockedThisSession())
  const [exiting, setExiting] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)

  const startY = useRef(0)
  const lastSample = useRef<PointerSample | null>(null)
  const velocity = useRef(0)
  const unlocked = useRef(false)

  useEffect(() => {
    if (!active) return
    const prevOverflow = document.body.style.overflow
    const theme = document.querySelector('meta[name="theme-color"]')
    const previousTheme = theme?.getAttribute('content') ?? null
    document.documentElement.classList.add('teuposto-lock-active')
    document.body.classList.add('teuposto-lock-active')
    document.body.style.overflow = 'hidden'
    theme?.setAttribute('content', '#000821')
    return () => {
      document.documentElement.classList.remove('teuposto-lock-active')
      document.body.classList.remove('teuposto-lock-active')
      document.body.style.overflow = prevOverflow
      if (theme) {
        theme.setAttribute('content', previousTheme || '#84b5e9')
      }
    }
  }, [active])

  useEffect(() => {
    const media = window.matchMedia(MOBILE_MQ)
    const sync = () => {
      if (!media.matches) {
        setActive(false)
        return
      }
      if (!wasUnlockedThisSession() && !unlocked.current) {
        setActive(true)
        setExiting(false)
        setDragY(0)
      }
    }
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  const finishUnlock = useCallback(() => {
    if (unlocked.current) return
    unlocked.current = true
    markUnlocked()
    // Tira o azul do html/body já no swipe — senão vaza faixa embaixo do login
    document.documentElement.classList.remove('teuposto-lock-active')
    document.body.classList.remove('teuposto-lock-active')
    setExiting(true)
    setDragY(0)
    window.setTimeout(() => setActive(false), 420)
  }, [])

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (exiting || unlocked.current) return
    event.currentTarget.setPointerCapture(event.pointerId)
    startY.current = event.clientY
    lastSample.current = { y: event.clientY, t: performance.now() }
    velocity.current = 0
    setDragging(true)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dragging || exiting) return
    const delta = Math.min(0, event.clientY - startY.current)
    setDragY(delta)

    const now = performance.now()
    const prev = lastSample.current
    if (prev) {
      const dt = now - prev.t
      if (dt > 0) {
        velocity.current = (event.clientY - prev.y) / dt
      }
    }
    lastSample.current = { y: event.clientY, t: now }
  }

  const onPointerUp = () => {
    if (!dragging) return
    setDragging(false)

    const distanceOk = -dragY >= UNLOCK_DISTANCE
    const velocityOk = velocity.current <= -UNLOCK_VELOCITY
    if (distanceOk || velocityOk) {
      finishUnlock()
      return
    }
    setDragY(0)
  }

  if (!active) return null

  const progress = Math.min(1, -dragY / UNLOCK_DISTANCE)

  return (
    <div
      className={`mobile-lock${exiting ? ' mobile-lock--exit' : ''}${dragging ? ' mobile-lock--dragging' : ''}`}
      style={
        exiting
          ? undefined
          : {
              transform: `translate3d(0, ${dragY}px, 0)`,
              opacity: 1 - progress * 0.2,
            }
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="dialog"
      aria-modal="true"
      aria-label="Tela inicial Teu Posto. Arraste para cima para continuar."
    >
      <img
        src="/imagens/capa_mobile.png?v=8"
        alt=""
        aria-hidden="true"
        className="mobile-lock__art"
        draggable={false}
        decoding="async"
        fetchPriority="high"
      />

      <button
        type="button"
        className="mobile-lock__hint"
        onClick={finishUnlock}
        aria-label="Arrasta para cima para entrar"
      >
        <span className="mobile-lock__hint-en">Swipe Up</span>
        <span className="mobile-lock__chevrons" aria-hidden="true">
          <span className="mobile-lock__chevron" />
          <span className="mobile-lock__chevron" />
        </span>
        <span className="mobile-lock__hint-pt">Arrasta para cima</span>
      </button>
    </div>
  )
}
