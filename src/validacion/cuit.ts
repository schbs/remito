// CUIT/CUIL: 11 dígitos (tipo 2 + número 8 + verificador 1). El verificador sale del módulo 11 con los pesos
// 5,4,3,2,7,6,5,4,3,2; si el resto da 11 el dígito es 0 y si da 10 el número no es válido con ese prefijo.

const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
export const PREFIJOS = ["20", "23", "24", "27", "30", "33", "34"] as const;

export function digitoVerificador(diez: string): number | null {
  if (!/^\d{10}$/.test(diez)) return null;
  const suma = PESOS.reduce((t, p, i) => t + p * Number(diez[i]), 0);
  const dv = 11 - (suma % 11);
  if (dv === 11) return 0;
  if (dv === 10) return null;
  return dv;
}

export type ResultadoCuit = { ok: true; normalizado: string } | { ok: false; motivo: "formato" | "prefijo" | "verificador" };

/** Acepta "30-12345678-9", "30123456789" o con espacios; devuelve el CUIT normalizado con guiones. */
export function validarCuit(entrada: string): ResultadoCuit {
  const digitos = entrada.replace(/[\s.-]/g, "");
  if (!/^\d{11}$/.test(digitos)) return { ok: false, motivo: "formato" };
  if (!(PREFIJOS as readonly string[]).includes(digitos.slice(0, 2))) return { ok: false, motivo: "prefijo" };
  const dv = digitoVerificador(digitos.slice(0, 10));
  if (dv === null || dv !== Number(digitos[10])) return { ok: false, motivo: "verificador" };
  return { ok: true, normalizado: `${digitos.slice(0, 2)}-${digitos.slice(2, 10)}-${digitos[10]}` };
}

/** Arma un CUIT con verificador válido a partir de prefijo + 8 dígitos (para generar datos ficticios). */
export function armarCuit(prefijo: string, ocho: string): string | null {
  const dv = digitoVerificador(prefijo + ocho);
  return dv === null ? null : `${prefijo}-${ocho}-${dv}`;
}
