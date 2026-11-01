// Plata en centavos enteros para comparar sin errores de coma flotante, y formato argentino para imprimir.

export const aCentavos = (n: number) => Math.round(n * 100);
export const dePesos = (c: number) => c / 100;
/** Redondeo a 2 decimales (mitad hacia arriba), como lo hace un sistema de facturación. */
export const redondear = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** "1.234,56" (sin signo de pesos). */
export function formatoAR(n: number, decimales = 2): string {
  const [entero, dec] = Math.abs(n).toFixed(decimales).split(".");
  const conPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "-" : ""}${conPuntos}${dec ? `,${dec}` : ""}`;
}

/** "$ 1.234,56". */
export const pesos = (n: number) => `$ ${formatoAR(n)}`;

/** Importe esperado de un renglón: cantidad × precio, menos la bonificación, redondeado a centavos. */
export const importeRenglon = (cantidad: number, precioUnitario: number, bonificacionPct: number) => redondear(cantidad * precioUnitario * (1 - bonificacionPct / 100));
