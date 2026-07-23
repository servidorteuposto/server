import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import {
  FUEL_PRODUCT_LABELS,
  formatCnpj,
  formatCoords,
  formatDateTimePtBr,
} from '../config/fuel-analyses'
import { DENSITY_CONFORMITY_LABELS } from '../config/fuel-density'
import { formatDatePtBr } from '../config/regulatory-documents'
import type { PublicPostoBoard } from './public-posto'

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN_X = 48
const MARGIN_TOP = 52
const MARGIN_BOTTOM = 56
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2

const COLOR = {
  ink: rgb(0.05, 0.15, 0.32),
  muted: rgb(0.35, 0.42, 0.5),
  line: rgb(0.78, 0.84, 0.9),
  accent: rgb(0.05, 0.23, 0.48),
  band: rgb(0.93, 0.96, 0.99),
  white: rgb(1, 1, 1),
  apto: rgb(0.09, 0.45, 0.27),
  inapto: rgb(0.72, 0.11, 0.11),
}

type PrintBoard = {
  posto: PublicPostoBoard['posto']
  report: NonNullable<PublicPostoBoard['report']>
  raq_items: PublicPostoBoard['raq_items']
  analysis_items: PublicPostoBoard['analysis_items']
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

function ensureSpace(ctx: PdfContext, needed: number) {
  if (ctx.y - needed >= MARGIN_BOTTOM) return

  drawFooter(ctx)
  ctx.page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  ctx.pageNumber += 1
  ctx.y = PAGE_HEIGHT - MARGIN_TOP
  drawPageChrome(ctx)
}

function drawFooter(ctx: PdfContext) {
  const label = `Página ${ctx.pageNumber}`
  const width = ctx.font.widthOfTextAtSize(label, 8)
  ctx.page.drawText(label, {
    x: PAGE_WIDTH - MARGIN_X - width,
    y: 28,
    size: 8,
    font: ctx.font,
    color: COLOR.muted,
  })
  ctx.page.drawText('Teu Posto · Consulta pública do RAQ', {
    x: MARGIN_X,
    y: 28,
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

function drawHeading(ctx: PdfContext, title: string) {
  ensureSpace(ctx, 36)
  ctx.y -= 8
  ctx.page.drawText(sanitize(title), {
    x: MARGIN_X,
    y: ctx.y,
    size: 12,
    font: ctx.fontBold,
    color: COLOR.accent,
  })
  ctx.y -= 8
  ctx.page.drawLine({
    start: { x: MARGIN_X, y: ctx.y },
    end: { x: PAGE_WIDTH - MARGIN_X, y: ctx.y },
    thickness: 1,
    color: COLOR.line,
  })
  ctx.y -= 16
}

function drawKeyValue(
  ctx: PdfContext,
  label: string,
  value: string,
  options?: { indent?: number; labelWidth?: number },
) {
  const indent = options?.indent ?? 0
  const labelWidth = options?.labelWidth ?? 118
  const valueX = MARGIN_X + indent + labelWidth
  const valueMax = CONTENT_WIDTH - indent - labelWidth
  const lines = wrapText(value, ctx.font, 9.5, valueMax)
  const blockHeight = Math.max(14, lines.length * 12)

  ensureSpace(ctx, blockHeight + 2)

  ctx.page.drawText(sanitize(label), {
    x: MARGIN_X + indent,
    y: ctx.y,
    size: 9,
    font: ctx.fontBold,
    color: COLOR.muted,
  })

  lines.forEach((line, index) => {
    ctx.page.drawText(line, {
      x: valueX,
      y: ctx.y - index * 12,
      size: 9.5,
      font: ctx.font,
      color: COLOR.ink,
    })
  })

  ctx.y -= blockHeight
}

function drawSectionCard(
  ctx: PdfContext,
  title: string,
  rows: Array<[string, string]>,
  badge?: { label: string; ok: boolean } | null,
) {
  const paddingX = 12
  const paddingY = 12
  const titleSize = 11
  const bodySize = 9
  const labelCol = 118

  const prepared = rows.map(([label, value]) => ({
    label,
    lines: wrapText(value, ctx.font, bodySize, CONTENT_WIDTH - labelCol - paddingX * 2),
  }))

  const bodyHeight = prepared.reduce((sum, row) => sum + Math.max(14, row.lines.length * 12), 0)
  const totalHeight = paddingY + titleSize + 10 + bodyHeight + paddingY

  ensureSpace(ctx, totalHeight + 8)

  const top = ctx.y
  const bottom = top - totalHeight

  ctx.page.drawRectangle({
    x: MARGIN_X,
    y: bottom,
    width: CONTENT_WIDTH,
    height: totalHeight,
    color: COLOR.band,
    borderColor: COLOR.line,
    borderWidth: 1,
  })

  let cursor = top - paddingY - 2

  ctx.page.drawText(sanitize(title), {
    x: MARGIN_X + paddingX,
    y: cursor,
    size: titleSize,
    font: ctx.fontBold,
    color: COLOR.ink,
  })

  if (badge) {
    const badgeWidth = ctx.fontBold.widthOfTextAtSize(badge.label, 8) + 14
    const badgeX = PAGE_WIDTH - MARGIN_X - paddingX - badgeWidth
    ctx.page.drawRectangle({
      x: badgeX,
      y: cursor - 3,
      width: badgeWidth,
      height: 14,
      color: badge.ok ? rgb(0.86, 0.96, 0.9) : rgb(0.99, 0.89, 0.89),
      borderColor: badge.ok ? COLOR.apto : COLOR.inapto,
      borderWidth: 0.8,
    })
    ctx.page.drawText(badge.label, {
      x: badgeX + 7,
      y: cursor,
      size: 8,
      font: ctx.fontBold,
      color: badge.ok ? COLOR.apto : COLOR.inapto,
    })
  }

  cursor -= titleSize + 10

  for (const row of prepared) {
    ctx.page.drawText(sanitize(row.label), {
      x: MARGIN_X + paddingX,
      y: cursor,
      size: 8.5,
      font: ctx.fontBold,
      color: COLOR.muted,
    })

    row.lines.forEach((line, index) => {
      ctx.page.drawText(line, {
        x: MARGIN_X + paddingX + labelCol,
        y: cursor - index * 12,
        size: bodySize,
        font: ctx.font,
        color: COLOR.ink,
      })
    })

    cursor -= Math.max(14, row.lines.length * 12)
  }

  ctx.y = bottom - 12
}

function buildRaqRows(item: PublicPostoBoard['raq_items'][number]): Array<[string, string]> {
  return [
    ['Volume recebido', `${textOrDash(item.volume_received_liters)} L`],
    [
      'Data da coleta',
      item.collection_date ? formatDatePtBr(item.collection_date) : '-',
    ],
    [
      'Transportador',
      item.transporter_cnpj
        ? `${textOrDash(item.transporter_name)} (${formatCnpj(item.transporter_cnpj)})`
        : textOrDash(item.transporter_name),
    ],
    ['Nota fiscal', textOrDash(item.invoice_number)],
    ['Placa', textOrDash(item.truck_plate)],
    ['Motorista', textOrDash(item.driver_name)],
    [
      'Distribuidor',
      item.distributor_cnpj
        ? `${textOrDash(item.distributor_name)} (${formatCnpj(item.distributor_cnpj)})`
        : textOrDash(item.distributor_name),
    ],
  ]
}

function buildAnalysisRows(item: PublicPostoBoard['analysis_items'][number]): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ['Aspecto', textOrDash(item.aspecto)],
    ['Cor', textOrDash(item.cor)],
    ['Temperatura', textOrDash(item.temperatura_observada)],
    ['ME observada', textOrDash(item.massa_especifica_observada)],
    ['ME a 20 °C', textOrDash(item.massa_especifica_convertida)],
  ]

  if (item.teor_alcool_gasolina) {
    const label = item.product_key.startsWith('etanol-')
      ? 'Teor alcoólico (INPM)'
      : 'Teor de álcool'
    const value = item.product_key.startsWith('etanol-')
      ? item.teor_alcool_gasolina.includes('INPM')
        ? item.teor_alcool_gasolina
        : `${item.teor_alcool_gasolina} INPM`
      : item.teor_alcool_gasolina
    rows.push([label, value])
  }

  rows.push([
    'Foto capturada em',
    item.photo_captured_at ? formatDateTimePtBr(item.photo_captured_at) : '-',
  ])

  rows.push([
    'Coordenadas',
    item.photo_latitude != null && item.photo_longitude != null
      ? formatCoords(item.photo_latitude, item.photo_longitude)
      : '-',
  ])

  return rows
}

export async function generateRaqPrintPdf(board: PrintBoard): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
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

  // Header
  ctx.page.drawText('TEU POSTO', {
    x: MARGIN_X,
    y: ctx.y,
    size: 10,
    font: fontBold,
    color: COLOR.accent,
  })
  ctx.y -= 18

  ctx.page.drawText(sanitize('Registro das Análises da Qualidade - RAQ'), {
    x: MARGIN_X,
    y: ctx.y,
    size: 16,
    font: fontBold,
    color: COLOR.ink,
  })
  ctx.y -= 18

  ctx.page.drawText(sanitize('Relatório para impressão · consulta pública'), {
    x: MARGIN_X,
    y: ctx.y,
    size: 9,
    font,
    color: COLOR.muted,
  })
  ctx.y -= 22

  ctx.page.drawLine({
    start: { x: MARGIN_X, y: ctx.y },
    end: { x: PAGE_WIDTH - MARGIN_X, y: ctx.y },
    thickness: 1.2,
    color: COLOR.accent,
  })
  ctx.y -= 20

  drawHeading(ctx, 'Identificação do posto')
  drawKeyValue(ctx, 'Razão social / nome', board.report.razao_social || board.posto.nome)
  drawKeyValue(ctx, 'CNPJ', formatCnpj(board.report.cnpj || board.posto.cnpj))
  drawKeyValue(ctx, 'Endereço', board.report.endereco || board.posto.endereco || '-')
  drawKeyValue(ctx, 'Lançado em', formatDateTimePtBr(board.report.submitted_at))
  drawKeyValue(ctx, 'Responsável', board.report.author_full_name)
  ctx.y -= 8

  drawHeading(ctx, '1. Recebimento (RAQ)')
  if (!board.raq_items.length) {
    drawKeyValue(ctx, 'Situação', 'Nenhum item de recebimento neste filtro.')
  } else {
    for (const item of board.raq_items) {
      drawSectionCard(ctx, FUEL_PRODUCT_LABELS[item.product_key], buildRaqRows(item))
    }
  }

  drawHeading(ctx, '2. Análise do produto')
  if (!board.analysis_items.length) {
    drawKeyValue(ctx, 'Situação', 'Nenhuma análise neste filtro.')
  } else {
    for (const item of board.analysis_items) {
      const badge = item.densidade_status
        ? {
            label: DENSITY_CONFORMITY_LABELS[item.densidade_status],
            ok: item.densidade_status === 'apto',
          }
        : null
      drawSectionCard(ctx, FUEL_PRODUCT_LABELS[item.product_key], buildAnalysisRows(item), badge)
    }
  }

  ensureSpace(ctx, 48)
  ctx.y -= 8
  ctx.page.drawLine({
    start: { x: MARGIN_X, y: ctx.y },
    end: { x: PAGE_WIDTH - MARGIN_X, y: ctx.y },
    thickness: 0.8,
    color: COLOR.line,
  })
  ctx.y -= 16
  ctx.page.drawText(
    sanitize(
      `Gerado em ${formatDateTimePtBr(new Date())} a partir da página pública do posto.`,
    ),
    {
      x: MARGIN_X,
      y: ctx.y,
      size: 8,
      font,
      color: COLOR.muted,
    },
  )

  drawFooter(ctx)
  return doc.save()
}

export function downloadRaqPdf(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
    type: 'application/pdf',
  })
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

export async function openRaqPdfForPrint(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
    type: 'application/pdf',
  })
  const url = URL.createObjectURL(blob)
  const popup = window.open(url, '_blank', 'noopener,noreferrer')

  if (!popup) {
    downloadRaqPdf(bytes, fileName)
    URL.revokeObjectURL(url)
    return
  }

  const tryPrint = () => {
    try {
      popup.focus()
      popup.print()
    } catch {
      // Alguns navegadores só liberam impressão após o viewer carregar.
    }
  }

  setTimeout(tryPrint, 700)
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function buildRaqPdfFileName(board: PrintBoard) {
  const date = board.report.submitted_at.slice(0, 10)
  const slug = board.posto.nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 40)
  return `RAQ-${slug || 'posto'}-${date}.pdf`
}
