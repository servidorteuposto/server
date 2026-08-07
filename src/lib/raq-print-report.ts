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
import { drawCenteredBrandLogo, embedTeuPostoLogo } from './pdf-brand'
import { getPublicFuelFileUrl, type PublicPostoBoard } from './public-posto'
import type { FuelAnalysisReport } from './fuel-analyses'

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN_X = 36
const MARGIN_TOP = 34
const MARGIN_BOTTOM = 38
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2
const COL_GAP = 18

const COLOR = {
  ink: rgb(0.05, 0.15, 0.32),
  muted: rgb(0.42, 0.48, 0.56),
  line: rgb(0.82, 0.87, 0.92),
  accent: rgb(0.05, 0.23, 0.48),
  white: rgb(1, 1, 1),
  aptoBg: rgb(0.86, 0.99, 0.9),
  apto: rgb(0.09, 0.45, 0.27),
  inaptoBg: rgb(0.99, 0.89, 0.89),
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

type FieldRow = [string, string]

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
    y: 22,
    size: 8,
    font: ctx.font,
    color: COLOR.muted,
  })
  ctx.page.drawText('Teu Posto - Consulta publica do RAQ', {
    x: MARGIN_X,
    y: 22,
    size: 8,
    font: ctx.font,
    color: COLOR.muted,
  })
}

function drawPageChrome(ctx: PdfContext) {
  ctx.page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    color: rgb(0.93, 0.96, 0.99),
  })
  ctx.page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 8,
    width: PAGE_WIDTH,
    height: 8,
    color: COLOR.accent,
  })
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

function fitImageSize(image: PDFImage, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1)
  return {
    width: image.width * scale,
    height: image.height * scale,
  }
}

function buildRaqRows(item: PublicPostoBoard['raq_items'][number]): FieldRow[] {
  return [
    ['Volume', `${textOrDash(item.volume_received_liters)} L`],
    ['Coleta', item.collection_date ? formatDatePtBr(item.collection_date) : '-'],
    [
      'Transportador',
      item.transporter_cnpj
        ? `${textOrDash(item.transporter_name)} - CNPJ ${formatCnpj(item.transporter_cnpj)}`
        : textOrDash(item.transporter_name),
    ],
    [
      'Nota fiscal',
      item.invoice_file_name
        ? `${textOrDash(item.invoice_number)} · ${sanitize(item.invoice_file_name)}`
        : textOrDash(item.invoice_number),
    ],
    ['Placa', textOrDash(item.truck_plate)],
    ['Motorista', textOrDash(item.driver_name)],
    [
      'Distribuidor',
      item.distributor_cnpj
        ? `${textOrDash(item.distributor_name)} · CNPJ ${formatCnpj(item.distributor_cnpj)}`
        : textOrDash(item.distributor_name),
    ],
  ]
}

function buildAnalysisRows(item: PublicPostoBoard['analysis_items'][number]): FieldRow[] {
  const rows: FieldRow[] = [
    ['Aspecto', textOrDash(item.aspecto)],
    ['Cor', textOrDash(item.cor)],
    ['Temperatura', textOrDash(item.temperatura_observada)],
    ['ME observada', textOrDash(item.massa_especifica_observada)],
    ['ME 20 C', textOrDash(item.massa_especifica_convertida)],
  ]

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
    'Data e hora da foto',
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

function drawStackedFields(
  ctx: PdfContext,
  x: number,
  topY: number,
  width: number,
  rows: FieldRow[],
  labelSize = 7.5,
  valueSize = 9,
) {
  let y = topY
  for (const [label, value] of rows) {
    ctx.page.drawText(sanitize(label).toUpperCase(), {
      x,
      y,
      size: labelSize,
      font: ctx.fontBold,
      color: COLOR.muted,
    })
    y -= 10
    const lines = wrapText(value, ctx.font, valueSize, width)
    lines.forEach((line, index) => {
      ctx.page.drawText(line, {
        x,
        y: y - index * 11,
        size: valueSize,
        font: ctx.font,
        color: COLOR.ink,
      })
    })
    y -= lines.length * 11 + 6
  }
  return y
}

function drawSectionTitle(ctx: PdfContext, title: string, x: number, y: number) {
  ctx.page.drawText(sanitize(title).toUpperCase(), {
    x,
    y,
    size: 9,
    font: ctx.fontBold,
    color: COLOR.accent,
  })
}

function drawStatusBadge(
  ctx: PdfContext,
  status: 'apto' | 'inapto',
  rightX: number,
  y: number,
) {
  const label = DENSITY_CONFORMITY_LABELS[status]
  const padX = 8
  const textWidth = ctx.fontBold.widthOfTextAtSize(label, 8)
  const width = textWidth + padX * 2
  const height = 18
  const x = rightX - width

  ctx.page.drawRectangle({
    x,
    y: y - 4,
    width,
    height,
    color: status === 'apto' ? COLOR.aptoBg : COLOR.inaptoBg,
    borderColor: status === 'apto' ? COLOR.apto : COLOR.inapto,
    borderWidth: 0.6,
  })
  ctx.page.drawText(label, {
    x: x + padX,
    y: y + 1,
    size: 8,
    font: ctx.fontBold,
    color: status === 'apto' ? COLOR.apto : COLOR.inapto,
  })
}

function drawCardFrame(ctx: PdfContext, top: number, bottom: number) {
  ctx.page.drawRectangle({
    x: MARGIN_X - 10,
    y: bottom,
    width: CONTENT_WIDTH + 20,
    height: top - bottom,
    color: COLOR.white,
    borderColor: COLOR.line,
    borderWidth: 1,
  })
}

export type RaqPdfPageSpec = {
  board: PrintBoard
  productKey: FuelProductKey
}

function drawEmptyPdfPage(
  doc: PDFDocument,
  font: PDFFont,
  fontBold: PDFFont,
  message: string,
) {
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
  ctx.page.drawText(sanitize(message), {
    x: MARGIN_X,
    y: ctx.y,
    size: 12,
    font: fontBold,
    color: COLOR.ink,
  })
  drawFooter(ctx)
}

async function drawProductCardPage(
  ctx: PdfContext,
  board: PrintBoard,
  productKey: FuelProductKey,
  brandLogo: PDFImage | null,
) {
  const font = ctx.font
  const fontBold = ctx.fontBold
  const doc = ctx.doc

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

  const photo = analysis
    ? await embedImage(doc, await fetchImageBytes(analysis.photo_storage_path))
    : null
  const signature = await embedImage(doc, await fetchImageBytes(signaturePath))

  const cardTop = ctx.y + 8
  const cardBottom = MARGIN_BOTTOM + 10
  drawCardFrame(ctx, cardTop, cardBottom)

  const innerX = MARGIN_X
  const innerW = CONTENT_WIDTH
  ctx.y -= 4

  if (brandLogo) {
    ctx.y = drawCenteredBrandLogo(ctx.page, brandLogo, ctx.y, {
      maxWidth: 132,
      maxHeight: 42,
      gapBelow: 10,
    })
  } else {
    const fallback = 'TEU POSTO'
    const fallbackWidth = fontBold.widthOfTextAtSize(fallback, 8)
    ctx.page.drawText(fallback, {
      x: innerX + (innerW - fallbackWidth) / 2,
      y: ctx.y,
      size: 8,
      font: fontBold,
      color: COLOR.accent,
    })
    ctx.y -= 12
  }

  const postoName = sanitize(board.report?.razao_social || board.posto.nome)
  const postoLines = wrapText(postoName, fontBold, 10, innerW).slice(0, 2)
  postoLines.forEach((line, index) => {
    ctx.page.drawText(line, {
      x: innerX,
      y: ctx.y - index * 12,
      size: 10,
      font: fontBold,
      color: COLOR.ink,
    })
  })
  ctx.y -= postoLines.length * 12 + 2

  const postoMeta = sanitize(
    `CNPJ ${formatCnpj(board.report?.cnpj || board.posto.cnpj)} · ${
      board.report?.endereco || board.posto.endereco || '-'
    }`,
  )
  const metaLines = wrapText(postoMeta, font, 8, innerW).slice(0, 2)
  metaLines.forEach((line, index) => {
    ctx.page.drawText(line, {
      x: innerX,
      y: ctx.y - index * 10,
      size: 8,
      font,
      color: COLOR.muted,
    })
  })
  ctx.y -= metaLines.length * 10 + 10

  ctx.page.drawLine({
    start: { x: innerX, y: ctx.y },
    end: { x: innerX + innerW, y: ctx.y },
    thickness: 1,
    color: COLOR.line,
  })
  ctx.y -= 18

  const productTitle = sanitize(FUEL_PRODUCT_LABELS[productKey])
  ctx.page.drawText(productTitle, {
    x: innerX,
    y: ctx.y,
    size: 16,
    font: fontBold,
    color: COLOR.ink,
  })

  if (analysis?.densidade_status === 'apto' || analysis?.densidade_status === 'inapto') {
    drawStatusBadge(ctx, analysis.densidade_status, innerX + innerW, ctx.y)
  }
  ctx.y -= 16

  ctx.page.drawText(
    sanitize(submittedAt ? `Lancado em ${formatDateTimePtBr(submittedAt)}` : 'Lancado em -'),
    {
      x: innerX,
      y: ctx.y,
      size: 9,
      font,
      color: COLOR.accent,
    },
  )
  ctx.y -= 20

  const colW = (innerW - COL_GAP) / 2
  const leftX = innerX
  const rightX = innerX + colW + COL_GAP
  const columnsTop = ctx.y

  drawSectionTitle(ctx, 'Recebimento', leftX, columnsTop)
  drawSectionTitle(ctx, 'Analise', rightX, columnsTop)

  const fieldsTop = columnsTop - 16
  const leftRows = raq
    ? buildRaqRows(raq)
    : ([['Situacao', 'Sem dados de recebimento']] as FieldRow[])
  const rightRows = analysis
    ? buildAnalysisRows(analysis)
    : ([['Situacao', 'Sem dados de analise']] as FieldRow[])

  const leftBottom = drawStackedFields(ctx, leftX, fieldsTop, colW, leftRows)
  const rightBottom = drawStackedFields(ctx, rightX, fieldsTop, colW, rightRows)
  ctx.y = Math.min(leftBottom, rightBottom) - 8

  const signoffReserve = signature || author ? 88 : 42
  const availableForPhoto = ctx.y - (cardBottom + signoffReserve + 18)

  if (photo && availableForPhoto > 70) {
    ctx.page.drawText('FOTO DO LOCAL', {
      x: innerX,
      y: ctx.y,
      size: 8,
      font: fontBold,
      color: COLOR.muted,
    })
    ctx.y -= 10

    const photoSize = fitImageSize(
      photo,
      innerW,
      Math.min(210, Math.max(70, availableForPhoto - 12)),
    )
    ctx.y -= photoSize.height
    ctx.page.drawImage(photo, {
      x: innerX,
      y: ctx.y,
      width: photoSize.width,
      height: photoSize.height,
    })
    ctx.y -= 14
  }

  ctx.page.drawLine({
    start: { x: innerX, y: ctx.y },
    end: { x: innerX + innerW, y: ctx.y },
    thickness: 0.8,
    color: COLOR.line,
  })
  ctx.y -= 16

  const signoffTop = ctx.y
  drawSectionTitle(ctx, 'Responsavel', leftX, signoffTop)
  const authorLines = wrapText(author, fontBold, 11, colW).slice(0, 2)
  authorLines.forEach((line, index) => {
    ctx.page.drawText(line, {
      x: leftX,
      y: signoffTop - 14 - index * 13,
      size: 11,
      font: fontBold,
      color: COLOR.ink,
    })
  })

  if (signature) {
    drawSectionTitle(ctx, 'Assinatura', rightX, signoffTop)
    const sigSize = fitImageSize(signature, colW, 52)
    const sigY = signoffTop - 14 - sigSize.height
    ctx.page.drawRectangle({
      x: rightX,
      y: sigY - 4,
      width: sigSize.width + 8,
      height: sigSize.height + 8,
      color: COLOR.white,
      borderColor: COLOR.line,
      borderWidth: 0.8,
    })
    ctx.page.drawImage(signature, {
      x: rightX + 4,
      y: sigY,
      width: sigSize.width,
      height: sigSize.height,
    })
  }

  drawFooter(ctx)
}

/** Gera um PDF com um card por página a partir de uma lista de (RAQ + produto). */
export async function generateRaqPrintPdfFromPages(
  pages: RaqPdfPageSpec[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const brandLogo = await embedTeuPostoLogo(doc)

  if (!pages.length) {
    drawEmptyPdfPage(doc, font, fontBold, 'Nenhum RAQ disponivel para exportacao.')
    return doc.save()
  }

  let pageNumber = 0
  for (const entry of pages) {
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
    await drawProductCardPage(ctx, entry.board, entry.productKey, brandLogo)
  }

  return doc.save()
}

export async function generateRaqPrintPdf(
  board: PrintBoard,
  productKeys?: FuelProductKey[],
): Promise<Uint8Array> {
  const keys = productKeys ?? productKeysFromBoard(board)
  return generateRaqPrintPdfFromPages(keys.map((productKey) => ({ board, productKey })))
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

/** Abre o PDF e dispara a impressão (fallback: download se a impressão falhar). */
export function openRaqPdfForPrint(bytes: Uint8Array, fileName = 'RAQ.pdf') {
  const blob = new Blob(
    [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer],
    { type: 'application/pdf' },
  )
  const url = URL.createObjectURL(blob)
  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', fileName)
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.src = url
  document.body.appendChild(iframe)

  const cleanup = () => {
    iframe.remove()
    URL.revokeObjectURL(url)
  }

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } catch {
      downloadRaqPdf(bytes, fileName)
    } finally {
      window.setTimeout(cleanup, 60_000)
    }
  }

  window.setTimeout(() => {
    if (document.body.contains(iframe)) {
      try {
        iframe.contentWindow?.print()
      } catch {
        downloadRaqPdf(bytes, fileName)
        cleanup()
      }
    }
  }, 2500)
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

/** Converte um lançamento interno do app no formato do PDF de RAQ. */
export function fuelReportToPrintBoard(report: FuelAnalysisReport): PrintBoard {
  return {
    posto: {
      id: report.posto_id,
      nome: report.razao_social,
      cnpj: report.cnpj,
      endereco: report.endereco,
      public_slug: '',
    },
    report: {
      id: report.id,
      posto_id: report.posto_id,
      razao_social: report.razao_social,
      cnpj: report.cnpj,
      endereco: report.endereco,
      author_full_name: report.author_full_name,
      author_cpf: report.author_cpf,
      signature_storage_path: report.signature_storage_path,
      submitted_at: report.submitted_at,
      created_at: report.created_at,
      updated_at: report.updated_at,
    },
    raq_items: report.raq_items.map((item) => ({
      ...item,
      author_full_name: report.author_full_name,
      signature_storage_path: report.signature_storage_path,
      report_submitted_at: report.submitted_at,
    })),
    analysis_items: report.analysis_items.map((item) => ({
      ...item,
      author_full_name: report.author_full_name,
      signature_storage_path: report.signature_storage_path,
      report_submitted_at: report.submitted_at,
    })),
  }
}
