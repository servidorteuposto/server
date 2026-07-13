import { useEffect, useRef, useState } from 'react'

type LiveCameraCaptureProps = {
  disabled?: boolean
  label?: string
  onCapture: (file: File) => void
  onClear?: () => void
  previewUrl?: string | null
}

export default function LiveCameraCapture({
  disabled = false,
  label = 'Foto comprovando o local *',
  onCapture,
  onClear,
  previewUrl = null,
}: LiveCameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [active, setActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setActive(false)
  }

  useEffect(() => () => stopCamera(), [])

  async function startCamera() {
    if (disabled || starting) return
    setStarting(true)
    setError(null)

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Este dispositivo/navegador não permite captura de câmera.')
      }

      stopCamera()

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })

      streamRef.current = stream
      const video = videoRef.current
      if (!video) {
        stream.getTracks().forEach((track) => track.stop())
        throw new Error('Não foi possível iniciar a prévia da câmera.')
      }

      video.srcObject = stream
      await video.play()
      setActive(true)
    } catch (err) {
      stopCamera()
      const message =
        err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
          ? 'Permissão da câmera negada. Autorize o acesso para tirar a foto no local.'
          : err instanceof Error
            ? err.message
            : 'Não foi possível abrir a câmera.'
      setError(message)
    } finally {
      setStarting(false)
    }
  }

  async function takePhoto() {
    const video = videoRef.current
    if (!video || !active || disabled) return

    const width = video.videoWidth || 1280
    const height = video.videoHeight || 720
    if (!width || !height) {
      setError('Aguarde a câmera carregar e tente novamente.')
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setError('Não foi possível capturar o frame da câmera.')
      return
    }

    ctx.drawImage(video, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92),
    )

    if (!blob) {
      setError('Falha ao gerar a foto capturada.')
      return
    }

    const file = new File([blob], `foto-local-${Date.now()}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })

    onCapture(file)
    stopCamera()
    setError(null)
  }

  function clearPhoto() {
    onClear?.()
    setError(null)
  }

  return (
    <div className="fuel-camera">
      <span className="fuel-camera__label">{label}</span>
      <p className="fuel-camera__hint">
        A foto deve ser tirada agora com a câmera. Não é permitido escolher arquivo da galeria.
      </p>

      {!previewUrl && (
        <div className="fuel-camera__viewport">
          <video
            ref={videoRef}
            className="fuel-camera__video"
            playsInline
            muted
            autoPlay
          />
          {!active && (
            <div className="fuel-camera__placeholder">
              {starting ? 'Abrindo câmera...' : 'Câmera desligada'}
            </div>
          )}
        </div>
      )}

      {previewUrl && (
        <img src={previewUrl} alt="Foto capturada no local" className="fuel-photo__preview" />
      )}

      <div className="fuel-camera__actions">
        {!previewUrl && !active && (
          <button type="button" className="btn btn--primary" onClick={startCamera} disabled={disabled || starting}>
            {starting ? 'Abrindo...' : 'Abrir câmera'}
          </button>
        )}
        {!previewUrl && active && (
          <>
            <button type="button" className="btn btn--primary" onClick={takePhoto} disabled={disabled}>
              Tirar foto agora
            </button>
            <button type="button" className="btn btn--secondary" onClick={stopCamera} disabled={disabled}>
              Fechar câmera
            </button>
          </>
        )}
        {previewUrl && (
          <>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => {
                clearPhoto()
                void startCamera()
              }}
              disabled={disabled}
            >
              Tirar outra foto
            </button>
            <button type="button" className="btn btn--secondary" onClick={clearPhoto} disabled={disabled}>
              Remover foto
            </button>
          </>
        )}
      </div>

      {error && <p className="reg-doc-form__error">{error}</p>}
    </div>
  )
}
