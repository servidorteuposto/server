/** Cria blob: PDF a partir dos bytes já baixados (sem re-fetch). */
export function createPdfPreviewFromBytes(bytes: Uint8Array, contentType?: string): string {
  if (!bytes?.length) {
    throw new Error('preview_empty')
  }

  const type =
    contentType && (contentType.includes('pdf') || contentType === 'application/octet-stream')
      ? contentType.includes('pdf')
        ? contentType
        : 'application/pdf'
      : 'application/pdf'

  // Cópia explícita — evita issues com views de ArrayBuffer.
  const copy = new Uint8Array(bytes)
  const blob = new Blob([copy], { type })
  return URL.createObjectURL(blob)
}

/**
 * Garante um blob: PDF local para iframe/preview.
 * Se a URL já for blob:, reutiliza (sem fetch — CSP pode bloquear connect-src blob:).
 */
export async function createPdfPreviewObjectUrl(signedUrl: string): Promise<string> {
  if (signedUrl.startsWith('blob:')) {
    return signedUrl
  }

  const response = await fetch(signedUrl)
  if (!response.ok) {
    throw new Error('preview_fetch_failed')
  }

  const buffer = await response.arrayBuffer()
  return createPdfPreviewFromBytes(
    new Uint8Array(buffer),
    response.headers.get('content-type') ?? undefined,
  )
}

export function revokePdfPreviewObjectUrl(url: string | null | undefined) {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

/** iOS/Android não renderizam PDF dentro de iframe — o visualizador nativo precisa de uma aba. */
export function pdfNeedsNativeViewer() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return true
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true
  if (/Android/i.test(ua)) return true
  return window.matchMedia('(pointer: coarse) and (max-width: 900px)').matches
}

export type PdfPreviewTarget = {
  useNative: boolean
  nativeTab: Window | null
}

export function createPdfPreviewTarget(): PdfPreviewTarget {
  const useNative = pdfNeedsNativeViewer()
  if (!useNative) return { useNative: false, nativeTab: null }

  try {
    const nativeTab = window.open('about:blank', '_blank')
    if (nativeTab) {
      try {
        nativeTab.document.open()
        nativeTab.document.write(
          '<!doctype html><title>Carregando PDF</title><p style="font-family:system-ui,sans-serif;padding:1.5rem">Carregando documento...</p>',
        )
        nativeTab.document.close()
      } catch {
        /* aba em branco ainda serve para receber o blob */
      }
    }
    return { useNative: true, nativeTab }
  } catch {
    return { useNative: true, nativeTab: null }
  }
}

export function deliverPdfPreview(url: string, target: PdfPreviewTarget): 'native' | 'embed' {
  if (!target.useNative) return 'embed'
  if (target.nativeTab && !target.nativeTab.closed) {
    try {
      target.nativeTab.location.replace(url)
      target.nativeTab.focus()
      return 'native'
    } catch {
      /* cai no fallback abaixo */
    }
  }
  const opened = window.open(url, '_blank')
  if (!opened) {
    window.location.assign(url)
  }
  return 'native'
}

export function cancelPdfPreviewTarget(target: PdfPreviewTarget) {
  if (!target.nativeTab || target.nativeTab.closed) return
  try {
    target.nativeTab.close()
  } catch {
    /* ignore */
  }
}
