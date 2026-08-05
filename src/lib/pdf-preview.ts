/** Baixa o PDF da URL assinada e gera blob: local — iframes não renderizam PDFs cross-origin do Storage. */
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

  return URL.createObjectURL(pdfBlob)
}

export function revokePdfPreviewObjectUrl(url: string | null | undefined) {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}
