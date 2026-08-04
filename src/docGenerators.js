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
