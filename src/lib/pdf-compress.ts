import { PDFDocument } from 'pdf-lib'

export type PreparedPdfUpload = {
  originalFile: File
  previewFile: File
  originalSize: number
  previewSize: number
  compressed: boolean
}

export async function preparePdfUpload(file: File): Promise<PreparedPdfUpload> {
  const originalBytes = new Uint8Array(await file.arrayBuffer())
  const originalSize = originalBytes.byteLength

  let previewBytes = originalBytes

  try {
    const pdf = await PDFDocument.load(originalBytes, { ignoreEncryption: true })
    pdf.setTitle('')
    pdf.setAuthor('')
    pdf.setSubject('')
    pdf.setKeywords([])
    pdf.setProducer('')
    pdf.setCreator('')

    const saved = await pdf.save({ useObjectStreams: true, addDefaultPage: false })
    if (saved.byteLength < originalBytes.byteLength) {
      previewBytes = saved
    }
  } catch {
    previewBytes = originalBytes
  }

  const previewSize = previewBytes.byteLength
  const compressed = previewSize < originalSize

  return {
    originalFile: new File([originalBytes], file.name, { type: 'application/pdf' }),
    previewFile: new File([previewBytes], file.name, { type: 'application/pdf' }),
    originalSize,
    previewSize,
    compressed,
  }
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
