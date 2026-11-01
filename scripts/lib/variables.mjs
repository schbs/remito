// Lee y escribe el archivo local de variables de Remito sin imprimir valores. Solo para los scripts de configuración.
import fs from "node:fs";

const ARCHIVO = ".env.local";

export function cargar() {
  try {
    process.loadEnvFile(ARCHIVO);
  } catch {
    // todavía no existe: los scripts dicen qué falta
  }
}

/** Guarda (o reemplaza) variables en el archivo local, con permisos solo para el dueño. Nunca las imprime. */
export function guardar(valores) {
  const lineas = fs.existsSync(ARCHIVO) ? fs.readFileSync(ARCHIVO, "utf8").split(/\r?\n/).filter((l) => l.trim()) : [];
  for (const [nombre, valor] of Object.entries(valores)) {
    const i = lineas.findIndex((l) => l.startsWith(`${nombre}=`));
    if (i >= 0) lineas[i] = `${nombre}=${valor}`;
    else lineas.push(`${nombre}=${valor}`);
    process.env[nombre] = valor;
  }
  fs.writeFileSync(ARCHIVO, lineas.join("\n") + "\n", { mode: 0o600 });
}

/** Corta con un mensaje si falta alguna variable (solo nombres). */
export function exigir(nombres, paso) {
  const faltan = nombres.filter((n) => !process.env[n]?.trim());
  if (faltan.length) {
    console.error(`Faltan ${faltan.join(", ")}. ${paso}`);
    process.exit(1);
  }
}
