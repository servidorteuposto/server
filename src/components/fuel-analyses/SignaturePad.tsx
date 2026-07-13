import { useEffect, useRef, useState } from 'react'

type SignaturePadProps = {
  disabled?: boolean
  onChange: (blob: Blob | null) => void
}

export default function SignaturePad({ disabled = false, onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const onChangeRef = useRef(onChange)
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const setup = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const ratio = window.devicePixelRatio || 1
      const width = parent.clientWidth
      const height = 160
      canvas.width = width * ratio
      canvas.height = height * ratio
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.strokeStyle = '#0c3b7a'
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
    }

    setup()
  }, [])

  function getPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  function emitBlob(nextHasInk: boolean) {
    const canvas = canvasRef.current
    if (!canvas || !nextHasInk) {
      onChangeRef.current(null)
      return
    }
    canvas.toBlob((blob) => onChangeRef.current(blob), 'image/png')
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return
    const point = getPoint(event)
    const ctx = canvasRef.current?.getContext('2d')
    if (!point || !ctx) return
    drawing.current = true
    canvasRef.current?.setPointerCapture(event.pointerId)
    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return
    const point = getPoint(event)
    const ctx = canvasRef.current?.getContext('2d')
    if (!point || !ctx) return
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    if (!hasInk) setHasInk(true)
  }

  function handlePointerUp() {
    if (!drawing.current) return
    drawing.current = false
    emitBlob(true)
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight)
    setHasInk(false)
    onChangeRef.current(null)
  }

  return (
    <div className="fuel-signature">
      <canvas
        ref={canvasRef}
        className="fuel-signature__canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      <button type="button" className="btn btn--secondary" onClick={clear} disabled={disabled || !hasInk}>
        Limpar assinatura
      </button>
    </div>
  )
}
