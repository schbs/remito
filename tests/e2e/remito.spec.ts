// E2E sobre el build de producción en modo demo: los 10 mails procesados con las respuestas grabadas, en memoria.
// Cada test arranca con la demo reiniciada.
import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function revisarAccesibilidad(page: Page, nombre: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const graves = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  console.log(`  axe → ${nombre}: ${r.passes.length} reglas OK, ${r.violations.length} violaciones (${graves.length} serias o críticas)`);
  expect(graves.map((v) => `${v.id}: ${v.help} (${v.nodes.length}: ${v.nodes[0]?.target.join(" ")})`)).toEqual([]);
}

const golden = (id: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "golden", `${id}.json`), "utf8")) as { factura: { total: number; proveedor: { razonSocial: string } } };
// En la demo, E01 es el mail 8 y E05 el 10 (ver SET_DEMO en src/bandeja/demo.ts).
const E01 = "demo-08-1";
const E05 = "demo-10-1";

test.beforeEach(async ({ request }) => {
  const r = await request.post("/api/procesar", { data: { accion: "reiniciar" } });
  expect(r.ok()).toBe(true);
});

test("la bandeja muestra los 10 mails: 6 cargados solos y 4 para revisar, y la planilla con 6 filas", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Bandeja de facturas" })).toBeVisible();
  await expect(page.getByText("Cargadas solas").locator("xpath=following-sibling::dd")).toHaveText("6");
  await expect(page.getByText("Para revisar", { exact: true }).first().locator("xpath=following-sibling::dd")).toHaveText("4");
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(6);
  await revisarAccesibilidad(page, "bandeja");
});

test("aprobar una excepción con el total corregido la pasa a la planilla como revisión humana", async ({ page }) => {
  const e01 = golden("E01").factura;
  await page.goto(`/revision?doc=${E01}`);
  await expect(page.getByText(/La suma da \$ .*, no \$ /).first()).toBeVisible();
  const total = page.getByLabel("Total", { exact: true });
  await expect(total).toHaveAttribute("aria-invalid", "true");
  await total.fill(String(Math.round((e01.total - 1000) * 100) / 100));
  await expect(page.getByText("La factura cierra: se puede aprobar y cargar.")).toBeVisible();
  await expect(total).not.toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "Aprobar y cargar en la planilla" }).click();
  await expect(page.getByText("Se cargó en la planilla.")).toBeVisible();
  await revisarAccesibilidad(page, "revisión aprobada");

  await page.goto("/");
  await expect(page.getByText("Aprobadas en revisión").locator("xpath=following-sibling::dd")).toHaveText("1");
  const fila = page.getByRole("table").locator("tbody tr").filter({ hasText: "revisión humana" });
  await expect(fila).toHaveCount(1);
  await expect(fila).toContainText(e01.proveedor.razonSocial);
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(7);
});

test("si no cierra, no se aprueba salvo que la persona lo confirme", async ({ page }) => {
  await page.goto(`/revision?doc=${E01}`);
  const aprobar = page.getByRole("button", { name: "Aprobar y cargar en la planilla" });
  await expect(aprobar).toBeDisabled();
  await page.getByLabel("Revisé el documento y la cargo igual (queda registrado)").check();
  await expect(aprobar).toBeEnabled();
  await revisarAccesibilidad(page, "revisión con problema");
});

test("una duplicada no se puede aprobar: se rechaza y no entra en la planilla", async ({ page }) => {
  await page.goto(`/revision?doc=${E05}`);
  await expect(page.getByText("Ya está en la planilla: no se puede cargar dos veces.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Aprobar y cargar en la planilla" })).toBeDisabled();
  await page.getByLabel("Motivo del rechazo (opcional)").fill("Reenvío de una factura ya cargada");
  await page.getByRole("button", { name: "Rechazar" }).click();
  await expect(page.getByText("Quedó rechazada y no se cargó.")).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("Rechazadas").locator("xpath=following-sibling::dd")).toHaveText("1");
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(6);
});

test("en inglés: la revisión explica el problema con los mismos números", async ({ page }) => {
  await page.goto(`/en/revision?doc=${E01}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1, name: "Review" })).toBeVisible();
  await expect(page.getByText(/The amounts add up to \$ [\d,]+\.\d\d, not \$ /).first()).toBeVisible();
  await revisarAccesibilidad(page, "/en/revision");
});

test("el documento original se sirve con su tipo y la API rechaza pedidos de otro origen o sin JSON", async ({ request }) => {
  const pdf = await request.get(`/api/documentos/${E01}`);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await request.get("/api/documentos/no-existe")).status()).toBe(404);
  expect((await request.post(`/api/bandeja/${E01}`, { data: { accion: "rechazar" }, headers: { Origin: "https://otro-sitio.example" } })).status()).toBe(403);
  expect((await request.post(`/api/bandeja/${E01}`, { data: "accion=rechazar", headers: { "Content-Type": "application/x-www-form-urlencoded" } })).status()).toBe(415);
  expect((await request.post(`/api/bandeja/${E01}`, { data: { accion: "aprobar", factura: { tipo: "C" } } })).status()).toBe(400);
});
