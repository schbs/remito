// Mide la extracción contra el set dorado: exactitud por campo (proveedor, número, fecha, total, renglones) en limpias,
// degradadas y con errores; exactitud por documento; detección de los 5 errores; excepciones de más; costo y latencia.
// Las respuestas de Gemini se graban en data/extraccion/respuestas.json: medir de nuevo no gasta cuota (salvo que
// cambie el prompt, el schema o un documento).
// Uso: npx tsx scripts/accuracy.ts                 (usa lo grabado y pide a Gemini solo lo que falta)
//      npx tsx scripts/accuracy.ts --sin-red       (solo lo grabado; falla si falta algo)
//      npx tsx scripts/accuracy.ts --solo=F01,D03  (solo esos documentos)
import fs from "node:fs";
import path from "node:path";
import type { Factura } from "../src/factura/esquema";
import { mimeDe } from "../src/extraccion/extract";
import { procesarDocumento, type ResultadoDocumento } from "../src/extraccion/pipeline";
import { CupoAgotado, crearModeloConCache, crearModeloGemini, type RespuestaJson } from "../src/ia/gemini";

try {
  process.loadEnvFile(".env.local");
} catch {
  // sin archivo: solo sirve con --sin-red
}

interface Golden {
  id: string;
  archivo: string;
  tipo: "limpia" | "degradada" | "error";
  factura: Factura;
  erroresEsperados: string[];
}

const ARCHIVO_GRABADAS = path.join("data", "extraccion", "respuestas.json");
const sinRed = process.argv.includes("--sin-red");
const solo = process.argv.find((a) => a.startsWith("--solo="))?.split("=")[1]?.split(",");
const CONCURRENCIA = 2;

const goldens: Golden[] = fs
  .readdirSync(path.join("data", "golden"))
  .sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join("data", "golden", f), "utf8")) as Golden)
  .filter((g) => !solo || solo.includes(g.id));

const grabadas: Record<string, RespuestaJson> = fs.existsSync(ARCHIVO_GRABADAS) ? JSON.parse(fs.readFileSync(ARCHIVO_GRABADAS, "utf8")) : {};
const guardar = () => {
  fs.mkdirSync(path.dirname(ARCHIVO_GRABADAS), { recursive: true });
  fs.writeFileSync(ARCHIVO_GRABADAS, JSON.stringify(grabadas, null, 1) + "\n");
};
const real = !sinRed && process.env.GEMINI_API_KEY ? crearModeloGemini({ apiKey: process.env.GEMINI_API_KEY, modelo: process.env.GEMINI_MODEL || undefined }) : undefined;
const modelo = crearModeloConCache(grabadas, real, process.env.GEMINI_MODEL || undefined);

// ---------- Comparación por campo ----------
const CAMPOS = ["proveedor", "numero", "fecha", "total", "items"] as const;
type Campo = (typeof CAMPOS)[number];
const igual = (a: number | null | undefined, b: number | null | undefined, tol = 0.01) => a != null && b != null && Math.abs(a - b) <= tol + 1e-9;

function compararCampos(e: Factura | null, g: Factura): Record<Campo | "documento", boolean> {
  if (!e) return { proveedor: false, numero: false, fecha: false, total: false, items: false, documento: false };
  const items = e.items.length === g.items.length && e.items.every((it, i) => igual(it.cantidad, g.items[i].cantidad, 0.001) && igual(it.precioUnitario, g.items[i].precioUnitario) && igual(it.importe, g.items[i].importe) && igual(it.bonificacionPct, g.items[i].bonificacionPct, 0.001) && it.alicuotaIva === g.items[i].alicuotaIva);
  const c = {
    proveedor: e.proveedor.cuit === g.proveedor.cuit,
    numero: e.puntoVenta === g.puntoVenta && e.numero === g.numero,
    fecha: e.fecha === g.fecha,
    total: igual(e.total, g.total),
    items,
  };
  const iva = e.iva.length === g.iva.length && g.iva.every((v) => e.iva.some((x) => x.alicuota === v.alicuota && igual(x.importe, v.importe)));
  const perc = e.percepciones.length === g.percepciones.length && g.percepciones.every((p, i) => igual(e.percepciones[i]?.importe, p.importe));
  return { ...c, documento: Object.values(c).every(Boolean) && e.tipo === g.tipo && igual(e.netoGravado ?? -1, g.netoGravado ?? -1) && iva && perc };
}

interface Fila {
  id: string;
  tipo: Golden["tipo"];
  r: ResultadoDocumento;
  campos: Record<Campo | "documento", boolean>;
  esperados: string[];
}

async function enParalelo<T>(xs: T[], fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, xs.length) }, async () => {
    while (i < xs.length) await fn(xs[i++]);
  }));
}

async function procesar(g: Golden, cargadas: Set<string>, filas: Fila[]) {
  const archivo = fs.readFileSync(g.archivo);
  const r = await procesarDocumento({ mimeType: mimeDe(g.archivo), base64: archivo.toString("base64") }, modelo, cargadas);
  if (modelo.nuevas) guardar();
  filas.push({ id: g.id, tipo: g.tipo, r, campos: compararCampos(r.factura, g.factura), esperados: g.erroresEsperados });
  process.stdout.write(r.estado === "ok" ? "." : "x");
}

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1).replace(".", ",")} %` : "–");
const percentil = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : 0;
};

async function main() {
  const filas: Fila[] = [];
  console.log(`Extracción con ${modelo.nombre} sobre ${goldens.length} documentos (${Object.keys(grabadas).length} respuestas grabadas)`);
  try {
    // Lote 1: limpias y después las de error (la duplicada E05 tiene que encontrar cargada a su original).
    const cargadas = new Set<string>();
    await enParalelo(goldens.filter((g) => g.tipo === "limpia"), (g) => procesar(g, cargadas, filas));
    for (const g of goldens.filter((x) => x.tipo === "error")) await procesar(g, cargadas, filas);
    // Lote 2: degradadas, aparte (son otras versiones de facturas limpias).
    await enParalelo(goldens.filter((g) => g.tipo === "degradada"), (g) => procesar(g, new Set(), filas));
  } catch (e) {
    guardar();
    if (e instanceof CupoAgotado) console.error(`\n${e.message} Lo grabado quedó guardado: volver a correr más tarde.`);
    throw e;
  }
  console.log(`\n${modelo.nuevas} pedidos nuevos a Gemini, ${modelo.desdeCache} desde lo grabado.\n`);

  const grupos = [["limpia", "limpias"], ["degradada", "degradadas"], ["error", "con errores"]] as const;
  const de = (t: Golden["tipo"]) => filas.filter((f) => f.tipo === t);
  console.log(`campo            ${grupos.map(([t, n]) => `${n} (${de(t).length})`.padEnd(20)).join("")}`);
  for (const c of [...CAMPOS, "documento"] as const) {
    console.log(`${(c === "documento" ? "documento exacto" : c).padEnd(17)}${grupos.map(([t]) => `${de(t).filter((f) => f.campos[c]).length}/${de(t).length} ${pct(de(t).filter((f) => f.campos[c]).length, de(t).length)}`.padEnd(20)).join("")}`);
  }
  const clave = (t: Golden["tipo"]) => {
    const fs_ = de(t);
    const ok = fs_.reduce((s, f) => s + CAMPOS.filter((c) => f.campos[c]).length, 0);
    return { ok, total: fs_.length * CAMPOS.length };
  };
  console.log(`${"campos clave".padEnd(17)}${grupos.map(([t]) => `${clave(t).ok}/${clave(t).total} ${pct(clave(t).ok, clave(t).total)}`.padEnd(20)).join("")}`);

  // Errores intencionales: cada uno tiene que salir como excepción con su código.
  console.log("\nErrores intencionales:");
  let detectados = 0;
  for (const f of de("error")) {
    const codigos = f.r.motivos.map((m) => m.codigo);
    const ok = f.r.estado === "excepcion" && f.esperados.every((e) => codigos.includes(e as never));
    detectados += ok ? 1 : 0;
    console.log(`  ${f.id} esperado ${f.esperados.join("+")} → ${f.r.estado}${codigos.length ? ` (${[...new Set(codigos)].join(", ")})` : ""} ${ok ? "✓" : "✗"}`);
  }
  console.log(`  detectados: ${detectados}/${de("error").length}`);

  const falsas = [...de("limpia"), ...de("degradada")].filter((f) => f.r.estado === "excepcion");
  console.log(`\nExcepciones en documentos sin error: ${falsas.length} (${falsas.map((f) => `${f.id}: ${[...new Set(f.r.motivos.map((m) => m.codigo))].join(", ")}`).join(" · ") || "ninguna"})`);
  const reintentos = filas.filter((f) => f.r.intentos > 1).map((f) => f.id);
  console.log(`Reintentos por JSON que no validó: ${reintentos.length}${reintentos.length ? ` (${reintentos.join(", ")})` : ""}`);

  const costos = filas.map((f) => f.r.costoUsd);
  const latencias = filas.map((f) => f.r.ms).filter((ms) => ms > 0);
  const tokens = filas.map((f) => f.r.uso.entrada + f.r.uso.salida);
  console.log(`Costo (plan pago de Flash-Lite): USD ${(costos.reduce((a, b) => a + b, 0) / costos.length).toFixed(5)} por documento · USD ${costos.reduce((a, b) => a + b, 0).toFixed(4)} las ${filas.length} · ${Math.round(tokens.reduce((a, b) => a + b, 0) / tokens.length)} tokens por documento`);
  console.log(`Latencia por documento: p50 ${(percentil(latencias, 50) / 1000).toFixed(1)} s · p95 ${(percentil(latencias, 95) / 1000).toFixed(1)} s`);

  // Diferencias, para iterar el prompt y la normalización.
  const fallas = filas.filter((f) => CAMPOS.some((c) => !f.campos[c]));
  if (fallas.length) {
    console.log("\nCampos que no coinciden:");
    for (const f of fallas.sort((a, b) => a.id.localeCompare(b.id))) {
      const g = goldens.find((x) => x.id === f.id)!.factura;
      const e = f.r.factura;
      const det = CAMPOS.filter((c) => !f.campos[c]).map((c) => {
        if (!e) return `${c}: sin extracción`;
        if (c === "items") {
          const i = e.items.findIndex((it, k) => !g.items[k] || !igual(it.importe, g.items[k].importe) || !igual(it.cantidad, g.items[k].cantidad, 0.001) || !igual(it.precioUnitario, g.items[k].precioUnitario) || !igual(it.bonificacionPct, g.items[k].bonificacionPct, 0.001) || it.alicuotaIva !== g.items[k].alicuotaIva);
          return `items: ${e.items.length} de ${g.items.length}${i >= 0 ? `; renglón ${i + 1} ${JSON.stringify(e.items[i])} vs ${JSON.stringify(g.items[i] ?? null)}` : ""}`;
        }
        const val = (x: Factura) => (c === "proveedor" ? x.proveedor.cuit : c === "numero" ? `${x.puntoVenta}-${x.numero}` : c === "fecha" ? x.fecha : x.total);
        return `${c}: ${val(e)} vs ${val(g)}`;
      });
      console.log(`  ${f.id} (${f.tipo}): ${det.join(" | ")}`);
    }
  }

  fs.mkdirSync(path.join("docs", "resultados"), { recursive: true });
  fs.writeFileSync(
    path.join("docs", "resultados", "accuracy.json"),
    JSON.stringify(
      {
        fecha: new Date().toISOString(),
        modelo: modelo.nombre,
        documentos: filas.length,
        camposClave: Object.fromEntries(grupos.map(([t]) => [t, clave(t)])),
        porCampo: Object.fromEntries(grupos.map(([t]) => [t, Object.fromEntries([...CAMPOS, "documento"].map((c) => [c, `${de(t).filter((f) => f.campos[c as Campo]).length}/${de(t).length}`]))])),
        erroresDetectados: `${detectados}/${de("error").length}`,
        excepcionesDeMas: falsas.map((f) => f.id),
        costoPromedioUsd: costos.reduce((a, b) => a + b, 0) / costos.length,
        latenciaP50Ms: percentil(latencias, 50),
        latenciaP95Ms: percentil(latencias, 95),
        detalle: filas.sort((a, b) => a.id.localeCompare(b.id)).map((f) => ({ id: f.id, estado: f.r.estado, motivos: f.r.motivos.map((m) => m.codigo), campos: f.campos, intentos: f.r.intentos, tokens: f.r.uso, ms: f.r.ms })),
      },
      null,
      2,
    ) + "\n",
  );
}

void main().catch((e) => {
  console.error("Falló:", e instanceof Error ? e.message : e);
  process.exit(1);
});
