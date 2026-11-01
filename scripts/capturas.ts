// Capturas del README y de los perfiles (1280×800), siempre en modo demo (facturas ficticias, lectura grabada):
// bandeja, revisión de un total que no cierra, foto inclinada con la alícuota mal leída, aprobada con el sello,
// duplicada y la planilla con la fila de revisión humana. En español van a docs/capturas/ y en inglés a
// docs/capturas/en/ (las de Upwork).
// Uso: npm run build && npm run capturas
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { TEXTOS, type Idioma } from "../src/i18n/textos";

const PUERTO = 3205;
const BASE = `http://localhost:${PUERTO}`;
const BRAVE = process.env.BRAVE_PATH ?? path.join(process.env.LOCALAPPDATA ?? "", "BraveSoftware/Brave-Browser/Application/brave.exe");
// En la demo, D07 es el mail 7, E01 el 8 y E05 el 10 (ver SET_DEMO en src/bandeja/demo.ts).
const D07 = "demo-07-1";
const E01 = "demo-08-1";
const E05 = "demo-10-1";
const totalE01 = (JSON.parse(fs.readFileSync(path.join("data", "golden", "E01.json"), "utf8")) as { factura: { total: number } }).factura.total;

const arriba = async () => {
  try {
    return (await fetch(BASE)).ok;
  } catch {
    return false;
  }
};

async function reiniciar() {
  const r = await fetch(`${BASE}/api/procesar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "reiniciar" }) });
  if (!r.ok) throw new Error(`No se pudo reiniciar la demo (${r.status})`);
}

async function capturar(page: Page, idioma: Idioma) {
  const t = TEXTOS[idioma];
  const dir = path.join("docs", "capturas", idioma === "en" ? "en" : "");
  fs.mkdirSync(dir, { recursive: true });
  const foto = (nombre: string) => page.screenshot({ path: path.join(dir, `${nombre}.png`) });
  const quieto = () => page.waitForTimeout(900);
  const ir = async (ruta: string) => {
    await page.goto(`${BASE}${t.base}${ruta}`);
    await page.waitForLoadState("networkidle");
    await quieto();
  };

  await reiniciar();
  await ir("/");
  await foto("1-bandeja");

  await ir(`/revision?doc=${E01}`);
  await foto("2-total-no-cierra");

  await ir(`/revision?doc=${D07}`);
  await foto("3-foto-inclinada");

  await ir(`/revision?doc=${E01}`);
  await page.getByLabel(t.revision.total, { exact: true }).fill(String(Math.round((totalE01 - 1000) * 100) / 100));
  await page.getByRole("button", { name: t.revision.aprobar }).click();
  await page.getByText(t.revision.aprobadaTexto).waitFor();
  await quieto();
  await foto("4-aprobada");

  await ir(`/revision?doc=${E05}`);
  await foto("5-duplicada");

  await ir("/");
  await page.evaluate(() => {
    const tabla = document.querySelector("table")!.closest("section") ?? document.querySelector("table")!;
    window.scrollTo(0, tabla.getBoundingClientRect().top + window.scrollY - 16);
  });
  await quieto();
  await foto("6-planilla");
  await reiniciar();
  console.log(`  ${idioma}: 6 capturas en ${dir}`);
}

async function main() {
  let servidor: ChildProcess | null = null;
  if (!(await arriba())) {
    servidor = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PUERTO)], { stdio: "ignore", env: { ...process.env, REMITO_REAL: "", REMITO_ESCUCHA: "" } });
    for (let i = 0; i < 60 && !(await arriba()); i++) await new Promise((r) => setTimeout(r, 1000));
  }
  try {
    for (const idioma of ["es", "en"] as const) {
      // El campo de fecha toma el formato del idioma del navegador, no el de la página: un navegador por idioma.
      const locale = idioma === "en" ? "en-US" : "es-AR";
      const navegador = await chromium.launch({ executablePath: BRAVE, args: [`--lang=${locale}`] });
      try {
        await capturar(await navegador.newPage({ viewport: { width: 1280, height: 800 }, locale }), idioma);
      } finally {
        await navegador.close();
      }
    }
  } finally {
    if (servidor) {
      if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(servidor.pid), "/T", "/F"], { stdio: "ignore" });
      else servidor.kill();
    }
  }
}

void main().catch((e) => {
  console.error("Falló:", e instanceof Error ? e.message : e);
  process.exit(1);
});
