// Validadores puros de una factura: cada uno devuelve los problemas que encuentra, con el valor impreso y el que debería
// ser, para que la bandeja de revisión muestre el motivo ("la suma da $ 12.345,00"). Nada acá llama a la IA ni a la red.
import { claveFactura, type Factura } from "@/factura/esquema";
import { aCentavos, dePesos, importeRenglon, pesos, redondear } from "@/factura/montos";
import { validarCuit } from "./cuit";

export type CodigoProblema = "cuit_invalido" | "fecha_invalida" | "item_importe" | "neto_no_cierra" | "base_iva_no_cierra" | "iva_incorrecto" | "total_no_cierra" | "duplicada" | "tipo_inconsistente";

export interface Problema {
  codigo: CodigoProblema;
  /** Campo afectado, en la forma de la factura ("total", "items[3].importe", "iva[21]"). */
  campo: string;
  detalle: string;
  esperado?: number;
  encontrado?: number;
}

/** Tolerancias en centavos: un centavo por redondeo en cada renglón; dos en el total. */
const TOL_RENGLON = 1;
const TOL_TOTAL = 2;

const difiere = (a: number, b: number, tolCentavos: number) => Math.abs(aCentavos(a) - aCentavos(b)) > tolCentavos;
const suma = (ns: number[]) => dePesos(ns.reduce((t, n) => t + aCentavos(n), 0));

export function validarProveedor(f: Factura): Problema[] {
  const r = validarCuit(f.proveedor.cuit);
  return r.ok ? [] : [{ codigo: "cuit_invalido", campo: "proveedor.cuit", detalle: `El CUIT ${f.proveedor.cuit} no es válido (${r.motivo === "verificador" ? "dígito verificador" : r.motivo})` }];
}

export function validarFecha(f: Factura): Problema[] {
  const d = new Date(`${f.fecha}T12:00:00Z`);
  const valida = !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f.fecha;
  return valida ? [] : [{ codigo: "fecha_invalida", campo: "fecha", detalle: `La fecha ${f.fecha} no existe` }];
}

/** Cada renglón: cantidad × precio unitario − bonificación = importe. */
export function validarItems(f: Factura): Problema[] {
  return f.items.flatMap((it, i) => {
    const esperado = importeRenglon(it.cantidad, it.precioUnitario, it.bonificacionPct);
    return difiere(esperado, it.importe, TOL_RENGLON) ? [{ codigo: "item_importe" as const, campo: `items[${i}].importe`, detalle: `Renglón ${i + 1}: ${it.cantidad} × ${pesos(it.precioUnitario)}${it.bonificacionPct ? ` − ${it.bonificacionPct} %` : ""} da ${pesos(esperado)}, no ${pesos(it.importe)}`, esperado, encontrado: it.importe }] : [];
  });
}

/** Factura A: neto = suma de renglones; base de cada alícuota = suma de sus renglones; IVA = base × alícuota. */
export function validarIva(f: Factura): Problema[] {
  if (f.tipo === "B") {
    return f.netoGravado !== null || f.iva.length || f.items.some((i) => i.alicuotaIva !== null) ? [{ codigo: "tipo_inconsistente", campo: "tipo", detalle: "Una factura B no discrimina IVA" }] : [];
  }
  const p: Problema[] = [];
  const neto = suma(f.items.map((i) => i.importe));
  if (f.netoGravado === null || difiere(neto, f.netoGravado, TOL_RENGLON * f.items.length)) {
    p.push({ codigo: "neto_no_cierra", campo: "netoGravado", detalle: `La suma de los renglones da ${pesos(neto)}, no ${f.netoGravado === null ? "(vacío)" : pesos(f.netoGravado)}`, esperado: neto, encontrado: f.netoGravado ?? undefined });
  }
  const alicuotas = new Set([...f.items.map((i) => i.alicuotaIva ?? -1), ...f.iva.map((v) => v.alicuota)]);
  for (const a of [...alicuotas].sort((x, y) => x - y)) {
    const renglones = f.items.filter((i) => i.alicuotaIva === a);
    const linea = f.iva.find((v) => v.alicuota === a);
    const base = suma(renglones.map((i) => i.importe));
    if (!linea || difiere(base, linea.base, TOL_RENGLON * Math.max(1, renglones.length))) {
      p.push({ codigo: "base_iva_no_cierra", campo: `iva[${a}].base`, detalle: `La base del IVA ${a} % debería ser ${pesos(base)}, no ${linea ? pesos(linea.base) : "(falta)"}`, esperado: base, encontrado: linea?.base });
      continue;
    }
    const iva = redondear((linea.base * a) / 100);
    if (difiere(iva, linea.importe, TOL_RENGLON)) {
      p.push({ codigo: "iva_incorrecto", campo: `iva[${a}].importe`, detalle: `El IVA ${a} % sobre ${pesos(linea.base)} da ${pesos(iva)}, no ${pesos(linea.importe)}`, esperado: iva, encontrado: linea.importe });
    }
  }
  return p;
}

/** A: neto + IVA + percepciones = total. B: renglones (con IVA incluido) + percepciones = total. */
export function validarTotal(f: Factura): Problema[] {
  const percepciones = f.percepciones.map((x) => x.importe);
  const esperado = f.tipo === "A" ? suma([f.netoGravado ?? suma(f.items.map((i) => i.importe)), ...f.iva.map((v) => v.importe), ...percepciones]) : suma([...f.items.map((i) => i.importe), ...percepciones]);
  return difiere(esperado, f.total, TOL_TOTAL) ? [{ codigo: "total_no_cierra", campo: "total", detalle: `La suma da ${pesos(esperado)}, no ${pesos(f.total)}`, esperado, encontrado: f.total }] : [];
}

/** Mismo proveedor, tipo, punto de venta y número que una factura ya cargada. */
export function validarDuplicado(f: Factura, cargadas: ReadonlySet<string>): Problema[] {
  return cargadas.has(claveFactura(f)) ? [{ codigo: "duplicada", campo: "numero", detalle: `La factura ${f.tipo} ${String(f.puntoVenta).padStart(4, "0")}-${String(f.numero).padStart(8, "0")} de ${f.proveedor.razonSocial} ya estaba cargada` }] : [];
}

export interface ResultadoValidacion {
  ok: boolean;
  problemas: Problema[];
}

/** Todos los validadores. `cargadas` son las claves de las facturas ya aceptadas (para detectar duplicados). */
export function validarFactura(f: Factura, cargadas: ReadonlySet<string> = new Set()): ResultadoValidacion {
  const problemas = [...validarProveedor(f), ...validarFecha(f), ...validarItems(f), ...validarIva(f), ...validarTotal(f), ...validarDuplicado(f, cargadas)];
  return { ok: problemas.length === 0, problemas };
}
