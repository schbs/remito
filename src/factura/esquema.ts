// Forma de una factura de proveedor (Argentina, tipo A o B), la misma que devuelve la extracción con IA (P4-G2) y que
// guarda el set dorado. Los importes van en pesos con 2 decimales; la aritmética se valida en src/validacion/.
import { z } from "zod";

/** Alícuotas de IVA que aparecen en las facturas de la distribuidora. */
export const ALICUOTAS = [10.5, 21, 27] as const;

export const itemSchema = z.object({
  codigo: z.string().max(30).nullable(),
  descripcion: z.string().min(1).max(200),
  cantidad: z.number().positive(),
  precioUnitario: z.number().nonnegative(),
  /** Bonificación del renglón, en porcentaje (0 si no hay). */
  bonificacionPct: z.number().min(0).max(100),
  /** Importe del renglón: en la A sin IVA (neto); en la B con IVA incluido. */
  importe: z.number(),
  /** Solo en la A; en la B el IVA no se discrimina. */
  alicuotaIva: z.number().nullable(),
});

export const ivaSchema = z.object({
  alicuota: z.number(),
  base: z.number(),
  importe: z.number(),
});

export const percepcionSchema = z.object({
  concepto: z.string().min(1).max(80),
  importe: z.number().nonnegative(),
});

export const facturaSchema = z.object({
  tipo: z.enum(["A", "B"]),
  proveedor: z.object({
    razonSocial: z.string().min(2).max(120),
    cuit: z.string().regex(/^\d{2}-\d{8}-\d$/, "CUIT con formato NN-NNNNNNNN-N"),
  }),
  puntoVenta: z.number().int().min(1).max(99999),
  numero: z.number().int().min(1).max(99999999),
  /** AAAA-MM-DD. */
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(itemSchema).min(1).max(60),
  /** Solo en la A: suma de los importes netos. En la B, null. */
  netoGravado: z.number().nullable(),
  /** Solo en la A: un renglón por alícuota. En la B, vacío. */
  iva: z.array(ivaSchema),
  percepciones: z.array(percepcionSchema),
  total: z.number().positive(),
});

export type Item = z.infer<typeof itemSchema>;
export type Factura = z.infer<typeof facturaSchema>;

/** Clave de duplicado: el mismo comprobante del mismo proveedor. */
export const claveFactura = (f: Pick<Factura, "proveedor" | "tipo" | "puntoVenta" | "numero">) => `${f.proveedor.cuit}|${f.tipo}|${f.puntoVenta}|${f.numero}`;

/** "0004-00012345", como se imprime en el comprobante. */
export const numeroComprobante = (f: Pick<Factura, "puntoVenta" | "numero">) => `${String(f.puntoVenta).padStart(4, "0")}-${String(f.numero).padStart(8, "0")}`;
