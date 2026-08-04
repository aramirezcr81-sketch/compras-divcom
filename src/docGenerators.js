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

// ════════════════════════════════════════════════════════════════════════
// 4) FORMULARIO A — Requerimientos Administrativos Compras Directas y
//    Licitaciones (Anexo N°1 del Protocolo de Compras DNSFFAA, Res. 855/DNS/19)
// ════════════════════════════════════════════════════════════════════════
export async function generarFormularioA(tramite, items, anios) {
  const fila2 = (label, value) => new TableRow({ children: [
    new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS, shading: { type: ShadingType.CLEAR, color: "auto", fill: "F0F0F0" }, children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 18 })] })] }),
    td(value),
  ]})

  const tablaGeneral = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
    fila2("Fecha", tramite.fecha_solicitud ? tramite.fecha_solicitud.split("-").reverse().join("/") : ""),
    fila2("N° y Tipo de Procedimiento", `${tramite.procedimiento || ""} — ${tramite.tipo_solicitud || ""}`),
    fila2("Descripción", tramite.concepto || ""),
  ]})

  const tablaConsultas = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
    new TableRow({ children: [th("Persona Responsable"), th("Lugar"), th("Días"), th("Horario"), th("Teléfono y Correo Electrónico")] }),
    new TableRow({ children: [
      td(tramite.profesional_solicitante), td(tramite.servicio_solicitante), td(tramite.dias_horarios), td(tramite.dias_horarios),
      td([tramite.contacto_celular, tramite.contacto_interno, tramite.contacto_correo].filter(Boolean).join(" / ")),
    ]}),
  ]})

  const tablaMuestras = (tramite.recepcion_lugar || tramite.recepcion_fecha_limite) ? new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
    new TableRow({ children: [th("Lugar"), th("Días"), th("Horario"), th("Teléfono"), th("Fecha Límite de Recepción")] }),
    new TableRow({ children: [
      td(tramite.recepcion_lugar), td(tramite.recepcion_dias), td(tramite.recepcion_horario), td(tramite.recepcion_telefono),
      td(tramite.recepcion_fecha_limite ? tramite.recepcion_fecha_limite.split("-").reverse().join("/") : ""),
    ]}),
  ]}) : null

  const proveedores = tramite.proveedores_convocar || []
  const tablaProveedores = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
    new TableRow({ children: [th("Nombre del Proveedor"), th("Teléfono/Fax"), th("E-mail")] }),
    ...(proveedores.length ? proveedores.map(p => new TableRow({ children: [td(p.nombre), td(p.telefono), td(p.correo)] }))
      : [new TableRow({ children: [td(""), td(""), td("")] })]),
  ]})

  const doc = new Document({ sections: [{ children: [
    ...headerInst(),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "FORMULARIO DE REQUERIMIENTOS ADMINISTRATIVOS — COMPRAS DIRECTAS Y LICITACIONES (FORMULARIO A)", bold: true, size: 22 })] }),
    tablaGeneral,
    new Paragraph({ text: "", spacing: { before: 200 } }),
    new Paragraph({ children: [new TextRun({ text: "II. Consultas Técnicas", bold: true, size: 20 })], spacing: { after: 100 } }),
    tablaConsultas,
    new Paragraph({ text: "", spacing: { before: 200 } }),
    new Paragraph({ children: [new TextRun({ text: "III. Especificaciones Técnicas", bold: true, size: 20 })], spacing: { after: 100 } }),
    parrafo(tramite.especificaciones_tecnicas ? "SÍ — se adjuntan firmadas en hoja aparte." : "NO"),
    ...(tramite.documentacion_proveedor ? [
      new Paragraph({ children: [new TextRun({ text: "IV. Documentación a presentar por el proveedor", bold: true, size: 20 })], spacing: { after: 100 } }),
      parrafo(tramite.documentacion_proveedor, { justify: true }),
    ] : []),
    ...(tablaMuestras ? [
      new Paragraph({ children: [new TextRun({ text: "V. Presentación de Muestras y/o Catálogos", bold: true, size: 20 })], spacing: { before: 200, after: 100 } }),
      tablaMuestras,
    ] : []),
    new Paragraph({ children: [new TextRun({ text: `VI. Lista de Posibles Proveedores (mínimo ${tramite.tipo_solicitud?.toLowerCase().includes("licitaci") ? "6 para Licitaciones" : "3 para Compra Directa"})`, bold: true, size: 20 })], spacing: { before: 200, after: 100 } }),
    tablaProveedores,
    ...(tramite.motivo_menor_proveedores ? [parrafo(`Motivo de convocatoria a menos del mínimo: ${tramite.motivo_menor_proveedores}`, { justify: true })] : []),
    new Paragraph({ text: "", spacing: { before: 500 } }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "_______________________", size: 20 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Firma — ${tramite.jefe_divcom_nombre || ""}`, size: 18 })] }),
    new Paragraph({ text: "", spacing: { before: 400 } }),
    expedienteFooter(tramite),
  ]}]})

  await descargar(doc, `Formulario_A_${(tramite.procedimiento || "doc").replace(/[^\w-]/g,"_")}.docx`)
}

// ════════════════════════════════════════════════════════════════════════
// 5) FORMULARIO B — Requerimientos Técnicos y/o Administrativos para
//    Procedimientos y/o Productos por Excepción (Anexo N°1 del Protocolo)
// ════════════════════════════════════════════════════════════════════════
export async function generarFormularioB(tramite, items, anios) {
  const fila2 = (label, value) => new TableRow({ children: [
    new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, borders: CELL_BORDERS, shading: { type: ShadingType.CLEAR, color: "auto", fill: "F0F0F0" }, children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 18 })] })] }),
    td(value),
  ]})

  const tablaGeneral = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
    fila2("Fecha", tramite.fecha_solicitud ? tramite.fecha_solicitud.split("-").reverse().join("/") : ""),
    fila2("N° de Procedimiento", tramite.procedimiento || ""),
    fila2("Descripción", tramite.concepto || ""),
  ]})

  const tablaProveedor = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
    new TableRow({ children: [th("Nombre del Proveedor"), th("Teléfono/Fax"), th("Correo Electrónico")] }),
    new TableRow({ children: [td(tramite.proveedor_excepcion_nombre), td(tramite.proveedor_excepcion_telefono), td(tramite.proveedor_excepcion_correo)] }),
  ]})

  const tablaConsultas = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
    new TableRow({ children: [th("Persona Responsable"), th("Lugar"), th("Días"), th("Horario"), th("Teléfono y Correo Electrónico")] }),
    new TableRow({ children: [
      td(tramite.profesional_solicitante), td(tramite.servicio_solicitante), td(tramite.dias_horarios), td(tramite.dias_horarios),
      td([tramite.contacto_celular, tramite.contacto_interno, tramite.contacto_correo].filter(Boolean).join(" / ")),
    ]}),
  ]})

  const doc = new Document({ sections: [{ children: [
    ...headerInst(),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "FORMULARIO DE REQUERIMIENTOS TÉCNICOS Y/O ADMINISTRATIVOS — PROCEDIMIENTOS POR EXCEPCIÓN (FORMULARIO B)", bold: true, size: 22 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "(Exclusivos, Importaciones, Urgencia, etc.)", italics: true, size: 18 })] }),
    tablaGeneral,
    new Paragraph({ text: "", spacing: { before: 200 } }),
    new Paragraph({ children: [new TextRun({ text: "II. Datos del Proveedor", bold: true, size: 20 })], spacing: { after: 100 } }),
    tablaProveedor,
    new Paragraph({ text: "", spacing: { before: 200 } }),
    new Paragraph({ children: [new TextRun({ text: "III. Fundamentos de la Excepción", bold: true, size: 20 })], spacing: { after: 100 } }),
    parrafo(tramite.fundamentacion_excepcion || "(Contratación entre organismos del Estado — no requiere fundamentación de excepción)", { justify: true }),
    new Paragraph({ children: [new TextRun({ text: "IV. Consultas Técnicas", bold: true, size: 20 })], spacing: { before: 200, after: 100 } }),
    tablaConsultas,
    new Paragraph({ children: [new TextRun({ text: "V. Especificaciones Técnicas", bold: true, size: 20 })], spacing: { before: 200, after: 100 } }),
    parrafo(tramite.especificaciones_tecnicas ? "SÍ — se adjuntan firmadas en hoja aparte." : "NO"),
    ...(tramite.documentacion_proveedor ? [
      new Paragraph({ children: [new TextRun({ text: "VI. Documentación a presentar por el proveedor", bold: true, size: 20 })], spacing: { before: 200, after: 100 } }),
      parrafo(tramite.documentacion_proveedor, { justify: true }),
    ] : []),
    new Paragraph({ text: "", spacing: { before: 500 } }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "_______________________", size: 20 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Firma — ${tramite.jefe_divcom_nombre || ""}`, size: 18 })] }),
    new Paragraph({ text: "", spacing: { before: 400 } }),
    expedienteFooter(tramite),
  ]}]})

  await descargar(doc, `Formulario_B_${(tramite.procedimiento || "doc").replace(/[^\w-]/g,"_")}.docx`)
}

// ════════════════════════════════════════════════════════════════════════
// 6) MEMO — SOLICITUD DE AUTORIZACIÓN PARA GASTAR (a División Planeamiento y Presupuesto)
// ════════════════════════════════════════════════════════════════════════
const LETRAS_MEMO = ["A", "B", "C", "D", "E", "F", "G", "H"]
const MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

export async function generarMemoAutorizacionGastar(tramite, items, anios) {
  const cotizacionEfectiva = getMoneda(tramite).esPesos ? 1 : tramite.cotizacion_ur
  const aniosOrdenados = [...anios].sort((a, b) => a - b)
  const multiAnio = aniosOrdenados.length > 1
  const letraPorAnio = {}
  aniosOrdenados.forEach((a, i) => { letraPorAnio[a] = LETRAS_MEMO[i] || "" })

  const tipoTramite = tramite.memo_tipo_tramite || "INICIO"
  const tipoCodigo = tramite.tipo_codigo || ""
  const referencia = tramite.memo_referencia_expediente || ""
  const ivaTexto = tramite.memo_iva_exento ? "exento" : "incluido"

  const fecha = tramite.fecha_solicitud ? new Date(tramite.fecha_solicitud + "T00:00:00") : new Date()
  const dia = fecha.getDate()
  const mesNombre = MESES_LARGO[fecha.getMonth()]
  const anioActual = fecha.getFullYear()

  const numeroMemoTitulo = `${tramite.numero_apg || ""}${multiAnio ? aniosOrdenados.map(a => letraPorAnio[a]).join("") : ""}`

  // ── Frases según tipo de trámite ──────────────────────────────────────
  const verboFrase = tipoTramite === "INICIO"
    ? "a fin de iniciar el procedimiento de compra correspondiente"
    : tipoTramite === "AMPLIACION_PARCIAL"
      ? "a fin de ampliar parcialmente el procedimiento de compra correspondiente"
      : "a fin de ampliar el procedimiento de compra correspondiente"

  const estudiarFrase = tipoTramite === "INICIO"
    ? (tramite.articulo_ley
        ? `iniciando el procedimiento de compra a través del ${tramite.articulo_ley}.`
        : `iniciando el procedimiento de ${tramite.tipo_solicitud || "Compra Directa"}.`)
    : tipoTramite === "AMPLIACION_PARCIAL"
      ? `ampliando parcialmente el procedimiento de compra ${tipoCodigo} N° ${referencia}.`
      : `ampliando el procedimiento de compra ${tipoCodigo} N° ${referencia}.`

  const tipoProcedimientoCelda = tipoTramite === "INICIO"
    ? (tramite.articulo_ley || tramite.tipo_solicitud || "")
    : tipoTramite === "AMPLIACION_PARCIAL"
      ? `Ampliación parcial del procedimiento de compra ${tipoCodigo} N° ${referencia}`
      : `Ampliación del procedimiento de compra ${tipoCodigo} N° ${referencia}`

  // ── Montos por año ──────────────────────────────────────────────────
  const montoPorAnio = {}
  aniosOrdenados.forEach(a => { montoPorAnio[a] = yearTotalPesos(items, a, cotizacionEfectiva, tramite.pct_variacion_cambio) })
  const totalGeneral = grandTotalPesos(items, aniosOrdenados, cotizacionEfectiva, tramite.pct_variacion_cambio)

  // ── Bullets del cuerpo ─────────────────────────────────────────────
  const bullets = []
  bullets.push(`Estudiar por parte de la asesoría contable de esta División, la necesidad solicitada por el HCFFAA, ${estudiarFrase}`)
  bullets.push(`Dicho expediente responde a un costo total aproximado de $U ${fmtPesos(totalGeneral)} (${montoEnLetras(totalGeneral, "pesos uruguayos")}) IVA ${ivaTexto}.`)
  aniosOrdenados.forEach(a => {
    const letra = multiAnio ? ` ${letraPorAnio[a]}` : ""
    bullets.push(`APG ${tramite.numero_apg || ""}${letra} -- ${a} - $U ${fmtPesos(montoPorAnio[a])} (${montoEnLetras(montoPorAnio[a], "pesos uruguayos")}) IVA ${ivaTexto}.`)
  })
  if (tipoTramite === "INICIO" && tramite.plazo_ejecucion_meses) {
    bullets.push(`Con un plazo de ejecución por un período de ${tramite.plazo_ejecucion_meses} (${numeroALetras(tramite.plazo_ejecucion_meses)}) meses y comenzará a computarse desde la fecha de emisión de la primera orden de compra. No obstante, si al primer día del mes siguiente de cumplidos 3 (tres) meses desde la notificación de la adjudicación no se hubiera emitido ninguna orden de compra, el plazo comenzará automáticamente en dicha fecha.`)
  }
  bullets.push(`Cabe destacar que lo solicitado se descontará del rubro ${tramite.memo_rubro || ""}.`)

  const bulletsParagraphs = bullets.map(b => new Paragraph({
    bullet: { level: 0 }, spacing: { after: 150 }, alignment: AlignmentType.JUSTIFIED,
    children: [new TextRun({ text: b, size: 20 })],
  }))

  // ── Tabla "Solicitud de Autorización para Gastar" (una por año) ────
  const filaSeccion = (label) => new TableRow({ children: [
    new TableCell({ columnSpan: 5, borders: CELL_BORDERS, shading: { type: ShadingType.CLEAR, color: "auto", fill: "F0F0F0" },
      children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 18 })] })] }),
  ]})

  const filaCampo = (label, valor) => new TableRow({ children: [
    new TableCell({ borders: CELL_BORDERS, children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 16 })] })] }),
    new TableCell({ columnSpan: 4, borders: CELL_BORDERS, children: [new Paragraph({ children: [new TextRun({ text: String(valor ?? ""), size: 16 })] })] }),
  ]})

  const tablaPorAnio = (anio) => {
    const letra = multiAnio ? ` ${letraPorAnio[anio]}` : ""
    const montoTxt = `$U ${fmtPesos(montoPorAnio[anio])} (${montoEnLetras(montoPorAnio[anio], "pesos uruguayos")}) IVA ${ivaTexto}.`
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        filaSeccion("DIVISIÓN COMERCIAL"),
        filaSeccion("SOLICITUD DE AUTORIZACIÓN PARA GASTAR"),
        new TableRow({ children: [
          new TableCell({ borders: CELL_BORDERS, children: [new Paragraph({ children: [new TextRun({ text: "FECHA", bold: true, size: 16 })] })] }),
          td(dia, { center: true }), td(fecha.getMonth() + 1, { center: true }), td(anioActual, { center: true }),
          new TableCell({ borders: CELL_BORDERS, children: [new Paragraph({ children: [
            new TextRun({ text: "MEMO Nº  ", bold: true, size: 16 }), new TextRun({ text: `${tramite.numero_apg || ""}${letra}`, size: 16 }),
          ] })] }),
        ]}),
        filaCampo("TIPO DE PROCEDIMIENTO", tipoProcedimientoCelda),
        filaCampo("BIEN O SERVICIO A ADQUIRIR", `"${tramite.concepto || ""}"`),
        filaCampo("MONTO PREVISTO O ESTIMADO HASTA", montoTxt),
        filaCampo("PERIODO CUBIERTO", anio),
        filaCampo("RUBRO", tramite.memo_rubro || ""),
        filaCampo("SUB-RUBRO (DESCRIPCIÓN)", tramite.memo_rubro || ""),
        filaCampo("FINANCIACIÓN", tramite.memo_financiacion || "Fondos de terceros"),
      ],
    })
  }

  const tablas = aniosOrdenados.flatMap(a => [tablaPorAnio(a), new Paragraph({ text: "", spacing: { before: 200 } })])

  const doc = new Document({ sections: [{ children: [
    new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 100 }, children: [new TextRun({ text: `MEMO Nº${numeroMemoTitulo}/DIVCOM/${anioActual}.`, bold: true, size: 20 })] }),
    new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: `Montevideo, ${dia} de ${mesNombre} de ${anioActual}.`, size: 20 })] }),
    new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: "DE: Jefe de la División Comercial", size: 20 })] }),
    new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: `PARA: ${tramite.destinatario_memo || "Jefe de la División Planeamiento y Presupuesto"}`, size: 20 })] }),
    new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "ASUNTO: Solicitud de autorización para gastar", size: 20 })] }),
    parrafo(`A efectos de su consideración, y ${verboFrase}, remito a usted "${tramite.concepto || ""}" solicitado por División Comercial.`, { justify: true }),
    ...(tramite.memo_motivo ? [parrafo(tramite.memo_motivo, { justify: true })] : []),
    new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "Al respecto se procedió a:", size: 20 })] }),
    ...bulletsParagraphs,
    new Paragraph({ text: "", spacing: { before: 300 } }),
    new Paragraph({ children: [new TextRun({ text: "Saluda a usted atentamente,", size: 20 })] }),
    new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "El Jefe División Comercial", size: 20 })] }),
    new Paragraph({ children: [new TextRun({ text: "Coronel", size: 20 })] }),
    new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: (tramite.jefe_divcom_nombre || "").replace(/^Cnel\.\s*/, "") || "Leonardo Artave", size: 20 })] }),
    ...tablas,
    expedienteFooter(tramite),
  ]}]})

  await descargar(doc, `Memo_Autorizacion_Gastar_${(tramite.procedimiento || "doc").replace(/[^\w-]/g, "_")}.docx`)
}
