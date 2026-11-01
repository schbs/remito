// E2E con Playwright sobre el build de producción, usando Brave (ya instalado: no se descargan navegadores).
// Corren en modo demo (fixtures ficticios): sin red, sin claves y sin costo. REMITO_REAL se fuerza vacío.
import path from "node:path";
import { defineConfig } from "@playwright/test";

const BRAVE = process.env.BRAVE_PATH ?? path.join(process.env.LOCALAPPDATA ?? "", "BraveSoftware/Brave-Browser/Application/brave.exe");
const PUERTO = 3215;

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    launchOptions: { executablePath: BRAVE },
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
  },
  webServer: {
    command: `npx next start -p ${PUERTO}`,
    url: `http://localhost:${PUERTO}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { REMITO_REAL: "", REMITO_ESCUCHA: "" },
  },
  projects: [
    { name: "celular", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "compu", use: { viewport: { width: 1440, height: 900 } } },
  ],
});
