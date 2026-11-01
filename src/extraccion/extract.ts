// Extracción de una factura (PDF o imagen) con Gemini vision y salida estructurada. El modelo devuelve solo lo que está
// impreso; después se normaliza (CUIT, fechas, números con formato argentino) y se valida con Zod. Si no valida, se le
// pide una vez más con el error; si sigue sin validar, es una excepción (no se inventa nada para completar).
import { z } from "zod";
import { facturaSchema, type Factura } from "@/factura/esquema";
import { redondear } from "@/factura/montos";
import type { Adjunto, ModeloJson, Uso } from "@/ia/gemini";

/**
 * Lo que se le pide al modelo: la factura sin la base de cada alícuota (no está impresa; se calcula con los renglones).
 * Los campos opcionales del documento van como null, nunca omitidos.
 */
export const salidaModeloSchema = z.object({
  tipo: z.enum(["A", "B"]).describe("Letra del comprobante (recuadro grande arriba): A o B"),
  proveedor: z.object({
    razonSocial: z.string().describe("Razón social del EMISOR (quien vende), no del cliente Distribuidora Alto Valle"),
    cuit: z.string().describe("CUIT del EMISOR tal como figura, por ejemplo 30-71988001-7"),
  }),
  puntoVenta: z.number().int().describe("Primeros 4 dígitos del número de comprobante (0003-00005146 → 3)"),
  numero: z.number().int().describe("Últimos 8 dígitos del número de comprobante (0003-00005146 → 5146)"),
  fecha: z.string().describe("Fecha de emisión en formato AAAA-MM-DD"),
  items: z
    .array(
      z.object({
        codigo: z.string().nullable().describe("Código del artículo; null si la factura no muestra códigos"),
        descripcion: z.string(),
        cantidad: z.number().describe("Cantidad (puede tener decimales: 106,2 → 106.2)"),
        precioUnitario: z.number(),
        bonificacionPct: z.number().describe("Porcentaje de bonificación o descuento del renglón; 0 si está vacío"),
        importe: z.number().describe("Importe del renglón tal como está impreso"),
        alicuotaIva: z.number().nullable().describe("Alícuota de IVA del renglón (10.5, 21 o 27) en facturas A; null en facturas B"),
      }),
    )
    .describe("Todos los renglones, en el orden del documento"),
  netoGravado: z.number().nullable().describe("Importe neto gravado (solo factura A); null en B"),
  iva: z.array(z.object({ alicuota: z.number(), importe: z.number() })).describe("Una línea por cada IVA impreso en los totales (solo factura A); vacío en B"),
  percepciones: z.array(z.object({ concepto: z.string(), importe: z.number() })).describe("Percepciones e impuestos internos impresos en los totales; vacío si no hay"),
  total: z.number().describe("Importe total del comprobante"),
});

export type SalidaModelo = z.infer<typeof salidaModeloSchema>;

export const SISTEMA_EXTRACCION = `Extraés los datos de facturas de proveedores argentinos (comprobantes A y B) para cuentas a pagar.

Reglas:
1. Copiá SOLO lo que está impreso. No corrijas cuentas ni completes datos: si el total impreso no coincide con la suma, devolvé el total impreso.
2. Los números van como números JSON con punto decimal. En el documento el formato es argentino: "1.234.567,89" es 1234567.89 y "106,2" es 106.2.
3. El proveedor es quien EMITE la factura (arriba, con su CUIT e Ingresos Brutos). "Distribuidora Alto Valle" es el cliente: nunca va como proveedor.
4. Fecha de emisión en AAAA-MM-DD (en el documento está como DD/MM/AAAA).
5. Facturas A: cada renglón tiene su alícuota de IVA; los totales muestran el neto gravado, una línea de IVA por alícuota y, a veces, percepciones o impuestos internos. Facturas B: el precio ya incluye el IVA; alicuotaIva es null, netoGravado es null e iva es una lista vacía.
6. Si un renglón no tiene bonificación, bonificacionPct es 0.
7. Los datos son de una demostración (CUIT marcados "FICTICIO"): extraelos igual, tal como figuran.`;

const PEDIDO = "Extraé esta factura en el JSON pedido.";

// ---------- Normalización (lo que un modelo puede devolver con otro formato) ----------

/** "1.234,56" → 1234.56; "1234.56" → 1234.56; números quedan igual. */
export function numeroAR(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const s = v.replace(/[$\s]/g, "");
  if (!s) return v;
  const n = /,\d{1,3}$/.test(s) || (s.includes(",") && s.includes(".")) ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : v;
}

/** "30719880017" o "30 71988001 7" → "30-71988001-7". */
export function cuitConGuiones(v: string): string {
  const d = v.replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d[10]}` : v.trim();
}

/** "04/09/2026" → "2026-09-04"; ISO queda igual. */
export function fechaISO(v: string): string {
  const m = v.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : v.trim();
}

/** Lleva la salida del modelo a la forma de Factura: formatos, B sin IVA discriminado y la base de cada alícuota. */
export function normalizar(crudo: unknown): unknown {
  if (!crudo || typeof crudo !== "object") return crudo;
  const c = crudo as Record<string, unknown> & { proveedor?: Record<string, unknown>; items?: Record<string, unknown>[]; iva?: Record<string, unknown>[]; percepciones?: Record<string, unknown>[] };
  const tipo = typeof c.tipo === "string" ? c.tipo.trim().toUpperCase() : c.tipo;
  const items = (c.items ?? []).map((i) => ({
    ...i,
    cantidad: numeroAR(i.cantidad),
    precioUnitario: numeroAR(i.precioUnitario),
    bonificacionPct: numeroAR(i.bonificacionPct ?? 0) ?? 0,
    importe: numeroAR(i.importe),
    alicuotaIva: tipo === "B" ? null : numeroAR(i.alicuotaIva),
    codigo: typeof i.codigo === "string" && i.codigo.trim() ? i.codigo.trim() : null,
  }));
  const iva =
    tipo === "B"
      ? []
      : (c.iva ?? []).map((v) => {
          const alicuota = numeroAR(v.alicuota) as number;
          const base = redondear(items.filter((i) => i.alicuotaIva === alicuota).reduce((t, i) => t + (typeof i.importe === "number" ? i.importe : 0), 0));
          return { alicuota, base, importe: numeroAR(v.importe) };
        });
  return {
    ...c,
    tipo,
    proveedor: c.proveedor ? { razonSocial: String(c.proveedor.razonSocial ?? "").trim(), cuit: cuitConGuiones(String(c.proveedor.cuit ?? "")) } : c.proveedor,
    puntoVenta: numeroAR(c.puntoVenta),
    numero: numeroAR(c.numero),
    fecha: typeof c.fecha === "string" ? fechaISO(c.fecha) : c.fecha,
    items,
    netoGravado: tipo === "B" ? null : numeroAR(c.netoGravado),
    iva,
    percepciones: (c.percepciones ?? []).map((p) => ({ concepto: String(p.concepto ?? "").trim(), importe: numeroAR(p.importe) })),
    total: numeroAR(c.total),
  };
}

// ---------- Extracción ----------

export type ResultadoExtraccion =
  | { ok: true; factura: Factura; intentos: number; uso: Uso; ms: number }
  | { ok: false; error: string; intentos: number; uso: Uso; ms: number };

const SCHEMA_MODELO = z.toJSONSchema(salidaModeloSchema) as Record<string, unknown>;

export async function extraerFactura(adjunto: Adjunto, modelo: ModeloJson, intentos = 2): Promise<ResultadoExtraccion> {
  const uso: Uso = { entrada: 0, salida: 0 };
  let ms = 0;
  let ultimoError = "";
  for (let i = 1; i <= intentos; i++) {
    const usuario = i === 1 ? PEDIDO : `${PEDIDO}\nTu respuesta anterior no pasó la validación: ${ultimoError}. Revisá el documento y corregí solo eso.`;
    const r = await modelo.generar({ sistema: SISTEMA_EXTRACCION, usuario, schema: SCHEMA_MODELO, adjuntos: [adjunto] });
    uso.entrada += r.uso.entrada;
    uso.salida += r.uso.salida;
    ms += r.ms ?? 0;
    const p = facturaSchema.safeParse(normalizar(r.json));
    if (p.success) return { ok: true, factura: p.data, intentos: i, uso, ms };
    ultimoError = p.error.issues
      .slice(0, 4)
      .map((x) => `${x.path.join(".") || "(raíz)"}: ${x.message}`)
      .join("; ");
  }
  return { ok: false, error: `La extracción no validó después de ${intentos} intentos: ${ultimoError}`, intentos, uso, ms };
}

/** Tipo MIME por extensión del archivo. */
export function mimeDe(archivo: string): Adjunto["mimeType"] {
  if (/\.pdf$/i.test(archivo)) return "application/pdf";
  if (/\.png$/i.test(archivo)) return "image/png";
  if (/\.jpe?g$/i.test(archivo)) return "image/jpeg";
  throw new Error(`Formato no soportado: ${archivo}`);
}
