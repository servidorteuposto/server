import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import {
  FUEL_PRODUCT_LABELS,
  formatCnpj,
  formatCoords,
  formatDateTimePtBr,
  type FuelProductKey,
} from '../config/fuel-analyses'
import { DENSITY_CONFORMITY_LABELS } from '../config/fuel-density'
import { formatDatePtBr } from '../config/regulatory-documents'
import { getPublicFuelFileUrl, type PublicPostoBoard } from './public-posto'

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
  band: rgb(0.93, 0.96, 0.99),
  apto: rgb(0.09, 0.45, 0.27),
  inapto: rgb(0.72, 0.11, 0.11),
}

export type PrintBoard = {
  posto: PublicPostoBoard['posto']
  report: NonNullable<PublicPostoBoard['report']> | null
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
  ctx.page.drawText('Teu Posto - Consulta publica do RAQ', {
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

function drawKeyValue(ctx: PdfContext, label: string, value: string, labelWidth = 128) {
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
    const url = await getPublicFuelFileUrl(path)
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
  const isPng =
    image.contentType.includes('png') || lowerPath.endsWith('.png')
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

function buildRaqRows(item: PublicPostoBoard['raq_items'][number]): Array<[string, string]> {
  return [
    ['Volume recebido', `${textOrDash(item.volume_received_liters)} L`],
    ['Data da coleta', item.collection_date ? formatDatePtBr(item.collection_date) : '-'],
    [
      'Transportador',
      item.transporter_cnpj
        ? `${textOrDash(item.transporter_name)} (${formatCnpj(item.transporter_cnpj)})`
        : textOrDash(item.transporter_name),
    ],
    ['Nota fiscal', textOrDash(item.invoice_number)],
    ['Arquivo NF', textOrDash(item.invoice_file_name)],
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
    ['ME a 20 C', textOrDash(item.massa_especifica_convertida)],
  ]

  if (item.densidade_status) {
    rows.push(['Conformidade', DENSITY_CONFORMITY_LABELS[item.densidade_status]])
  }

  if (item.teor_alcool_gasolina) {
    const label = item.product_key.startsWith('etanol-')
      ? 'Teor alcoolico (INPM)'
      : 'Teor de alcool'
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

function productKeysFromBoard(board: PrintBoard): FuelProductKey[] {
  const keys = new Set<FuelProductKey>()
  for (const item of board.raq_items) keys.add(item.product_key)
  for (const item of board.analysis_items) keys.add(item.product_key)
  return [...keys]
}

export async function generateRaqPrintPdf(board: PrintBoard): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const products = productKeysFromBoard(board)

  if (!products.length) {
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
    ctx.page.drawText('Nenhum RAQ disponivel para exportacao.', {
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

  for (const productKey of products) {
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

    const raq = board.raq_items.find((item) => item.product_key === productKey)
    const analysis = board.analysis_items.find((item) => item.product_key === productKey)
    const author =
      analysis?.author_full_name ||
      raq?.author_full_name ||
      board.report?.author_full_name ||
      '-'
    const submittedAt =
      analysis?.report_submitted_at ||
      raq?.report_submitted_at ||
      board.report?.submitted_at ||
      null
    const signaturePath =
      analysis?.signature_storage_path ||
      raq?.signature_storage_path ||
      board.report?.signature_storage_path ||
      null

    ctx.page.drawText('TEU POSTO', {
      x: MARGIN_X,
      y: ctx.y,
      size: 10,
      font: fontBold,
      color: COLOR.accent,
    })
    ctx.y -= 16

    ctx.page.drawText(sanitize(`RAQ - ${FUEL_PRODUCT_LABELS[productKey]}`), {
      x: MARGIN_X,
      y: ctx.y,
      size: 15,
      font: fontBold,
      color: COLOR.ink,
    })
    ctx.y -= 16

    ctx.page.drawText(sanitize('Exportacao da consulta publica'), {
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
    drawKeyValue(ctx, 'Posto', board.report?.razao_social || board.posto.nome)
    drawKeyValue(ctx, 'CNPJ', formatCnpj(board.report?.cnpj || board.posto.cnpj))
    drawKeyValue(ctx, 'Endereco', board.report?.endereco || board.posto.endereco || '-')
    drawKeyValue(
      ctx,
      'Lancado em',
      submittedAt ? formatDateTimePtBr(submittedAt) : '-',
    )
    drawKeyValue(ctx, 'Responsavel / assinatura', author)
    ctx.y -= 4

    drawHeading(ctx, '1. Recebimento')
    if (!raq) {
      drawKeyValue(ctx, 'Situacao', 'Sem dados de recebimento para este combustivel.')
    } else {
      for (const [label, value] of buildRaqRows(raq)) {
        drawKeyValue(ctx, label, value)
      }
    }
    ctx.y -= 4

    drawHeading(ctx, '2. Analise do produto')
    if (!analysis) {
      drawKeyValue(ctx, 'Situacao', 'Sem dados de analise para este combustivel.')
    } else {
      for (const [label, value] of buildAnalysisRows(analysis)) {
        drawKeyValue(ctx, label, value)
      }

      const photo = await embedImage(doc, await fetchImageBytes(analysis.photo_storage_path))
      if (photo) {
        ctx.y -= 2
        ctx.page.drawText('Foto do local', {
          x: MARGIN_X,
          y: ctx.y,
          size: 9,
          font: fontBold,
          color: COLOR.muted,
        })
        ctx.y -= 8
        drawEmbeddedImage(ctx, photo, CONTENT_WIDTH, 220)
      }
    }

    const signature = await embedImage(doc, await fetchImageBytes(signaturePath))
    if (signature) {
      drawHeading(ctx, '3. Assinatura')
      drawKeyValue(ctx, 'Assinado por', author)
      drawEmbeddedImage(ctx, signature, Math.min(CONTENT_WIDTH, 260), 90)
    }

    ctx.y -= 6
    ensureSpace(ctx, 24)
    ctx.page.drawText(
      sanitize(`Gerado em ${formatDateTimePtBr(new Date())} pela pagina publica.`),
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

export function downloadRaqPdf(bytes: Uint8Array, fileName: string) {
  const blob = new Blob(
    [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer],
    { type: 'application/pdf' },
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

export async function openRaqPdfForPrint(bytes: Uint8Array, fileName: string) {
  downloadRaqPdf(bytes, fileName)
}

export function buildRaqPdfFileName(board: PrintBoard) {
  const date = (board.report?.submitted_at ?? new Date().toISOString()).slice(0, 10)
  const slug = board.posto.nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 40)
  return `RAQ-${slug || 'posto'}-${date}.pdf`
}
