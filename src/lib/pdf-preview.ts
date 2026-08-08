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
