// Pipeline de un documento: extraer → validar → clasificar. "ok" se puede cargar en la planilla; "excepcion" va a la
// bandeja de revisión humana con sus motivos (los problemas de validación o que la extracción no validó).
import { claveFactura, type Factura } from "@/factura/esquema";
import { costoUsd, type Adjunto, type ModeloJson, type Uso } from "@/ia/gemini";
import { validarFactura, type Problema } from "@/validacion/validadores";
import { extraerFactura } from "./extract";

export type Motivo = Problema | { codigo: "extraccion_invalida"; campo: "(documento)"; detalle: string };

export interface ResultadoDocumento {
  estado: "ok" | "excepcion";
  factura: Factura | null;
  motivos: Motivo[];
  intentos: number;
  uso: Uso;
  costoUsd: number;
  ms: number;
}

/**
 * Procesa un documento. `cargadas` son las claves de las facturas ya aceptadas: si esta queda "ok", se suma (así la
 * siguiente con el mismo número sale como duplicada).
 */
export async function procesarDocumento(adjunto: Adjunto, modelo: ModeloJson, cargadas: Set<string>): Promise<ResultadoDocumento> {
  const ex = await extraerFactura(adjunto, modelo);
  const base = { intentos: ex.intentos, uso: ex.uso, costoUsd: costoUsd(ex.uso), ms: ex.ms };
  if (!ex.ok) return { ...base, estado: "excepcion", factura: null, motivos: [{ codigo: "extraccion_invalida", campo: "(documento)", detalle: ex.error }] };
  const v = validarFactura(ex.factura, cargadas);
  if (v.ok) cargadas.add(claveFactura(ex.factura));
  return { ...base, estado: v.ok ? "ok" : "excepcion", factura: ex.factura, motivos: v.problemas };
}
