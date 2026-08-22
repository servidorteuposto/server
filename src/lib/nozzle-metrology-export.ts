import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import { formatCnpj, formatCoords, formatDateTimePtBr } from '../config/fuel-analyses'
import {
  evaluateNozzleDraft,
  formatNozzleLabel,
  formatVolumetryLabel,
  fuelLabel,
  isMaintenanceFuel,
  NOZZLE_METROLOGY_REGULATION,
  NOZZLE_METROLOGY_STORAGE_BUCKET,
  statusLabel,
  type MetrologyItemStatus,
} from '../config/nozzle-metrology'
import {
  type NozzleMetrologyItem,
  type NozzleMetrologyVerification,
} from './nozzle-metrology'
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
  apto: rgb(0.09, 0.45, 0.27),
  aptoBg: rgb(0.86, 0.99, 0.9),
  inapto: rgb(0.72, 0.11, 0.11),
  inaptoBg: rgb(0.99, 0.89, 0.89),
  warn: rgb(0.45, 0.32, 0.08),
  warnBg: rgb(1, 0.95, 0.82),
}

export type MetrologyExportPosto = {
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

function boolLabel(value: boolean | null | undefined, yes: string, no: string) {
  if (value == null) return '-'
  return value ? yes : no
}

function formatLiters(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '-'
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)} L`
}

function formatVolumetryPair(
  min: number | null | undefined,
  max: number | null | undefined,
) {
  if (min == null && max == null) return '-'
  return `${min == null ? '-' : formatVolumetryLabel(min)} / ${max == null ? '-' : formatVolumetryLabel(max)}`
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
  ctx.page.drawText('Teu Posto - Verificacao metrologica de bicos', {
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

function statusColors(status: MetrologyItemStatus) {
  if (status === 'aprovado') return { fg: COLOR.apto, bg: COLOR.aptoBg }
  if (status === 'reprovado') return { fg: COLOR.inapto, bg: COLOR.inaptoBg }
  return { fg: COLOR.warn, bg: COLOR.warnBg }
}

function drawStatusChip(ctx: PdfContext, status: MetrologyItemStatus, y: number) {
  const label = sanitize(statusLabel(status))
  const { fg, bg } = statusColors(status)
  const width = ctx.fontBold.widthOfTextAtSize(label, 7.5) + 12
  const x = PAGE_WIDTH - MARGIN_X - width
  ctx.page.drawRectangle({
    x,
    y: y - 3,
    width,
    height: 14,
    color: bg,
  })
  ctx.page.drawText(label, {
    x: x + 6,
    y,
    size: 7.5,
    font: ctx.fontBold,
    color: fg,
  })
  return width
}

function itemReasons(item: NozzleMetrologyItem) {
  return evaluateNozzleDraft({
    fuelProductKey: item.fuel_product_key,
    fuelOtherLabel: item.fuel_other_label ?? '',
    volumetryMin: item.volumetry_min,
    volumetryMax: item.volumetry_max,
    flowMinLiters: item.flow_min_liters,
    flowMaxLiters: item.flow_max_liters,
    sealsOk: item.seals_ok,
    leakage: item.leakage,
    hoseOk: item.hose_ok,
    displayBurned: item.display_burned,
    nozzleOk: item.nozzle_ok,
  }).reasons
}

function drawNozzleBlock(ctx: PdfContext, item: NozzleMetrologyItem) {
  const fuel = fuelLabel(item.fuel_product_key, item.fuel_other_label)
  const title = `${formatNozzleLabel(item.nozzle_number)} - ${fuel}`
  const titleLines = wrapText(title, ctx.fontBold, 10, CONTENT_WIDTH - 120)
  const maintenance = isMaintenanceFuel(item.fuel_product_key)
  const reasons = item.item_status === 'reprovado' ? itemReasons(item) : []
  const reasonLines = reasons.flatMap((reason) => wrapText(`- ${reason}`, ctx.font, 8, CONTENT_WIDTH - 8))
  const detailLines = maintenance
    ? []
    : [
        ...wrapText(
          `Vol. min/max: ${formatVolumetryPair(item.volumetry_min, item.volumetry_max)}   Vazao min/max: ${formatLiters(item.flow_min_liters)} / ${formatLiters(item.flow_max_liters)}`,
          ctx.font,
          8.5,
          CONTENT_WIDTH,
        ),
        ...wrapText(
          `Lacres: ${boolLabel(item.seals_ok, 'OK', 'Nao OK')}  ·  Vazamento: ${boolLabel(item.leakage, 'Sim', 'Nao')}  ·  Mangueira OK: ${boolLabel(item.hose_ok, 'Sim', 'Nao')}  ·  Display queimado: ${boolLabel(item.display_burned, 'Sim', 'Nao')}  ·  Bico de acordo: ${boolLabel(item.nozzle_ok, 'Sim', 'Nao')}`,
          ctx.font,
          8.5,
          CONTENT_WIDTH,
        ),
      ]
  const extraLines = maintenance ? 1 : detailLines.length
  const needed = 18 + titleLines.length * 12 + extraLines * 12 + reasonLines.length * 10 + 10

  ensureSpace(ctx, needed)

  titleLines.forEach((line, index) => {
    ctx.page.drawText(line, {
      x: MARGIN_X,
      y: ctx.y - index * 12,
      size: 10,
      font: ctx.fontBold,
      color: COLOR.ink,
    })
  })
  drawStatusChip(ctx, item.item_status, ctx.y)
  ctx.y -= titleLines.length * 12 + 4

  if (maintenance) {
    ctx.page.drawText('Bico em manutencao: demais dados opcionais.', {
      x: MARGIN_X,
      y: ctx.y,
      size: 8.5,
      font: ctx.font,
      color: COLOR.muted,
    })
    ctx.y -= 16
    return
  }

  detailLines.forEach((line) => {
    ctx.page.drawText(line, {
      x: MARGIN_X,
      y: ctx.y,
      size: 8.5,
      font: ctx.font,
      color: COLOR.ink,
    })
    ctx.y -= 12
  })

  reasonLines.forEach((line) => {
    ctx.page.drawText(line, {
      x: MARGIN_X,
      y: ctx.y,
      size: 8,
      font: ctx.font,
      color: COLOR.inapto,
    })
    ctx.y -= 10
  })

  ctx.y -= 6
}

async function fetchImageBytes(path: string | null | undefined) {
  if (!path) return null
  try {
    const { bytes, contentType } = await getSignedObjectBytes(
      NOZZLE_METROLOGY_STORAGE_BUCKET,
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
  const { width, height } = fitImageSize(image, maxWidth, maxHeight)
  ensureSpace(ctx, height + 10)
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

export function buildMetrologyPdfFileName(
  posto: MetrologyExportPosto,
  verification: NozzleMetrologyVerification,
) {
  const date = verification.verified_at.slice(0, 10)
  return `Verificacao-Metrologica-${slugify(posto.nome) || 'posto'}-${date}.pdf`
}

export async function generateMetrologyPrintPdf(
  posto: MetrologyExportPosto,
  verification: NozzleMetrologyVerification,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const brandLogo = await embedTeuPostoLogo(doc)
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

  ctx.page.drawText('Verificacao Metrologica de Bicos', {
    x: MARGIN_X,
    y: ctx.y,
    size: 15,
    font: fontBold,
    color: COLOR.ink,
  })
  ctx.y -= 16

  ctx.page.drawText(sanitize(`${NOZZLE_METROLOGY_REGULATION}  ·  Relatorio para impressao A4`), {
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
  ctx.y -= 4

  drawHeading(ctx, '1. Dados da verificacao')
  drawKeyValue(ctx, 'Verificado em', formatDateTimePtBr(verification.verified_at))
  drawKeyValue(ctx, 'Funcionario', verification.employee_full_name)
  drawKeyValue(ctx, 'Quantidade de bicos', String(verification.nozzle_count))
  drawKeyValue(ctx, 'Resultado geral', statusLabel(verification.overall_status))
  ctx.y -= 4

  drawHeading(ctx, '2. Planilha de bicos')
  const items = verification.items ?? []
  if (!items.length) {
    drawKeyValue(ctx, 'Bicos', 'Nenhum bico registrado nesta verificacao.')
  } else {
    for (const item of items) {
      drawNozzleBlock(ctx, item)
    }
  }
  ctx.y -= 4

  drawHeading(ctx, '3. Foto do local')
  drawKeyValue(ctx, 'Foto capturada em', formatDateTimePtBr(verification.photo_captured_at))
  drawKeyValue(
    ctx,
    'Coordenadas',
    formatCoords(verification.photo_latitude, verification.photo_longitude),
  )

  const [photo, signature] = await Promise.all([
    embedRasterImage(doc, await fetchImageBytes(verification.photo_storage_path)),
    embedRasterImage(doc, await fetchImageBytes(verification.signature_storage_path)),
  ])

  if (photo) {
    ctx.y -= 2
    drawEmbeddedImage(ctx, photo, CONTENT_WIDTH, 220)
  } else {
    drawKeyValue(ctx, 'Foto', 'Nao disponivel')
  }

  drawHeading(ctx, '4. Assinatura')
  drawKeyValue(ctx, 'Assinado por', verification.employee_full_name)
  if (signature) {
    drawEmbeddedImage(ctx, signature, Math.min(CONTENT_WIDTH, 240), 80)
  } else {
    drawKeyValue(ctx, 'Assinatura', 'Nao disponivel')
  }

  ctx.y -= 4
  ensureSpace(ctx, 16)
  ctx.page.drawText(sanitize(`Gerado em ${formatDateTimePtBr(new Date())} pelo Teu Posto.`), {
    x: MARGIN_X,
    y: ctx.y,
    size: 8,
    font,
    color: COLOR.muted,
  })

  drawFooter(ctx)
  return doc.save()
}
