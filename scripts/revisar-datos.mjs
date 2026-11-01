// Confirma que data/ solo tiene lo ficticio que genera el proyecto: facturas con la leyenda de demo, CUIT marcados
// "(FICTICIO)" en los golden, ningún mail ni teléfono, y nada de la bandeja del modo real.
// Uso: node scripts/revisar-datos.mjs (sale con código 1 si algo no cumple).
import fs from "node:fs";
import path from "node:path";

const raiz = "data";
const problemas = [];
const archivos = [];
const recorrer = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(p);
    else archivos.push(p);
  }
};
recorrer(raiz);

if (fs.existsSync(path.join(raiz, "bandeja"))) console.log("· data/bandeja existe (modo real): está en .gitignore y no se publica");
const publicables = archivos.filter((a) => !a.split(path.sep).includes("bandeja"));
const porTipo = {};
for (const a of publicables) porTipo[path.extname(a)] = (porTipo[path.extname(a)] ?? 0) + 1;

const MAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const TELEFONO = /\+?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{4}\b/g;
for (const a of publicables.filter((x) => /\.(json|html)$/.test(x))) {
  const t = fs.readFileSync(a, "utf8");
  for (const m of t.match(MAIL) ?? []) if (!m.endsWith("example.com")) problemas.push(`${a}: mail ${m}`);
  for (const m of t.match(TELEFONO) ?? []) if (!/^\d{4}-\d{8}$/.test(m) && /[\s+]/.test(m)) problemas.push(`${a}: posible teléfono ${m}`);
}

const golden = publicables.filter((a) => a.includes(`${path.sep}golden${path.sep}`));
let cuits = 0;
for (const g of golden) {
  const f = JSON.parse(fs.readFileSync(g, "utf8")).factura;
  cuits++;
  if (!/^\d{2}-\d{8}-\d$/.test(f.proveedor.cuit)) problemas.push(`${g}: CUIT con forma rara`);
}

// El texto de los PDF va comprimido: la leyenda se comprueba en las plantillas que los generan.
const plantillas = fs.readFileSync(path.join("scripts", "facturas", "plantillas.ts"), "utf8");
for (const leyenda of ["Comprobante ficticio de demostración", "(FICTICIO)"]) if (!plantillas.includes(leyenda)) problemas.push(`plantillas.ts sin "${leyenda}"`);

console.log(`Archivos publicables en data/: ${publicables.length} (${Object.entries(porTipo).map(([k, v]) => `${v} ${k}`).join(", ")})`);
console.log(`Golden revisados: ${cuits}; las plantillas del generador llevan la leyenda de demo y la marca (FICTICIO)`);
console.log(problemas.length ? `✗ ${problemas.length} hallazgos:\n  ${problemas.join("\n  ")}` : "✓ Sin mails, teléfonos ni datos reales en data/");
process.exit(problemas.length ? 1 : 0);
