import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import { COMPRESSOR_INSPECTION_STORAGE_BUCKET } from '../config/compressor-inspection'
import { formatCnpj, formatCoords, formatDateTimePtBr } from '../config/fuel-analyses'
import { type CompressorInspection } from './compressor-inspection'
import { downloadBlob } from './diesel-drainage-export'
import { getSignedObjectBytes } from './object-storage'
import { embedRasterImage } from './pdf-embed-image'
import { drawCenteredBrandLogo, embedTeuPostoLogo } from './pdf-brand'

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN_X = 42
const MARGIN_TOP = 44
const MARGIN_BOTTOM = 48
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2

const COLOR = {
  ink: rgb(0.05, 0.15, 0.32),
  muted: rgb(0.35, 0.42, 0.5),
  line: rgb(0.78, 0.84, 0.9),
  accent: rgb(0.05, 0.23, 0.48),
}

export type CompressorExportPosto = {
  nome: string
  cnpj: string
  endereco: string | null
}

type PdfContext = {
  doc: PDFDocument
  page: PDFPage
  font: PDFFont
  fontBold: PDFFont
  y: number
  pageNumber: number
}

function sanitize(value: string) {
  return value
    .replace(/\u2013|\u2014|\u2015/g, '-')
    .replace(/\u2022/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/—/g, '-')
}

function textOrDash(value: string | number | null | undefined) {
  if (value == null || value === '') return '-'
  return sanitize(String(value))
}

function formatYesNo(value: boolean | null | undefined) {
  if (value == null) return '-'
  return value ? 'Sim' : 'Nao'
}

function formatLiters(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '-'
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)} L`
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = sanitize(text).split(/\s+/).filter(Boolean)
  if (!words.length) return ['-']

  const lines: string[] = []
  let current = words[0]

  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${current} ${words[i]}`
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
    } else {
      lines.push(current)
      current = words[i]
    }
  }

  lines.push(current)
  return lines
}

function drawFooter(ctx: PdfContext) {
  const label = `Pagina ${ctx.pageNumber}`
  const width = ctx.font.widthOfTextAtSize(label, 8)
  ctx.page.drawText(label, {
    x: PAGE_WIDTH - MARGIN_X - width,
    y: 24,
    size: 8,
    font: ctx.font,
    color: COLOR.muted,
  })
  ctx.page.drawText('Teu Posto - Inspecao do compressor', {
    x: MARGIN_X,
    y: 24,
    size: 8,
    font: ctx.font,
    color: COLOR.muted,
  })
}

function drawPageChrome(ctx: PdfContext) {
  ctx.page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 8,
    width: PAGE_WIDTH,
    height: 8,
    color: COLOR.accent,
  })
}

function ensureSpace(ctx: PdfContext, needed: number) {
  if (ctx.y - needed >= MARGIN_BOTTOM) return
  drawFooter(ctx)
  ctx.page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  ctx.pageNumber += 1
  ctx.y = PAGE_HEIGHT - MARGIN_TOP
  drawPageChrome(ctx)
}

function drawKeyValue(ctx: PdfContext, label: string, value: string, labelWidth = 148) {
  const valueMax = CONTENT_WIDTH - labelWidth
  const lines = wrapText(value, ctx.font, 9.5, valueMax)
  const blockHeight = Math.max(13, lines.length * 11.5)
  ensureSpace(ctx, blockHeight + 2)

  ctx.page.drawText(sanitize(label), {
    x: MARGIN_X,
    y: ctx.y,
    size: 8.5,
    font: ctx.fontBold,
    color: COLOR.muted,
  })

  lines.forEach((line, index) => {
    ctx.page.drawText(line, {
      x: MARGIN_X + labelWidth,
      y: ctx.y - index * 11.5,
      size: 9.5,
      font: ctx.font,
      color: COLOR.ink,
    })
  })

  ctx.y -= blockHeight
}

function drawHeading(ctx: PdfContext, title: string) {
  ensureSpace(ctx, 28)
  ctx.y -= 4
  ctx.page.drawText(sanitize(title), {
    x: MARGIN_X,
    y: ctx.y,
    size: 11,
    font: ctx.fontBold,
    color: COLOR.accent,
  })
  ctx.y -= 6
  ctx.page.drawLine({
    start: { x: MARGIN_X, y: ctx.y },
    end: { x: PAGE_WIDTH - MARGIN_X, y: ctx.y },
    thickness: 1,
    color: COLOR.line,
  })
  ctx.y -= 14
}

async function fetchImageBytes(path: string | null | undefined) {
  if (!path) return null
  try {
    const { bytes, contentType } = await getSignedObjectBytes(
      COMPRESSOR_INSPECTION_STORAGE_BUCKET,
      path,
      60 * 60,
    )
    return { bytes, contentType, path }
  } catch {
    return null
  }
}

function fitImageSize(image: PDFImage, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1)
  return {
    width: image.width * scale,
    height: image.height * scale,
  }
}

function drawEmbeddedImage(
  ctx: PdfContext,
  image: PDFImage,
  maxWidth: number,
  maxHeight: number,
) {
  const available = Math.max(36, ctx.y - MARGIN_BOTTOM - 6)
  const cappedHeight = Math.min(maxHeight, available)
  const { width, height } = fitImageSize(image, maxWidth, cappedHeight)
  ctx.y -= height
  ctx.page.drawImage(image, {
    x: MARGIN_X,
    y: ctx.y,
    width,
    height,
  })
  ctx.y -= 8
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 40)
}

export function buildCompressorInspectionPdfFileName(
  posto: CompressorExportPosto,
  inspection: CompressorInspection,
) {
  const brand = slugify(inspection.brand) || 'compressor'
  const date = inspection.inspected_at.slice(0, 10)
  return `Compressor-${slugify(posto.nome) || 'posto'}-${brand}-${date}.pdf`
}

export function buildCompressorInspectionBulkPdfFileName(posto: CompressorExportPosto) {
  const date = new Date().toISOString().slice(0, 10)
  return `Compressor-${slugify(posto.nome) || 'posto'}-${date}.pdf`
}

export async function generateCompressorInspectionPrintPdf(
  posto: CompressorExportPosto,
  inspections: CompressorInspection[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const brandLogo = await embedTeuPostoLogo(doc)

  if (!inspections.length) {
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    const ctx: PdfContext = {
      doc,
      page,
      font,
      fontBold,
      y: PAGE_HEIGHT - MARGIN_TOP,
      pageNumber: 1,
    }
    drawPageChrome(ctx)
    ctx.y = drawCenteredBrandLogo(ctx.page, brandLogo, ctx.y)
    ctx.page.drawText('Nenhuma inspecao disponivel para exportacao.', {
      x: MARGIN_X,
      y: ctx.y,
      size: 12,
      font: fontBold,
      color: COLOR.ink,
    })
    drawFooter(ctx)
    return doc.save()
  }

  let pageNumber = 0

  for (const inspection of inspections) {
    pageNumber += 1
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    const ctx: PdfContext = {
      doc,
      page,
      font,
      fontBold,
      y: PAGE_HEIGHT - MARGIN_TOP,
      pageNumber,
    }
    drawPageChrome(ctx)

    ctx.y = drawCenteredBrandLogo(ctx.page, brandLogo, ctx.y)

    ctx.page.drawText(sanitize('Inspecao do Compressor'), {
      x: MARGIN_X,
      y: ctx.y,
      size: 15,
      font: fontBold,
      color: COLOR.ink,
    })
    ctx.y -= 16

    ctx.page.drawText(sanitize('Relatorio completo para impressao A4'), {
      x: MARGIN_X,
      y: ctx.y,
      size: 9,
      font,
      color: COLOR.muted,
    })
    ctx.y -= 18

    ctx.page.drawLine({
      start: { x: MARGIN_X, y: ctx.y },
      end: { x: PAGE_WIDTH - MARGIN_X, y: ctx.y },
      thickness: 1.2,
      color: COLOR.accent,
    })
    ctx.y -= 16

    drawHeading(ctx, 'Identificacao do posto')
    drawKeyValue(ctx, 'Posto', posto.nome)
    drawKeyValue(ctx, 'CNPJ', formatCnpj(posto.cnpj))
    drawKeyValue(ctx, 'Endereco', posto.endereco || '-')
    drawKeyValue(ctx, 'Lancado em', formatDateTimePtBr(inspection.inspected_at))
    ctx.y -= 4

    drawHeading(ctx, '1. Dados do compressor')
    drawKeyValue(ctx, 'Marca', textOrDash(inspection.brand))
    drawKeyValue(ctx, 'Modelo', textOrDash(inspection.model))
    drawKeyValue(ctx, 'Numero de serie', textOrDash(inspection.serial_number))
    drawKeyValue(ctx, 'Capacidade', formatLiters(inspection.capacity_liters))
    drawKeyValue(ctx, 'Manometro OK', formatYesNo(inspection.manometer_ok))
    drawKeyValue(ctx, 'Valvula de seguranca OK', formatYesNo(inspection.safety_valve_ok))
    drawKeyValue(ctx, 'Oleo trocado', formatYesNo(inspection.oil_changed))
    drawKeyValue(ctx, 'Compressor drenado', formatYesNo(inspection.compressor_drained))
    ctx.y -= 4

    const [photo1, photo2] = await Promise.all([
      embedRasterImage(doc, await fetchImageBytes(inspection.photo1_storage_path)),
      embedRasterImage(doc, await fetchImageBytes(inspection.photo2_storage_path)),
    ])

    const photoSections = [
      {
        title: '2. Foto compressor',
        capturedAt: inspection.photo1_captured_at,
        latitude: inspection.photo1_latitude,
        longitude: inspection.photo1_longitude,
        image: photo1,
      },
      {
        title: '3. Foto manometro',
        capturedAt: inspection.photo2_captured_at,
        latitude: inspection.photo2_latitude,
        longitude: inspection.photo2_longitude,
        image: photo2,
      },
    ]

    for (const section of photoSections) {
      drawHeading(ctx, section.title)
      drawKeyValue(
        ctx,
        'Foto capturada em',
        section.capturedAt ? formatDateTimePtBr(section.capturedAt) : '-',
      )
      drawKeyValue(
        ctx,
        'Coordenadas',
        section.latitude != null && section.longitude != null
          ? formatCoords(section.latitude, section.longitude)
          : '-',
      )

      if (section.image) {
        ctx.y -= 2
        drawEmbeddedImage(ctx, section.image, CONTENT_WIDTH, 140)
      } else {
        drawKeyValue(ctx, 'Foto', 'Nao disponivel')
      }
      ctx.y -= 4
    }

    ctx.y -= 4
    if (ctx.y < MARGIN_BOTTOM) ctx.y = MARGIN_BOTTOM
    ctx.page.drawText(
      sanitize(`Gerado em ${formatDateTimePtBr(new Date())} pelo Teu Posto.`),
      {
        x: MARGIN_X,
        y: ctx.y,
        size: 8,
        font,
        color: COLOR.muted,
      },
    )

    drawFooter(ctx)
  }

  return doc.save()
}

export function downloadCompressorInspectionPdf(bytes: Uint8Array, fileName: string) {
  downloadBlob(bytes, fileName, 'application/pdf')
}
