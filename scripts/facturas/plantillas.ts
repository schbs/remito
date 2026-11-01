// HTML de cada diseño de factura (uno por proveedor). Todo ficticio: CUIT y CAE marcados "FICTICIO" y la leyenda
// "Comprobante ficticio de demostración — no válido como factura" en el pie. Fuentes del sistema: nada sale a la red.
import { numeroComprobante, type Factura } from "../../src/factura/esquema";
import { formatoAR } from "../../src/factura/montos";
import { RECEPTOR, type Diseno, type Proveedor } from "./proveedores";

const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const fechaAR = (iso: string) => iso.split("-").reverse().join("/");
const cant = (n: number) => (Number.isInteger(n) ? String(n) : formatoAR(n, 1));
const pct = (n: number) => (n ? `${formatoAR(n, Number.isInteger(n) ? 0 : 1)} %` : "");
const LEYENDA = "Comprobante ficticio de demostración — no válido como factura. Datos inventados.";

interface Contexto {
  f: Factura;
  p: Proveedor;
  /** Copia que el proveedor reenvía (la factura duplicada). */
  reenvio?: boolean;
}

function filas(f: Factura, conAlicuota: boolean, conCodigo = true) {
  return f.items
    .map(
      (it) => `<tr>${conCodigo ? `<td>${esc(it.codigo ?? "")}</td>` : ""}<td class="desc">${esc(it.descripcion)}</td><td class="n">${cant(it.cantidad)}</td><td class="n">${formatoAR(it.precioUnitario)}</td><td class="n">${pct(it.bonificacionPct)}</td>${conAlicuota ? `<td class="n">${pct(it.alicuotaIva ?? 0)}</td>` : ""}<td class="n">${formatoAR(it.importe)}</td></tr>`,
    )
    .join("");
}

function cabeceraTabla(conAlicuota: boolean, conCodigo = true, nombres = { codigo: "Código", desc: "Producto / Servicio", cant: "Cant.", precio: "Precio unit.", bonif: "% Bonif.", iva: "Alíc. IVA", importe: "Importe" }) {
  return `<tr>${conCodigo ? `<th>${nombres.codigo}</th>` : ""}<th class="desc">${nombres.desc}</th><th class="n">${nombres.cant}</th><th class="n">${nombres.precio}</th><th class="n">${nombres.bonif}</th>${conAlicuota ? `<th class="n">${nombres.iva}</th>` : ""}<th class="n">${nombres.importe}</th></tr>`;
}

function totales(f: Factura, etiquetas = { neto: "Importe neto gravado", subtotal: "Subtotal", total: "Importe total" }) {
  const lineas: [string, number][] = [];
  if (f.tipo === "A") {
    lineas.push([etiquetas.neto, f.netoGravado!]);
    for (const v of f.iva) lineas.push([`IVA ${formatoAR(v.alicuota, Number.isInteger(v.alicuota) ? 0 : 1)} %`, v.importe]);
    for (const p of f.percepciones) lineas.push([p.concepto, p.importe]);
  } else {
    lineas.push([etiquetas.subtotal, f.items.reduce((t, i) => t + i.importe, 0)]);
  }
  return `${lineas.map(([k, v]) => `<tr><td>${esc(k)}: $</td><td class="n">${formatoAR(v)}</td></tr>`).join("")}<tr class="total"><td>${etiquetas.total}: $</td><td class="n">${formatoAR(f.total)}</td></tr>`;
}

const receptor = (f: Factura) => `<div><b>Señor(es):</b> ${esc(RECEPTOR.razonSocial)}</div><div><b>CUIT:</b> ${RECEPTOR.cuit} (FICTICIO) · <b>Condición frente al IVA:</b> ${RECEPTOR.condicionIva}</div><div><b>Domicilio:</b> ${esc(RECEPTOR.domicilio)}</div><div><b>Condición de venta:</b> ${f.tipo === "A" ? "Cuenta corriente 30 días" : "Contado"}</div>`;

const cae = (f: Factura) => `CAE N°: 0000${String(f.numero).padStart(10, "0")} (FICTICIO) · Vto. CAE: ${fechaAR(f.fecha)}`;

function documento(css: string, cuerpo: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0}body{width:210mm;min-height:297mm;padding:12mm 13mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}table{border-collapse:collapse;width:100%}.n{text-align:right;white-space:nowrap}${css}</style></head><body>${cuerpo}</body></html>`;
}

const DISENOS: Record<Diseno, (c: Contexto) => string> = {
  // Lácteos: el formato "de manual", con la letra en un recuadro al medio y doble columna arriba.
  clasico: ({ f, p, reenvio }) =>
    documento(
      `body{font:10.5pt Arial,Helvetica,sans-serif;color:#111}.top{display:grid;grid-template-columns:1fr 70px 1fr;border:1.5px solid #111}.top>div{padding:8px 10px}.letra{border-left:1.5px solid #111;border-right:1.5px solid #111;text-align:center}.letra b{display:block;font-size:34pt;line-height:1}.rz{font-size:15pt;font-weight:bold}.rec{border:1.5px solid #111;border-top:0;padding:8px 10px;line-height:1.5}table.it{margin-top:10px}table.it th{background:#ddd;border:1px solid #111;padding:4px;font-size:9pt}table.it td{border-left:1px solid #111;border-right:1px solid #111;padding:3px 4px;font-size:9.5pt}table.it tr:last-child td{border-bottom:1px solid #111}.tot{width:55%;margin:12px 0 0 auto;border:1.5px solid #111}.tot td{padding:3px 8px}.tot .total td{font-weight:bold;font-size:12pt;border-top:1.5px solid #111}.pie{margin-top:16px;font-size:8.5pt;color:#333;border-top:1px solid #999;padding-top:6px}`,
      `<div class="top"><div><div class="rz">${esc(p.razonSocial)}</div><div>${esc(p.domicilio)}</div><div>IVA Responsable Inscripto</div></div><div class="letra"><b>${f.tipo}</b>Cód. ${f.tipo === "A" ? "01" : "06"}</div><div><div style="font-size:14pt;font-weight:bold">FACTURA${reenvio ? " — REENVÍO" : ""}</div><div>Punto de venta y número: <b>${numeroComprobante(f)}</b></div><div>Fecha de emisión: <b>${fechaAR(f.fecha)}</b></div><div>CUIT: ${p.cuit} (FICTICIO)</div><div>Ingresos Brutos: ${esc(p.iibb)}</div><div>Inicio de actividades: ${p.inicioActividades}</div></div></div><div class="rec">${receptor(f)}</div><table class="it">${cabeceraTabla(f.tipo === "A")}${filas(f, f.tipo === "A")}</table><table class="tot">${totales(f)}</table><div class="pie">${cae(f)}<br>${LEYENDA}</div>`,
    ),

  // Bodega: banda de color arriba, tipografía serif y los totales en una franja.
  banda: ({ f, p, reenvio }) =>
    documento(
      `body{font:10pt Georgia,'Times New Roman',serif;color:#2a1a1f}.banda{background:#5b1f2e;color:#f6efe6;padding:14px 16px;display:flex;justify-content:space-between;align-items:center}.banda .rz{font-size:18pt;letter-spacing:.5px}.letra{border:2px solid #f6efe6;width:58px;height:58px;display:grid;place-items:center;font-size:28pt}.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;margin:12px 0;font-size:9.5pt}.rec{background:#f4ece6;padding:8px 12px;line-height:1.5;font-size:9.5pt}table.it{margin-top:12px}table.it th{color:#5b1f2e;border-bottom:2px solid #5b1f2e;padding:5px 4px;font-size:9pt;text-transform:uppercase;letter-spacing:.5px}table.it td{border-bottom:1px solid #e3d6cf;padding:4px;font-size:9.5pt}.tot{width:60%;margin:14px 0 0 auto}.tot td{padding:3px 6px}.tot .total td{background:#5b1f2e;color:#f6efe6;font-size:12.5pt;padding:7px 6px}.pie{margin-top:18px;font-size:8.5pt;color:#7a6066;font-style:italic}`,
      `<div class="banda"><div><div class="rz">${esc(p.razonSocial)}</div><div style="font-size:9pt">${esc(p.domicilio)}</div></div><div style="text-align:right"><div style="font-size:13pt">FACTURA${reenvio ? " (REENVÍO)" : ""}</div><div>N° ${numeroComprobante(f)}</div></div><div class="letra">${f.tipo}</div></div><div class="meta"><div>Fecha: <b>${fechaAR(f.fecha)}</b></div><div>Código de comprobante: ${f.tipo === "A" ? "01" : "06"}</div><div>CUIT: ${p.cuit} (FICTICIO)</div><div>IIBB: ${esc(p.iibb)}</div></div><div class="rec">${receptor(f)}</div><table class="it">${cabeceraTabla(f.tipo === "A", true, { codigo: "Art.", desc: "Descripción", cant: "Cant.", precio: "P. unitario", bonif: "Bonif.", iva: "IVA", importe: "Subtotal" })}${filas(f, f.tipo === "A")}</table><table class="tot">${totales(f, { neto: "Neto gravado", subtotal: "Subtotal", total: "TOTAL" })}</table><div class="pie">${cae(f)} · ${LEYENDA}</div>`,
    ),

  // Molino: datos del proveedor a la izquierda y del comprobante a la derecha, tabla con cebra.
  "dos-columnas": ({ f, p, reenvio }) =>
    documento(
      `body{font:10pt Verdana,Geneva,sans-serif;color:#1d2a1d}.cab{display:grid;grid-template-columns:1.2fr 1fr;gap:16px;align-items:start}.logo{width:54px;height:54px;background:#2f5d3a;color:#fff;display:grid;place-items:center;font-weight:bold;font-size:15pt;margin-bottom:6px}.rz{font-size:14pt;font-weight:bold;color:#2f5d3a}.comp{border:1px solid #2f5d3a;padding:8px 10px}.comp .l{float:right;font-size:26pt;font-weight:bold;color:#2f5d3a;margin-left:8px}.rec{margin-top:12px;border-top:3px solid #2f5d3a;padding-top:8px;line-height:1.5;font-size:9pt}table.it{margin-top:10px}table.it th{background:#2f5d3a;color:#fff;padding:5px 4px;font-size:8.5pt}table.it tr:nth-child(even) td{background:#eef4ee}table.it td{padding:4px;font-size:9pt}.tot{width:50%;margin:12px 0 0 auto;border-top:2px solid #2f5d3a}.tot td{padding:3px 4px}.tot .total td{font-weight:bold;font-size:12pt;color:#2f5d3a}.pie{margin-top:16px;font-size:8pt;color:#555}`,
      `<div class="cab"><div><div class="logo">MTR</div><div class="rz">${esc(p.razonSocial)}</div><div>${esc(p.domicilio)}</div><div>CUIT ${p.cuit} (FICTICIO) · ${esc(p.iibb)}</div><div>Inicio de actividades: ${p.inicioActividades}</div></div><div class="comp"><span class="l">${f.tipo}</span><div><b>FACTURA</b>${reenvio ? " · reenvío" : ""}</div><div>Cód. ${f.tipo === "A" ? "01" : "06"}</div><div>Número: ${numeroComprobante(f)}</div><div>Fecha: ${fechaAR(f.fecha)}</div></div></div><div class="rec">${receptor(f)}</div><table class="it">${cabeceraTabla(f.tipo === "A")}${filas(f, f.tipo === "A")}</table><table class="tot">${totales(f)}</table><div class="pie">${cae(f)}<br>${LEYENDA}</div>`,
    ),

  // Limpieza: compacto, letra chica y sin códigos de producto.
  compacto: ({ f, p, reenvio }) =>
    documento(
      `body{font:9pt Tahoma,Verdana,sans-serif;color:#0f2b40;padding:9mm 10mm}.cab{display:flex;justify-content:space-between;border-bottom:2px solid #1b6fa8;padding-bottom:6px}.rz{font-size:13pt;font-weight:bold;color:#1b6fa8}.l{border:2px solid #1b6fa8;padding:2px 10px;font-size:20pt;font-weight:bold;color:#1b6fa8}.rec{margin:8px 0;font-size:8.5pt;line-height:1.4}table.it th{border-bottom:1px solid #1b6fa8;text-align:left;padding:3px;font-size:8.5pt;color:#1b6fa8}table.it td{padding:2px 3px;font-size:8.5pt;border-bottom:1px dotted #9cc0da}.tot{width:45%;margin:8px 0 0 auto}.tot td{padding:2px 3px}.tot .total td{font-weight:bold;font-size:11pt;border-top:2px solid #1b6fa8}.pie{margin-top:12px;font-size:7.5pt;color:#46606f}`,
      `<div class="cab"><div><div class="rz">${esc(p.razonSocial)}</div><div>${esc(p.domicilio)} · CUIT ${p.cuit} (FICTICIO)</div><div>${esc(p.iibb)} · Inicio act. ${p.inicioActividades}</div></div><div style="text-align:right"><span class="l">${f.tipo}</span><div>FACTURA ${f.tipo}${reenvio ? " (reenviada)" : ""} N° ${numeroComprobante(f)}</div><div>Emitida el ${fechaAR(f.fecha)}</div></div></div><div class="rec">${receptor(f)}</div><table class="it">${cabeceraTabla(f.tipo === "A", false, { codigo: "", desc: "Detalle", cant: "Cant", precio: "Unitario", bonif: "Dto.", iva: "IVA", importe: "Total renglón" })}${filas(f, f.tipo === "A", false)}</table><table class="tot">${totales(f, { neto: "Neto", subtotal: "Subtotal", total: "TOTAL A PAGAR" })}</table><div class="pie">${cae(f)} — ${LEYENDA}</div>`,
    ),

  // Frigorífico: el "sistema viejo", monoespaciado y en mayúsculas.
  "sistema-viejo": ({ f, p, reenvio }) =>
    documento(
      `body{font:9.5pt 'Courier New',Courier,monospace;color:#000;text-transform:uppercase}.cab{border:1px dashed #000;padding:8px}.l{font-size:22pt;font-weight:bold}.rec{border:1px dashed #000;border-top:0;padding:8px;line-height:1.4}table.it{margin-top:8px}table.it th{border-top:1px dashed #000;border-bottom:1px dashed #000;padding:3px;font-weight:normal}table.it td{padding:2px 3px}.tot{width:60%;margin:8px 0 0 auto;border-top:1px dashed #000}.tot td{padding:2px 3px}.tot .total td{font-weight:bold;border-top:1px dashed #000}.pie{margin-top:12px;font-size:8pt;text-transform:none}`,
      `<div class="cab"><span class="l">[${f.tipo}]</span> ${esc(p.razonSocial)} — FACTURA ${f.tipo}${reenvio ? " *** REENVIO ***" : ""}<br>${esc(p.domicilio)}<br>CUIT: ${p.cuit} (FICTICIO)   IIBB: ${esc(p.iibb)}<br>COMPROBANTE: ${numeroComprobante(f)}   FECHA: ${fechaAR(f.fecha)}   COD: ${f.tipo === "A" ? "01" : "06"}</div><div class="rec">${receptor(f)}</div><table class="it">${cabeceraTabla(f.tipo === "A", true, { codigo: "COD", desc: "DESCRIPCION", cant: "CANT/KG", precio: "PRECIO", bonif: "DTO", iva: "IVA", importe: "IMPORTE" })}${filas(f, f.tipo === "A")}</table><table class="tot">${totales(f, { neto: "NETO GRAVADO", subtotal: "SUBTOTAL", total: "TOTAL" })}</table><div class="pie">${cae(f)}<br>${LEYENDA}</div>`,
    ),

  // Bebidas: todo en recuadros redondeados y los totales en una caja aparte a la derecha.
  recuadro: ({ f, p, reenvio }) =>
    documento(
      `body{font:10pt 'Trebuchet MS',Arial,sans-serif;color:#1a2433}.caja{border:1.5px solid #c2410c;border-radius:10px;padding:10px 12px}.cab{display:grid;grid-template-columns:1fr auto;gap:12px}.rz{font-size:15pt;font-weight:bold;color:#c2410c}.l{width:64px;height:64px;border-radius:50%;background:#c2410c;color:#fff;display:grid;place-items:center;font-size:28pt;font-weight:bold}.fila{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}table.it{margin-top:10px}table.it th{background:#fff1e8;color:#9a3412;padding:5px 4px;font-size:9pt}table.it td{padding:4px;font-size:9.5pt;border-bottom:1px solid #f1d5c4}.tot{width:52%;margin:12px 0 0 auto;border:1.5px solid #c2410c;border-radius:10px;overflow:hidden}.tot td{padding:4px 10px}.tot .total td{background:#c2410c;color:#fff;font-weight:bold;font-size:12.5pt}.pie{margin-top:16px;font-size:8.5pt;color:#6b7280}`,
      `<div class="caja cab"><div><div class="rz">${esc(p.razonSocial)}</div><div>${esc(p.domicilio)}</div><div>CUIT ${p.cuit} (FICTICIO) · IIBB ${esc(p.iibb)}</div></div><div class="l">${f.tipo}</div></div><div class="fila"><div class="caja"><b>FACTURA ${f.tipo}</b>${reenvio ? " · REENVÍO" : ""}<br>N.º ${numeroComprobante(f)}<br>Fecha ${fechaAR(f.fecha)} · Cód. ${f.tipo === "A" ? "01" : "06"}</div><div class="caja" style="font-size:9pt;line-height:1.45">${receptor(f)}</div></div><table class="it">${cabeceraTabla(f.tipo === "A")}${filas(f, f.tipo === "A")}</table><table class="tot">${totales(f, { neto: "Neto gravado", subtotal: "Subtotal", total: "Total" })}</table><div class="pie">${cae(f)}<br>${LEYENDA}</div>`,
    ),
};

export const htmlFactura = (f: Factura, p: Proveedor, reenvio = false) => DISENOS[p.diseno]({ f, p, reenvio });
