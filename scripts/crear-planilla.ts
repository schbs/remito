// Crea la planilla de la demo en el Drive de la casilla de demo ("Remito · Cuentas a pagar (demo)") con las pestañas
// Cabecera e Ítems y guarda su id en el archivo local de variables. Si ya hay una (GOOGLE_SHEET_ID), no crea otra.
// Uso: npx tsx scripts/crear-planilla.ts
import { PESTANAS } from "../src/bandeja/planilla";
import { clientesGoogle } from "../src/bandeja/real";
import { cargar, exigir, guardar } from "./lib/variables.mjs";

async function main() {
  cargar();
  exigir(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"], "Primero: node scripts/autorizar-google.mjs");
  if (process.env.GOOGLE_SHEET_ID) {
    console.log(`Ya hay una planilla: https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}`);
    return;
  }
  const { sheets } = clientesGoogle();
  const p = await sheets.crear("Remito · Cuentas a pagar (demo, facturas ficticias)", { Cabecera: [...PESTANAS.Cabecera], Ítems: [...PESTANAS.Ítems] });
  guardar({ GOOGLE_SHEET_ID: p.id });
  console.log(`Planilla creada con las pestañas Cabecera e Ítems: ${p.url}`);
}

void main().catch((e) => {
  console.error("Falló:", e instanceof Error ? e.message : e);
  process.exit(1);
});
