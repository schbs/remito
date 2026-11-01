// Procesa la casilla de demo de verdad: lee "facturas/entrada", extrae con Gemini, valida, carga en Google Sheets y
// deja las excepciones en data/bandeja/ para la revisión (npm run dev:real). Mueve cada mail a "procesadas" o
// "excepciones". Es idempotente: correrlo de nuevo no duplica nada.
// Uso: npx tsx scripts/procesar-gmail.ts
import { crearDestinoSheets } from "../src/bandeja/planilla";
import { procesarEntrada } from "../src/bandeja/procesar";
import { clientesGoogle, conCandado, crearAlmacenArchivo, crearFuenteGmail } from "../src/bandeja/real";
import { crearModeloGemini } from "../src/ia/gemini";
import { cargar, exigir } from "./lib/variables.mjs";

async function main() {
  cargar();
  exigir(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "GOOGLE_SHEET_ID", "GEMINI_API_KEY"], "Ver notas/pendientes.md (configurar Google).");
  const { gmail, sheets } = clientesGoogle();
  const t0 = Date.now();
  const resumen = await conCandado(() =>
    procesarEntrada({
      fuente: crearFuenteGmail(gmail),
      destino: crearDestinoSheets(sheets, process.env.GOOGLE_SHEET_ID!),
      almacen: crearAlmacenArchivo(),
      modelo: crearModeloGemini({ apiKey: process.env.GEMINI_API_KEY!, modelo: process.env.GEMINI_MODEL || undefined }),
    }),
  );
  for (const m of resumen.filter((x) => x.error)) console.log(`  ✕ ${m.asunto}: ${m.error} (quedó en "facturas/entrada" para la próxima corrida)`);
  const docs = resumen.flatMap((m) => m.documentos.map((d) => ({ ...d, asunto: m.asunto, archivadoEn: m.archivadoEn })));
  console.log(`${resumen.length} mails procesados en ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
  for (const d of docs) console.log(`  ${d.estado === "cargada" ? "✓ cargada  " : "! excepción"}  ${d.archivo.padEnd(12)} ${d.asunto.slice(0, 70).padEnd(70)} ${d.motivos.join(", ")}${d.nuevo ? "" : " (ya estaba)"}`);
  const ok = docs.filter((d) => d.estado === "cargada").length;
  console.log(`\n${ok} cargadas en la planilla · ${docs.length - ok} en revisión (etiqueta "facturas/excepciones") · revisarlas con: npm run dev:real → /revision`);
}

void main().catch((e) => {
  console.error("Falló:", e instanceof Error ? e.message : e);
  process.exit(1);
});
