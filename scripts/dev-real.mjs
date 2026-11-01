// Remito en modo real (Gmail, Google Sheets y data/bandeja/), solo en esta PC: escucha en 127.0.0.1. Es lo único que
// enciende el modo real: src/bandeja/servicio.ts pide REMITO_REAL=1 y REMITO_ESCUCHA=127.0.0.1, que salen de acá.
// Uso: npm run dev:real
import { spawn } from "node:child_process";
import path from "node:path";

const ESCUCHA = "127.0.0.1";
const next = path.join("node_modules", "next", "dist", "bin", "next");
const hijo = spawn(process.execPath, [next, "dev", "-H", ESCUCHA, "-p", "3205"], { stdio: "inherit", env: { ...process.env, REMITO_REAL: "1", REMITO_ESCUCHA: ESCUCHA } });
hijo.on("exit", (codigo) => process.exit(codigo ?? 0));
