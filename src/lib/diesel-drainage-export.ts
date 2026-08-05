import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import { formatCnpj, formatCoords, formatDateTimePtBr } from '../config/fuel-analyses'
import {
  getDrainagePhotoUrl,
  getDrainageSignatureUrl,
  type DieselDrainageReport,
} from './diesel-drainages'
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

export type DrainageExportPosto = {
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
  if (value === true) return 'Sim'
  if (value === false) return 'Nao'
  return '-'
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
  ctx.page.drawText('Teu Posto - Relatorio de drenagens de diesel', {
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

async function fetchImageBytes(path: string | null | undefined, kind: 'photo' | 'signature') {
  if (!path) return null
  try {
    const url = kind === 'photo' ? await getDrainagePhotoUrl(path) : await getDrainageSignatureUrl(path)
    const response = await fetch(url)
    if (!response.ok) return null
    const buffer = await response.arrayBuffer()
    return {
      bytes: new Uint8Array(buffer),
      contentType: response.headers.get('content-type') ?? '',
      path,
    }
  } catch {
    return null
  }
}

async function embedImage(
  doc: PDFDocument,
  image: Awaited<ReturnType<typeof fetchImageBytes>>,
): Promise<PDFImage | null> {
  if (!image) return null
  const lowerPath = image.path.toLowerCase()
  const isPng = image.contentType.includes('png') || lowerPath.endsWith('.png')
  try {
    return isPng ? await doc.embedPng(image.bytes) : await doc.embedJpg(image.bytes)
  } catch {
    try {
      return isPng ? await doc.embedJpg(image.bytes) : await doc.embedPng(image.bytes)
    } catch {
      return null
    }
  }
}

function drawEmbeddedImage(
  ctx: PdfContext,
  image: PDFImage,
  maxWidth: number,
  maxHeight: number,
) {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1)
  const width = image.width * scale
  const height = image.height * scale
  ensureSpace(ctx, height + 10)
  ctx.y -= height
  ctx.page.drawImage(image, {
    x: MARGIN_X,
    y: ctx.y,
    width,
    height,
  })
  ctx.y -= 10
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

export function downloadBlob(bytes: Uint8Array | Blob, fileName: string, mimeType: string) {
  const blob =
    bytes instanceof Blob
      ? bytes
      : new Blob(
          [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer],
          { type: mimeType },
        )
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function buildDrainagePdfFileName(posto: DrainageExportPosto) {
  const date = new Date().toISOString().slice(0, 10)
  return `Drenagens-${slugify(posto.nome) || 'posto'}-${date}.pdf`
}

export function buildDrainageSpreadsheetFileName(posto: DrainageExportPosto) {
  const date = new Date().toISOString().slice(0, 10)
  return `Drenagens-${slugify(posto.nome) || 'posto'}-${date}.csv`
}

function csvEscape(value: string) {
  const safe = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (/[;"\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`
  }
  return safe
}

/** CSV com BOM e separador `;` — abre direto no Excel (pt-BR). */
export function generateDrainageSpreadsheetCsv(
  posto: DrainageExportPosto,
  reports: DieselDrainageReport[],
): Blob {
  const headers = [
    'Data e horario',
    'Tanque',
    'Operador',
    'Presenca de agua',
    'Presenca de impurezas',
    'Quantidade drenada (L)',
    'Medida adotada',
    'Residuos/pureza confirmados',
    'Observacoes',
    'Foto capturada em',
    'Latitude',
    'Longitude',
    'Coordenadas',
    'Posto',
    'CNPJ',
    'Endereco',
  ]

  const rows = reports.map((report) => {
    const coords =
      report.photo_latitude != null && report.photo_longitude != null
        ? formatCoords(report.photo_latitude, report.photo_longitude)
        : ''

    return [
      formatDateTimePtBr(report.drained_at),
      report.tank?.name ?? 'Tanque removido',
      report.operator_full_name,
      formatYesNo(report.water_present),
      formatYesNo(report.impurities_present),
      report.drained_volume_liters != null ? String(report.drained_volume_liters) : '',
      report.measure_taken ?? '',
      report.residues_confirmed ? 'Sim' : 'Nao',
      report.observations ?? '',
      report.photo_captured_at ? formatDateTimePtBr(report.photo_captured_at) : '',
      report.photo_latitude != null ? String(report.photo_latitude) : '',
      report.photo_longitude != null ? String(report.photo_longitude) : '',
      coords,
      posto.nome,
      formatCnpj(posto.cnpj),
      posto.endereco ?? '',
    ].map((cell) => csvEscape(sanitize(cell)))
  })

  const body = [headers.map(csvEscape).join(';'), ...rows.map((row) => row.join(';'))].join('\r\n')
  return new Blob([`\uFEFF${body}`], { type: 'text/csv;charset=utf-8' })
}

export async function generateDrainagePrintPdf(
  posto: DrainageExportPosto,
  reports: DieselDrainageReport[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const brandLogo = await embedTeuPostoLogo(doc)

  if (!reports.length) {
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
    ctx.page.drawText('Nenhuma drenagem disponivel para exportacao.', {
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

  for (const report of reports) {
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

    const tankName = report.tank?.name ?? 'Tanque removido'

    ctx.y = drawCenteredBrandLogo(ctx.page, brandLogo, ctx.y)

    ctx.page.drawText(sanitize(`Drenagem - ${tankName}`), {
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
    drawKeyValue(ctx, 'Drenado em', formatDateTimePtBr(report.drained_at))
    drawKeyValue(ctx, 'Operador / assinatura', report.operator_full_name)
    ctx.y -= 4

    drawHeading(ctx, '1. Dados da drenagem')
    drawKeyValue(ctx, 'Tanque', tankName)
    drawKeyValue(ctx, 'Presenca de agua', formatYesNo(report.water_present))
    drawKeyValue(ctx, 'Presenca de impurezas', formatYesNo(report.impurities_present))
    drawKeyValue(ctx, 'Quantidade drenada', formatLiters(report.drained_volume_liters))
    drawKeyValue(ctx, 'Medida adotada', textOrDash(report.measure_taken))
    drawKeyValue(
      ctx,
      'Residuos/pureza',
      report.residues_confirmed ? 'Confirmado' : 'Nao confirmado',
    )
    drawKeyValue(ctx, 'Observacoes', textOrDash(report.observations))
    ctx.y -= 4

    drawHeading(ctx, '2. Foto do local')
    drawKeyValue(
      ctx,
      'Foto capturada em',
      report.photo_captured_at ? formatDateTimePtBr(report.photo_captured_at) : '-',
    )
    drawKeyValue(
      ctx,
      'Coordenadas',
      report.photo_latitude != null && report.photo_longitude != null
        ? formatCoords(report.photo_latitude, report.photo_longitude)
        : '-',
    )

    const photo = await embedImage(doc, await fetchImageBytes(report.photo_storage_path, 'photo'))
    if (photo) {
      ctx.y -= 2
      drawEmbeddedImage(ctx, photo, CONTENT_WIDTH, 220)
    } else {
      drawKeyValue(ctx, 'Foto', 'Nao disponivel')
    }

    const signature = await embedImage(
      doc,
      await fetchImageBytes(report.signature_storage_path, 'signature'),
    )
    if (signature) {
      drawHeading(ctx, '3. Assinatura')
      drawKeyValue(ctx, 'Assinado por', report.operator_full_name)
      drawEmbeddedImage(ctx, signature, Math.min(CONTENT_WIDTH, 260), 90)
    }

    ctx.y -= 6
    ensureSpace(ctx, 24)
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
