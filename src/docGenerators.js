import { Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, Packer, VerticalAlign, ShadingType } from 'docx'
import { saveAs } from 'file-saver'
import { numeroALetras, montoEnLetras } from './numeroALetras'
import { itemTotalUR, itemCantidadTotal, itemTotalURTotal, yearTotalUR, grandTotalUR, yearTotalPesos, grandTotalPesos, basePesosSinVariacion, fmtUR, fmtPesos } from './apgCalc'

// ── Helpers de formato ─────────────────────────────────────────────────
const BORDER = { style: BorderStyle.SINGLE, size: 2, color: "999999" }
const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }

const th = (text) => new TableCell({
  shading: { type: ShadingType.CLEAR, color: "auto", fill: "1A3A5C" },
  borders: CELL_BORDERS,
  verticalAlign: VerticalAlign.CENTER,
  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 16 })] })],
})

const td = (text, opts = {}) => new TableCell({
  borders: CELL_BORDERS,
  verticalAlign: VerticalAlign.CENTER,
  children: [new Paragraph({ alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT, children: [new TextRun({ text: String(text ?? ""), size: 16, bold: !!opts.bold })] })],
})

const headerInst = () => [
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "DIRECCIÓN NACIONAL DE SANIDAD DE LAS FUERZAS ARMADAS", bold: true, size: 20 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "DIVISIÓN COMERCIAL", bold: true, size: 20 })] }),
]

const firmaIniciales = (t) => new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 200 }, children: [new TextRun({ text: t.iniciales_firma || "", size: 18 })] })

const parrafo = (text, opts = {}) => new Paragraph({
  spacing: { after: 200 },
  alignment: opts.justify ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
  children: [new TextRun({ text, size: 20 })],
})

const expedienteFooter = (t) => t.expediente_numero
  ? new Paragraph({ spacing: { before: 300 }, children: [new TextRun({ text: `Expediente N°: ${t.expediente_numero}`, italics: true, size: 16 })] })
  : new Paragraph({ text: "" })

// ── Moneda del trámite: UR / USD / PESOS ───────────────────────────────
const MONEDA_INFO = {
  UR:    { codigo: "UR",  nombre: "unidad reajustable",        esPesos: false, fraseTasa: "a la tasa de cambio de ARCE (Agencia Reguladora de Compras Estatales)", refVariacion: "POR VARIACIÓN DE LA UR" },
  USD:   { codigo: "USD", nombre: "dólares
