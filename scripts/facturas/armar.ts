// Arma facturas ficticias coherentes (o con un error a propósito) a partir de los proveedores, con un azar con semilla:
// la misma semilla da siempre las mismas facturas, así el set dorado se puede regenerar idéntico.
import type { Factura, Item } from "../../src/factura/esquema";
import { importeRenglon, redondear } from "../../src/factura/montos";
import type { Proveedor } from "./proveedores";

/** mulberry32: azar reproducible. */
export function crearAzar(semilla: number) {
  let s = semilla >>> 0;
  const azar = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    azar,
    entero: (min: number, max: number) => min + Math.floor(azar() * (max - min + 1)),
    elegir: <T>(xs: readonly T[]) => xs[Math.floor(azar() * xs.length)],
    chance: (p: number) => azar() < p,
  };
}
export type Azar = ReturnType<typeof crearAzar>;

const suma = (ns: number[]) => redondear(ns.reduce((t, n) => t + n, 0));

/** Totales que cierran: neto, IVA por alícuota, percepciones y total. */
export function cerrarTotales(tipo: "A" | "B", items: Item[], percepcionesPct: { concepto: string; pct: number }[]): Pick<Factura, "netoGravado" | "iva" | "percepciones" | "total"> {
  if (tipo === "B") {
    const total = suma(items.map((i) => i.importe));
    return { netoGravado: null, iva: [], percepciones: [], total };
  }
  const neto = suma(items.map((i) => i.importe));
  const alicuotas = [...new Set(items.map((i) => i.alicuotaIva!))].sort((a, b) => a - b);
  const iva = alicuotas.map((a) => {
    const base = suma(items.filter((i) => i.alicuotaIva === a).map((i) => i.importe));
    return { alicuota: a, base, importe: redondear((base * a) / 100) };
  });
  const percepciones = percepcionesPct.map((p) => ({ concepto: p.concepto, importe: redondear((neto * p.pct) / 100) }));
  const total = suma([neto, ...iva.map((v) => v.importe), ...percepciones.map((p) => p.importe)]);
  return { netoGravado: neto, iva, percepciones, total };
}

export interface Pedido {
  proveedor: Proveedor;
  tipo: "A" | "B";
  numero: number;
  fecha: string;
  renglones: number;
  conBonificacion: boolean;
  conPercepciones: boolean;
}

/** Una factura que cierra. En la B, el precio de lista ya incluye el IVA. */
export function armarFactura(p: Pedido, az: Azar): Factura {
  const elegidos = [...p.proveedor.productos].sort(() => az.azar() - 0.5);
  const items: Item[] = Array.from({ length: p.renglones }, (_, i) => {
    const prod = elegidos[i % elegidos.length];
    // Con más renglones que productos se repite un producto en otra presentación/lote, como en las facturas reales.
    const descripcion = i < elegidos.length ? prod.descripcion : `${prod.descripcion} (lote ${az.entero(100, 999)})`;
    const cantidad = prod.porPeso ? redondear(az.entero(50, 4800) / 10) : az.entero(1, 40);
    const variacion = 1 + (az.entero(-40, 40) / 1000);
    const lista = redondear(prod.precio * variacion);
    const precioUnitario = p.tipo === "B" ? redondear(lista * (1 + prod.alicuota / 100)) : lista;
    const bonificacionPct = p.conBonificacion && az.chance(0.45) ? az.elegir([2, 3, 5, 7.5, 10, 12, 15]) : 0;
    return {
      codigo: prod.codigo,
      descripcion,
      cantidad,
      precioUnitario,
      bonificacionPct,
      importe: importeRenglon(cantidad, precioUnitario, bonificacionPct),
      alicuotaIva: p.tipo === "A" ? prod.alicuota : null,
    };
  });
  return {
    tipo: p.tipo,
    proveedor: { razonSocial: p.proveedor.razonSocial, cuit: p.proveedor.cuit },
    puntoVenta: p.proveedor.puntoVenta,
    numero: p.numero,
    fecha: p.fecha,
    items,
    ...cerrarTotales(p.tipo, items, p.tipo === "A" && p.conPercepciones ? p.proveedor.percepciones : []),
  };
}
