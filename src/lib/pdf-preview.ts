/** Garante um blob: PDF local para iframe/preview (aceita URL http(s) ou blob: já baixado). */
export async function createPdfPreviewObjectUrl(signedUrl: string): Promise<string> {
  const response = await fetch(signedUrl)
  if (!response.ok) {
    throw new Error('preview_fetch_failed')
  }

  const raw = await response.blob()
  const pdfBlob =
    raw.type === 'application/pdf' || raw.type === 'application/x-pdf'
      ? raw
      : new Blob([raw], { type: 'application/pdf' })

  const objectUrl = URL.createObjectURL(pdfBlob)
  // Libera o blob intermediário do storage (evita vazamento de memória).
  if (signedUrl.startsWith('blob:') && signedUrl !== objectUrl) {
    URL.revokeObjectURL(signedUrl)
  }
  return objectUrl
}

export function revokePdfPreviewObjectUrl(url: string | null | undefined) {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}
