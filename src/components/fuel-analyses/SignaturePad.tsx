import { useEffect, useRef, useState } from 'react'

type SignaturePadProps = {
  disabled?: boolean
  height?: number
  onChange: (blob: Blob | null) => void
}

function applyDrawingStyle(ctx: CanvasRenderingContext2D, ratio: number) {
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#0c3b7a'
  ctx.fillStyle = '#ffffff'
}

function wipeCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, ratio: number) {
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.restore()
  applyDrawingStyle(ctx, ratio)
}

export default function SignaturePad({
  disabled = false,
  height = 160,
  onChange,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const ratioRef = useRef(1)
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
      ratioRef.current = ratio
      const width = Math.max(1, parent.clientWidth)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      wipeCanvas(canvas, ctx, ratio)
    }

    setup()
  }, [height])

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
    wipeCanvas(canvas, ctx, ratioRef.current)
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
