import { type PDFDocument, type PDFImage, type PDFPage } from 'pdf-lib'

const LOGO_URL = '/imagens/logo_teuposto.png'
const PAGE_WIDTH_A4 = 595.28
const DEFAULT_MAX_WIDTH = 176
const DEFAULT_MAX_HEIGHT = 78

let cachedLogoBytes: Uint8Array | null = null

export async function loadTeuPostoLogoBytes(): Promise<Uint8Array | null> {
  if (cachedLogoBytes) return cachedLogoBytes
  try {
    const response = await fetch(`${LOGO_URL}?v=1`)
    if (!response.ok) return null
    cachedLogoBytes = new Uint8Array(await response.arrayBuffer())
    return cachedLogoBytes
  } catch {
    return null
  }
}

export async function embedTeuPostoLogo(doc: PDFDocument): Promise<PDFImage | null> {
  const bytes = await loadTeuPostoLogoBytes()
  if (!bytes) return null
  try {
    return await doc.embedPng(bytes)
  } catch {
    try {
      return await doc.embedJpg(bytes)
    } catch {
      return null
    }
  }
}

/** Desenha a logo centralizada e devolve o Y abaixo dela (com espaçamento). */
export function drawCenteredBrandLogo(
  page: PDFPage,
  logo: PDFImage | null,
  yTop: number,
  options?: {
    maxWidth?: number
    maxHeight?: number
    pageWidth?: number
    gapBelow?: number
  },
): number {
  if (!logo) return yTop

  const pageWidth = options?.pageWidth ?? PAGE_WIDTH_A4
  const maxWidth = options?.maxWidth ?? DEFAULT_MAX_WIDTH
  const maxHeight = options?.maxHeight ?? DEFAULT_MAX_HEIGHT
  const gapBelow = options?.gapBelow ?? 14

  const scale = Math.min(maxWidth / logo.width, maxHeight / logo.height, 1)
  const width = logo.width * scale
  const height = logo.height * scale
  const x = (pageWidth - width) / 2
  const y = yTop - height

  page.drawImage(logo, { x, y, width, height })
  return y - gapBelow
}
