// Mensaje de cada problema en el idioma de la interfaz. En español es el detalle que arma el validador; en inglés se
// rearma por código con los mismos números (esperado y encontrado).
import type { Motivo } from "@/extraccion/pipeline";
import { formatoAR } from "@/factura/montos";
import type { Idioma } from "./textos";

const usd = (n: number | undefined) => (n == null ? "—" : `$ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const ars = (n: number | undefined) => (n == null ? "—" : `$ ${formatoAR(n)}`);

export function textoProblema(p: Motivo, idioma: Idioma): string {
  if (idioma === "es") return p.detalle;
  const m = p.campo.match(/\[(\d+(?:\.\d+)?)\]/)?.[1];
  switch (p.codigo) {
    case "total_no_cierra":
      return `The amounts add up to ${usd(p.esperado)}, not ${usd(p.encontrado)}`;
    case "iva_incorrecto":
      return `VAT ${m}% should be ${usd(p.esperado)}, not ${usd(p.encontrado)}`;
    case "base_iva_no_cierra":
      return `The VAT ${m}% base should be ${usd(p.esperado)}`;
    case "neto_no_cierra":
      return `The line items add up to ${usd(p.esperado)}, not ${usd(p.encontrado)}`;
    case "item_importe":
      return `Line ${Number(m) + 1}: quantity × price gives ${usd(p.esperado)}, not ${usd(p.encontrado)}`;
    case "duplicada":
      return "This invoice number from this supplier is already loaded";
    case "cuit_invalido":
      return "The supplier tax ID (CUIT) is not valid";
    case "fecha_invalida":
      return "That date does not exist";
    case "tipo_inconsistente":
      return "A type B invoice does not itemize VAT";
    case "extraccion_invalida":
      return "The AI could not read this document";
  }
}

/** Monto en el formato del idioma (la planilla y los totales), sin corte de línea entre el signo y el número. */
export const monto = (n: number, idioma: Idioma) => (idioma === "es" ? ars(n) : usd(n)).replace(" ", " ");
