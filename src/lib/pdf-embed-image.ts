import type { PDFDocument, PDFImage } from 'pdf-lib'

export type RasterImageBytes = {
  bytes: Uint8Array
  contentType: string
  path: string
}

function detectFormat(contentType: string, path: string): 'png' | 'jpg' | 'webp' | 'other' {
  const type = contentType.toLowerCase()
  const lower = path.toLowerCase()
  if (type.includes('png') || lower.endsWith('.png')) return 'png'
  if (type.includes('jpeg') || type.includes('jpg') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    return 'jpg'
  }
  if (type.includes('webp') || lower.endsWith('.webp')) return 'webp'
  return 'other'
}

async function rasterToPngBytes(bytes: Uint8Array, contentType: string): Promise<Uint8Array | null> {
  try {
    const blob = new Blob([bytes], { type: contentType || 'application/octet-stream' })
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx || !bitmap.width || !bitmap.height) {
      bitmap.close()
      return null
    }
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()

    const pngBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), 'image/png')
    })
    if (!pngBlob || pngBlob.size <= 0) return null
    return new Uint8Array(await pngBlob.arrayBuffer())
  } catch {
    return null
  }
}

/** Embute PNG/JPG/WebP (e outros formatos decodificáveis) no PDF. */
export async function embedRasterImage(
  doc: PDFDocument,
  image: RasterImageBytes | null | undefined,
): Promise<PDFImage | null> {
  if (!image?.bytes?.length) return null

  const format = detectFormat(image.contentType, image.path)

  if (format === 'png') {
    try {
      return await doc.embedPng(image.bytes)
    } catch {
      /* reencode abaixo */
    }
  }

  if (format === 'jpg') {
    try {
      return await doc.embedJpg(image.bytes)
    } catch {
      /* reencode abaixo */
    }
  }

  const pngBytes = await rasterToPngBytes(image.bytes, image.contentType)
  if (!pngBytes) return null
  try {
    return await doc.embedPng(pngBytes)
  } catch {
    return null
  }
}
