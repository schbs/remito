// Genera el set de facturas FICTICIAS de Remito y su verdad (set dorado):
//   40 limpias (PDF) de 6 proveedores con diseños distintos, A y B, 1–15 renglones, bonificaciones y percepciones;
//   10 degradadas (imágenes: rotación, escaneo con ruido, foto) hechas a partir de 10 limpias;
//   5 con errores a propósito (2 totales mal sumados, 2 IVA incorrecto, 1 duplicada).
// Imprime con Brave (ya instalado) y degrada con sharp. Semilla fija: correrlo de nuevo da los mismos datos.
// Uso: npm run facturas
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "@playwright/test";
import sharp from "sharp";
import { claveFactura, facturaSchema, type Factura } from "../src/factura/esquema";
import { redondear } from "../src/factura/montos";
import { validarFactura, type CodigoProblema } from "../src/validacion/validadores";
import { armarFactura, cerrarTotales, crearAzar, type Pedido } from "./facturas/armar";
import { htmlFactura } from "./facturas/plantillas";
import { PROVEEDORES, type Proveedor } from "./facturas/proveedores";

const SEMILLA = 20261031;
const BRAVE = process.env.BRAVE_PATH ?? path.join(process.env.LOCALAPPDATA ?? "", "BraveSoftware/Brave-Browser/Application/brave.exe");
const DIR = path.join("data", "facturas");
const DIR_GOLDEN = path.join("data", "golden");

export type TipoDoc = "limpia" | "degradada" | "error";
export type Degradacion = "rotacion" | "escaneo" | "foto";

export interface Golden {
  id: string;
  archivo: string;
  tipo: TipoDoc;
  /** Para las degradadas y la duplicada: la factura limpia de la que salen. */
  origen?: string;
  degradacion?: { tipo: Degradacion; anguloGrados: number };
  /** Lo que está impreso en el documento (en las de error, con el error incluido). */
  factura: Factura;
  /** Problemas que la validación tiene que encontrar, cargando primero las limpias y después las de error (en orden de id). */
  erroresEsperados: CodigoProblema[];
  proveedorId: string;
}

const az = crearAzar(SEMILLA);
const porId = (id: string) => PROVEEDORES.find((p) => p.id === id)!;
const isoDia = (d: Date) => d.toISOString().slice(0, 10);

/** Fechas crecientes entre dos días (para que los números de comprobante sigan el orden). */
function fechas(n: number, desde: string, hasta: string): string[] {
  const a = Date.parse(`${desde}T12:00:00Z`);
  const b = Date.parse(`${hasta}T12:00:00Z`);
  return Array.from({ length: n }, () => isoDia(new Date(a + Math.floor(az.azar() * ((b - a) / 86400000 + 1)) * 86400000))).sort();
}

// 1) Plan de las 40 limpias: 7, 7, 7, 7, 6 y 6 por proveedor; renglones de 1 a 15 (con al menos una de 1 y una de 15).
const CANTIDADES = [7, 7, 7, 7, 6, 6];
const renglones = Array.from({ length: 40 }, (_, i) => (i === 0 ? 1 : i === 1 ? 15 : az.entero(1, 15)));
const proximoNumero = new Map<string, number>();
const pedidos: (Pedido & { orden: number })[] = [];
let k = 0;
PROVEEDORES.forEach((p, ip) => {
  let numero = az.entero(1200, 9800);
  const fs_ = fechas(CANTIDADES[ip], "2026-09-01", "2026-10-24");
  for (let i = 0; i < CANTIDADES[ip]; i++) {
    numero += az.entero(3, 41);
    // Al menos una B por proveedor; el resto según su proporción de facturas A.
    const tipo = i === 2 ? "B" : az.chance(p.proporcionA) ? "A" : "B";
    pedidos.push({ proveedor: p, tipo, numero, fecha: fs_[i], renglones: renglones[k++], conBonificacion: az.chance(0.45), conPercepciones: p.percepciones.length > 0 && az.chance(0.65), orden: 0 });
  }
  proximoNumero.set(p.id, numero);
});
pedidos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.proveedor.id.localeCompare(b.proveedor.id));

const goldens: Golden[] = [];
const limpias = pedidos.map((pd, i) => {
  const id = `F${String(i + 1).padStart(2, "0")}`;
  const factura = armarFactura(pd, az);
  goldens.push({ id, archivo: `data/facturas/limpias/${id}.pdf`, tipo: "limpia", factura, erroresEsperados: [], proveedorId: pd.proveedor.id });
  return { id, factura, proveedor: pd.proveedor };
});

// 2) Degradadas: 10 limpias elegidas de forma pareja (una de cada 4), con tres tipos de daño.
const DEGRADACIONES: Degradacion[] = ["rotacion", "escaneo", "foto", "rotacion", "escaneo", "foto", "rotacion", "foto", "escaneo", "foto"];
const degradadas = DEGRADACIONES.map((tipo, i) => {
  const base = limpias[i * 4 + 1];
  const id = `D${String(i + 1).padStart(2, "0")}`;
  const anguloGrados = redondear((az.chance(0.5) ? 1 : -1) * (tipo === "rotacion" ? 2 + az.azar() * 5 : tipo === "escaneo" ? 0.4 + az.azar() * 1.4 : 1 + az.azar() * 3));
  const archivo = `data/facturas/degradadas/${id}-${base.id}.${tipo === "foto" ? "jpg" : "png"}`;
  goldens.push({ id, archivo, tipo: "degradada", origen: base.id, degradacion: { tipo, anguloGrados }, factura: base.factura, erroresEsperados: [], proveedorId: base.proveedor.id });
  return { id, archivo, base, tipo, anguloGrados };
});

// 3) Con errores a propósito (fechas al final del lote, para procesarlas después de las limpias).
function nueva(p: Proveedor, tipo: "A" | "B", renglonesN: number, fecha: string, conPercepciones = true): Factura {
  const numero = proximoNumero.get(p.id)! + az.entero(3, 20);
  proximoNumero.set(p.id, numero);
  return armarFactura({ proveedor: p, tipo, numero, fecha, renglones: renglonesN, conBonificacion: true, conPercepciones }, az);
}
const errores: { id: string; factura: Factura; proveedor: Proveedor; esperados: CodigoProblema[]; reenvio?: boolean; origen?: string }[] = [];

// E01: el total suma $ 1.000 de más.
{
  const p = porId("piedra");
  const f = nueva(p, "A", 6, "2026-10-27");
  errores.push({ id: "E01", factura: { ...f, total: redondear(f.total + 1000) }, proveedor: p, esperados: ["total_no_cierra"] });
}
// E02: factura B con dos dígitos del total invertidos (error de tipeo).
{
  const p = porId("austral");
  const f = nueva(p, "B", 4, "2026-10-27");
  const t = f.total.toFixed(2);
  const entero = t.split(".")[0];
  const i = entero.length - 3;
  const invertido = `${entero.slice(0, i)}${entero[i + 1]}${entero[i]}${entero.slice(i + 2)}.${t.split(".")[1]}`;
  const total = Number(invertido) === f.total ? redondear(f.total + 90) : Number(invertido);
  errores.push({ id: "E02", factura: { ...f, total }, proveedor: p, esperados: ["total_no_cierra"] });
}
// E03: el IVA 21 % calculado al 19 %; el total suma con ese IVA (así el único error es el IVA).
{
  const p = porId("comahue");
  const f = nueva(p, "A", 5, "2026-10-28");
  const iva = f.iva.map((v) => (v.alicuota === 21 ? { ...v, importe: redondear((v.base * 19) / 100) } : v));
  errores.push({ id: "E03", factura: { ...f, iva, total: redondear(f.netoGravado! + iva.reduce((t, v) => t + v.importe, 0) + f.percepciones.reduce((t, x) => t + x.importe, 0)) }, proveedor: p, esperados: ["iva_incorrecto"] });
}
// E04: dos alícuotas y el IVA 10,5 % liquidado al 21 %; el total también suma con ese IVA.
{
  const p = porId("molino");
  let f = nueva(p, "A", 7, "2026-10-28", false);
  // Asegura las dos alícuotas: si salieron todos los renglones al 10,5 %, el último pasa a un producto al 21 %.
  if (!f.items.some((i) => i.alicuotaIva === 21)) {
    const prod = p.productos.find((x) => x.alicuota === 21)!;
    const items = [...f.items.slice(0, -1), { ...f.items.at(-1)!, codigo: prod.codigo, descripcion: prod.descripcion, alicuotaIva: 21 }];
    f = { ...f, items, ...cerrarTotales("A", items, []) };
  }
  const iva = f.iva.map((v) => (v.alicuota === 10.5 ? { ...v, importe: redondear((v.base * 21) / 100) } : v));
  errores.push({ id: "E04", factura: { ...f, iva, total: redondear(f.netoGravado! + iva.reduce((t, v) => t + v.importe, 0)) }, proveedor: p, esperados: ["iva_incorrecto"] });
}
// E05: el proveedor reenvía una factura que ya se había cargado (mismo número): duplicada.
{
  const base = limpias[17];
  errores.push({ id: "E05", factura: base.factura, proveedor: base.proveedor, esperados: ["duplicada"], reenvio: true, origen: base.id });
}
for (const e of errores) goldens.push({ id: e.id, archivo: `data/facturas/errores/${e.id}.pdf`, tipo: "error", origen: e.origen, factura: e.factura, erroresEsperados: e.esperados, proveedorId: e.proveedor.id });

// 4) Comprobación antes de escribir: forma válida, las limpias cierran y cada error se detecta (limpias y después errores).
const cargadas = new Set<string>();
for (const g of goldens.filter((x) => x.tipo !== "degradada")) {
  facturaSchema.parse(g.factura);
  const r = validarFactura(g.factura, cargadas);
  const codigos = [...new Set(r.problemas.map((p) => p.codigo))].sort();
  if (JSON.stringify(codigos) !== JSON.stringify([...g.erroresEsperados].sort())) throw new Error(`${g.id}: esperaba [${g.erroresEsperados}] y la validación dio [${codigos}] ${r.problemas.map((p) => p.detalle).join("; ")}`);
  if (r.ok) cargadas.add(claveFactura(g.factura));
}

// 5) Render: PDF para limpias y errores; imagen degradada para las otras.
async function ruido(ancho: number, alto: number, densidad: number, semilla: number): Promise<Buffer> {
  const a = crearAzar(semilla);
  const px = Buffer.alloc(ancho * alto, 255);
  for (let i = 0; i < px.length; i++) {
    const r = a.azar();
    if (r < densidad) px[i] = 70 + Math.floor(a.azar() * 120);
    else if (r < densidad * 8) px[i] = 215 + Math.floor(a.azar() * 35);
  }
  return sharp(px, { raw: { width: ancho, height: alto, channels: 1 } }).png().toBuffer();
}

async function degradar(png: Buffer, tipo: Degradacion, angulo: number, semilla: number): Promise<Buffer> {
  if (tipo === "rotacion") {
    const rotada = await sharp(png).rotate(angulo, { background: "#ffffff" }).png().toBuffer();
    const m = await sharp(rotada).metadata();
    return sharp(rotada).composite([{ input: await ruido(m.width!, m.height!, 0.002, semilla), blend: "multiply" }]).png().toBuffer();
  }
  if (tipo === "escaneo") {
    const base = await sharp(png).grayscale().rotate(angulo, { background: "#f4f4f4" }).blur(0.7).linear(1.12, -14).png().toBuffer();
    const m = await sharp(base).metadata();
    return sharp(base).composite([{ input: await ruido(m.width!, m.height!, 0.006, semilla), blend: "multiply" }]).grayscale().png({ compressionLevel: 9 }).toBuffer();
  }
  // Foto: inclinación, perspectiva leve (cizalla), luz despareja, desenfoque y JPEG comprimido.
  const inclinada = await sharp(png).rotate(angulo, { background: "#8a7f72" }).affine([[1, 0.035], [-0.02, 1]], { background: "#8a7f72" }).png().toBuffer();
  const m = await sharp(inclinada).metadata();
  const w = m.width!;
  const h = m.height!;
  const sombra = Buffer.from(`<svg width="${w}" height="${h}"><defs><radialGradient id="g" cx="38%" cy="32%" r="85%"><stop offset="0" stop-color="#ffffff"/><stop offset=".65" stop-color="#e9e3da"/><stop offset="1" stop-color="#9c9184"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
  return sharp(inclinada).composite([{ input: sombra, blend: "multiply" }, { input: await ruido(w, h, 0.0015, semilla), blend: "multiply" }]).modulate({ brightness: 0.96, saturation: 0.85 }).blur(0.9).jpeg({ quality: 58 }).toBuffer();
}

async function main() {
  for (const d of ["limpias", "degradadas", "errores"]) fs.rmSync(path.join(DIR, d), { recursive: true, force: true });
  fs.rmSync(DIR_GOLDEN, { recursive: true, force: true });
  for (const d of ["limpias", "degradadas", "errores"]) fs.mkdirSync(path.join(DIR, d), { recursive: true });
  fs.mkdirSync(DIR_GOLDEN, { recursive: true });

  const navegador: Browser = await chromium.launch({ executablePath: BRAVE });
  try {
    const pdf = await navegador.newPage();
    const fotos = await navegador.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1.5 });
    const imprimir = async (html: string, archivo: string) => {
      await pdf.setContent(html, { waitUntil: "load" });
      await pdf.pdf({ path: archivo, format: "A4", printBackground: true, preferCSSPageSize: true });
    };
    for (const l of limpias) await imprimir(htmlFactura(l.factura, l.proveedor), path.join(DIR, "limpias", `${l.id}.pdf`));
    for (const e of errores) await imprimir(htmlFactura(e.factura, e.proveedor, e.reenvio), path.join(DIR, "errores", `${e.id}.pdf`));
    for (const [i, d] of degradadas.entries()) {
      await fotos.setContent(htmlFactura(d.base.factura, d.base.proveedor), { waitUntil: "load" });
      const png = await fotos.screenshot({ fullPage: true, type: "png" });
      fs.writeFileSync(d.archivo, await degradar(png, d.tipo, d.anguloGrados, SEMILLA + i));
    }
  } finally {
    await navegador.close();
  }

  for (const g of goldens) fs.writeFileSync(path.join(DIR_GOLDEN, `${g.id}.json`), JSON.stringify(g, null, 2) + "\n");

  // Resumen.
  const contar = <T extends string>(xs: T[]) => Object.entries(xs.reduce<Record<string, number>>((t, x) => ((t[x] = (t[x] ?? 0) + 1), t), {})).map(([k2, v]) => `${k2} ${v}`).join(", ");
  const archivos = (d: string) => fs.readdirSync(path.join(DIR, d));
  const tam = (d: string) => archivos(d).reduce((t, a) => t + fs.statSync(path.join(DIR, d, a)).size, 0) / 1024;
  const l40 = goldens.filter((g) => g.tipo === "limpia");
  console.log(`Facturas FICTICIAS generadas (semilla ${SEMILLA}):`);
  console.log(`  limpias (PDF):     ${archivos("limpias").length} · ${Math.round(tam("limpias"))} KB · A ${l40.filter((g) => g.factura.tipo === "A").length} / B ${l40.filter((g) => g.factura.tipo === "B").length}`);
  console.log(`    por proveedor:   ${contar(l40.map((g) => g.proveedorId))}`);
  console.log(`    renglones:       de ${Math.min(...l40.map((g) => g.factura.items.length))} a ${Math.max(...l40.map((g) => g.factura.items.length))} · con bonificación ${l40.filter((g) => g.factura.items.some((i) => i.bonificacionPct)).length} · con percepciones ${l40.filter((g) => g.factura.percepciones.length).length} · con dos alícuotas ${l40.filter((g) => g.factura.iva.length > 1).length}`);
  console.log(`  degradadas (img):  ${archivos("degradadas").length} · ${Math.round(tam("degradadas"))} KB · ${contar(degradadas.map((d) => d.tipo))}`);
  console.log(`  con errores (PDF): ${archivos("errores").length} · ${errores.map((e) => `${e.id} ${e.esperados.join("+")}`).join(", ")}`);
  console.log(`  set dorado:        ${fs.readdirSync(DIR_GOLDEN).length} JSON en data/golden/ (comprobados con los validadores antes de escribir)`);
}

void main().catch((e) => {
  console.error("Falló:", e instanceof Error ? e.message : e);
  process.exit(1);
});
