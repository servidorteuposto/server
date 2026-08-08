const WEBP_QUALITY = 0.82

function isImageBlob(file: Blob) {
  return file.type.startsWith('image/') || (file instanceof File && /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name))
}

function alreadyWebp(file: Blob) {
  if (file.type === 'image/webp') return true
  return file instanceof File && file.name.toLowerCase().endsWith('.webp')
}

async function canvasToWebpBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  if (typeof canvas.toBlob !== 'function') return null

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), 'image/webp', WEBP_QUALITY)
  })
  if (blob && blob.size > 0 && blob.type === 'image/webp') return blob

  // Fallback: alguns browsers devolvem type vazio mesmo com encode WebP ok
  if (blob && blob.size > 0) {
    try {
      const dataUrl = canvas.toDataURL('image/webp', WEBP_QUALITY)
      if (!dataUrl.startsWith('data:image/webp')) return null
      const res = await fetch(dataUrl)
      return await res.blob()
    } catch {
      return null
    }
  }
  return null
}

/**
 * Converte imagem para WebP mantendo a resolução original (sem downsample).
 * Se o browser não suportar encode WebP, devolve o arquivo original.
 */
export async function convertImageToWebp(file: Blob, fileNameHint = 'image'): Promise<File> {
  if (!isImageBlob(file)) {
    if (file instanceof File) return file
    return new File([file], fileNameHint, { type: file.type || 'application/octet-stream' })
  }

  if (alreadyWebp(file)) {
    if (file instanceof File) return file
    return new File([file], fileNameHint.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' })
  }

  try {
    const bitmap = await createImageBitmap(file)
    const width = bitmap.width
    const height = bitmap.height
    if (!width || !height) {
      bitmap.close()
      throw new Error('invalid_image_dimensions')
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      throw new Error('canvas_unavailable')
    }
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const webpBlob = await canvasToWebpBlob(canvas)
    if (!webpBlob) throw new Error('webp_encode_failed')

    const baseName =
      file instanceof File
        ? file.name.replace(/\.[^.]+$/, '')
        : fileNameHint.replace(/\.[^.]+$/, '') || 'image'

    return new File([webpBlob], `${baseName}.webp`, {
      type: 'image/webp',
      lastModified: Date.now(),
    })
  } catch {
    if (file instanceof File) return file
    return new File([file], fileNameHint, { type: file.type || 'application/octet-stream' })
  }
}

export async function prepareImageUpload(file: Blob, fileNameHint = 'image.jpg') {
  const converted = await convertImageToWebp(file, fileNameHint)
  return {
    file: converted,
    contentType: converted.type || 'image/webp',
    extension: converted.name.includes('.')
      ? converted.name.split('.').pop()!.toLowerCase()
      : converted.type === 'image/webp'
        ? 'webp'
        : 'jpg',
  }
}
