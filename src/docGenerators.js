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
  USD:   { codigo: "USD", nombre: "dólares estadounidenses",   esPesos: false, fraseTasa: "a la cotización del dólar estadounidense",                              refVariacion: "POR VARIACIÓN DEL DÓLAR" },
  PESOS: { codigo: "$",   nombre: "pesos uruguayos",           esPesos: true,  fraseTasa: "",                                                                       refVariacion: "EN CONCEPTO DE PREVISIÓN" },
}
const getMoneda = (t) => MONEDA_INFO[t.moneda] || MONEDA_INFO.UR

async function descargar(doc, filename) {
  const blob = await Packer.toBlob(doc)
  saveAs(blob, filename)
}

// ════════════════════════════════════════════════════════════════════════
// 1) ANEXO / SOLICITUD DE COMPRA DIRECTA AMPLIADA
// ════════════════════════════════════════════════════════════════════════
export async function generarAnexoCompraDirecta(tramite, items, anios) {
  const m = getMoneda(tramite)
  const filasItems = items.map((it, i) => new TableRow({
    children: [
      td(it.codigo_arce, { center: true }),
      td(it.descripcion_arce),
      td(it.detalle_variante),
      td(it.unidad_arce, { center: true }),
      td(it.observaciones),
      td(itemCantidadTotal(it, anios), { center: true }),
      td(fmtUR(it.precio_unitario_ur), { center: true }),
      td(`${it.iva_pct || 0}%`, { center: true }),
    ],
  }))

  const tabla = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        th("Código ARCE"), th("Descripción ARCE"), th("Detalle y/o variante ARCE"), th("Unidad ARCE"),
        th("Observaciones y/o especificaciones técnicas"), th("Cantidad hasta"), th(`Precio unitario ${m.codigo}`), th("% IVA"),
      ]}),
      ...filasItems,
    ],
  })

  const condiciones = (tramite.condiciones_particulares || "")
    .split("\n").map(l => l.trim()).filter(Boolean)
    .map(l => new Paragraph({ bullet: { level: 0 }, spacing: { after: 120 }, children: [new TextRun({ text: l, size: 20 })] }))

  const doc = new Document({ sections: [{ children: [
    ...headerInst(),
    firmaIniciales(tramite),
    new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: `SEÑOR ${(tramite.destinatario_anexo || "").toUpperCase()}`, bold: true, size: 20 })] }),
    parrafo(`Por la presente elevo a usted la solicitud de una ${tramite.tipo_solicitud || "Compra Directa Ampliada"}, para la adquisición del siguiente procedimiento.`, { justify: true }),
    ...(tramite.articulo_ley ? [parrafo(`Se deja constancia de que se han verificado los extremos previstos en el ${tramite.articulo_ley}.`, { justify: true })] : []),
    new Paragraph({ text: "", spacing: { after: 150 } }),
    tabla,
    new Paragraph({ text: "", spacing: { after: 200 } }),
    ...condiciones,
    new Paragraph({ text: "", spacing: { before: 400 } }),
    expedienteFooter(tramite),
  ]}]})

  await descargar(doc, `Anexo_Compra_Directa_${(tramite.procedimiento || "doc").replace(/[^\w-]/g,"_")}.docx`)
}

// ════════════════════════════════════════════════════════════════════════
// 2) NOTA AL JEFE CON CÁLCULO DE A.P.G.
// ════════════════════════════════════════════════════════════════════════
export async function generarNotaJefe(tramite, items, anios) {
  const m = getMoneda(tramite)
  const totalUR = grandTotalUR(items, anios)
  const ivaPromedio = items[0]?.iva_pct || 10
  const basePesos = basePesosSinVariacion(items, anios, m.esPesos ? 1 : tramite.cotizacion_ur)
  const pctVar = Number(tramite.pct_variacion_cambio) || 0
  const totalConVariacion = basePesos * (1 + pctVar / 100)

  const plazoTxt = tramite.plazo_ejecucion_meses
    ? `${tramite.plazo_ejecucion_meses} (${numeroALetras(tramite.plazo_ejecucion_meses)}) meses`
    : "____ meses"

  const parrafoAPG = m.esPesos
    ? `A los efectos del cálculo de la A.P.G., el monto del procedimiento asciende a $ ${fmtPesos(basePesos)} (${montoEnLetras(basePesos, "pesos uruguayos")}) IVA ${ivaPromedio}% incluido, más el ${pctVar}% por posible variación de precios, lo que sumaría un total de $ ${fmtPesos(totalConVariacion)} (${montoEnLetras(totalConVariacion, "pesos uruguayos")}) IVA ${ivaPromedio}% incluido.`
    : `A los efectos del cálculo de la A.P.G., el monto del procedimiento asciende a ${m.codigo} ${fmtUR(totalUR)} (${m.nombre} ${numeroALetras(Math.round(totalUR))}) IVA ${ivaPromedio}% incluido que ${m.fraseTasa} al mes de ${tramite.mes_cotizacion || "____"} ($${fmtPesos(tramite.cotizacion_ur)}), equivaldría a $ ${fmtPesos(basePesos)} (${montoEnLetras(basePesos, "pesos uruguayos")}), más el ${pctVar}% por posible variación del tipo de cambio, lo que sumaría un total de $ ${fmtPesos(totalConVariacion)} (${montoEnLetras(totalConVariacion, "pesos uruguayos")}) IVA ${ivaPromedio}% incluido.`

  const doc = new Document({ sections: [{ children: [
    ...headerInst(),
    firmaIniciales(tramite),
    new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: `SEÑOR ${(tramite.destinatario_nota || "").toUpperCase()}`, bold: true, size: 20 })] }),
    parrafo(`Por la presente, cúmpleme elevar a usted la solicitud para la contratación del siguiente procedimiento: "${(tramite.concepto || "").toUpperCase()}".`, { justify: true }),
    parrafo(`El plazo de ejecución será de ${plazoTxt} y comenzará a computarse desde la fecha de emisión de la primera orden de compra. No obstante, si al primer día del mes siguiente de cumplidos tres (3) meses desde la notificación de la adjudicación no se hubiera emitido ninguna orden de compra, el plazo comenzará automáticamente en dicha fecha.`, { justify: true }),
    parrafo(parrafoAPG, { justify: true }),
    parrafo(`Por lo expuesto se eleva la presente a los efectos de iniciar el procedimiento de compra correspondiente.`, { justify: true }),
    new Paragraph({ text: "", spacing: { before: 400 } }),
    expedienteFooter(tramite),
  ]}]})

  await descargar(doc, `Nota_Jefe_APG_${(tramite.procedimiento || "doc").replace(/[^\w-]/g,"_")}.docx`)
}

// ════════════════════════════════════════════════════════════════════════
// 3) DISTRIBUCIÓN DE APG POR AÑOS
// ════════════════════════════════════════════════════════════════════════
export async function generarDistribucionAnios(tramite, items, anios) {
  const m = getMoneda(tramite)
  const cotizacionEfectiva = m.esPesos ? 1 : tramite.cotizacion_ur

  const anioCols = anios.flatMap(a => [
    th(`Cantidad ${a} hasta`), th(`% IVA ${a}`), th(`Precio Total ${m.codigo} ${a}`),
  ])

  const filasItems = items.map((it, i) => new TableRow({
    children: [
      td(i + 1, { center: true }),
      td(it.codigo_arce, { center: true }),
      td(it.descripcion_arce),
      td(it.detalle_variante),
      td(it.unidad_arce, { center: true }),
      td(it.observaciones),
      td(fmtUR(it.precio_unitario_ur), { center: true }),
      ...anios.flatMap(a => [
        td(it.anios?.[a] || 0, { center: true }),
        td(`${it.iva_pct || 0}%`, { center: true }),
        td(fmtUR(itemTotalUR(it, a)), { center: true }),
      ]),
      td(fmtUR(itemTotalURTotal(it, anios)), { center: true, bold: true }),
    ],
  }))

  // Si la moneda ya es pesos, la fila "TOTAL EN {codigo}" sería idéntica a "TOTAL EN $" → se omite.
  const filaTotalOrigen = new TableRow({ children: [
    td(`TOTAL EN ${m.codigo}`, { bold: true }), td(""), td(""), td(""), td(""), td(""), td(""),
    ...anios.flatMap(a => [td(""), td(""), td(fmtUR(yearTotalUR(items, a)), { center: true, bold: true })]),
    td(fmtUR(grandTotalUR(items, anios)), { center: true, bold: true }),
  ]})

  const filaTotalPesos = new TableRow({ children: [
    td("TOTAL EN $", { bold: true }), td(""), td(""), td(""), td(""), td(""), td(""),
    ...anios.flatMap(a => [td(""), td(""), td(fmtPesos(yearTotalPesos(items, a, cotizacionEfectiva, tramite.pct_variacion_cambio)), { center: true, bold: true })]),
    td(fmtPesos(grandTotalPesos(items, anios, cotizacionEfectiva, tramite.pct_variacion_cambio)), { center: true, bold: true }),
  ]})

  const tabla = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        th("N°"), th("Código ARCE"), th("Descripción ARCE"), th("Detalle y/o variante"), th("Unidad"),
        th("Observaciones"), th(`Precio unitario ${m.codigo}`), ...anioCols, th(`Precio Total ${m.codigo}`),
      ]}),
      ...filasItems,
      ...(m.esPesos ? [] : [filaTotalOrigen]),
      filaTotalPesos,
    ],
  })

  const doc = new Document({ sections: [{ children: [
    ...headerInst(),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: "Anexo Distribución por años APG", bold: true, size: 22 })] }),
    ...(m.esPesos ? [] : [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: `VALOR ${m.codigo} ${(tramite.mes_cotizacion || "").toUpperCase()}: $ ${fmtPesos(tramite.cotizacion_ur)}`, italics: true, size: 18 })] })]),
    tabla,
    new Paragraph({ text: "", spacing: { before: 200 } }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({
      text: `TOTAL EN PESOS URUGUAYOS CON UN AUMENTO DE ${tramite.pct_variacion_cambio || 0}% (${numeroALetras(tramite.pct_variacion_cambio||0).toUpperCase()} POR CIENTO) ${m.refVariacion}`,
      bold: true, size: 18,
    })]}),
    new Paragraph({ text: "", spacing: { before: 400 } }),
    expedienteFooter(tramite),
  ]}]})

  await descargar(doc, `Distribucion_APG_Anios_${(tramite.procedimiento || "doc").replace(/[^\w-]/g,"_")}.docx`)
}
