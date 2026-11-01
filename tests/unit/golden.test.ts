// El set dorado (data/golden) contra los validadores: es la "verdad" contra la que se va a medir la extracción (P4-G2).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { claveFactura, facturaSchema, type Factura } from "@/factura/esquema";
import { validarCuit } from "@/validacion/cuit";
import { validarFactura } from "@/validacion/validadores";

interface Golden {
  id: string;
  archivo: string;
  tipo: "limpia" | "degradada" | "error";
  origen?: string;
  factura: Factura;
  erroresEsperados: string[];
}

const DIR = path.join(process.cwd(), "data", "golden");
const goldens: Golden[] = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")));
const de = (t: Golden["tipo"]) => goldens.filter((g) => g.tipo === t);
/** Orden de carga: primero las limpias y después las de error (las degradadas se miden aparte, en la extracción). */
const lote = [...de("limpia"), ...de("error")];

describe("set dorado", () => {
  it("40 limpias, 10 degradadas y 5 con errores, cada una con su archivo", () => {
    expect([de("limpia").length, de("degradada").length, de("error").length]).toEqual([40, 10, 5]);
    for (const g of goldens) expect(fs.existsSync(path.join(process.cwd(), g.archivo)), g.archivo).toBe(true);
  });

  it("todas tienen la forma del esquema y CUIT válido marcado como ficticio en el documento", () => {
    for (const g of goldens) {
      expect(facturaSchema.safeParse(g.factura).success, g.id).toBe(true);
      expect(validarCuit(g.factura.proveedor.cuit).ok, g.id).toBe(true);
    }
  });

  it("cubre lo que pide el plan: 6 proveedores, A y B, de 1 a 15 renglones, bonificaciones y percepciones", () => {
    const l = de("limpia").map((g) => g.factura);
    expect(new Set(l.map((f) => f.proveedor.cuit)).size).toBe(6);
    expect(new Set(l.map((f) => f.tipo))).toEqual(new Set(["A", "B"]));
    expect(Math.min(...l.map((f) => f.items.length))).toBe(1);
    expect(Math.max(...l.map((f) => f.items.length))).toBe(15);
    expect(l.some((f) => f.items.some((i) => i.bonificacionPct > 0))).toBe(true);
    expect(l.some((f) => f.percepciones.length > 0)).toBe(true);
  });

  it("procesando el lote en orden: las limpias cierran y cada error se detecta con su código", () => {
    const cargadas = new Set<string>();
    for (const g of lote) {
      const r = validarFactura(g.factura, cargadas);
      expect([...new Set(r.problemas.map((p) => p.codigo))].sort(), g.id).toEqual([...g.erroresEsperados].sort());
      if (r.ok) cargadas.add(claveFactura(g.factura));
    }
    expect(de("error").flatMap((g) => g.erroresEsperados).sort()).toEqual(["duplicada", "iva_incorrecto", "iva_incorrecto", "total_no_cierra", "total_no_cierra"]);
  });

  it("las degradadas tienen la misma verdad que la limpia de la que salen", () => {
    for (const g of de("degradada")) expect(g.factura, g.id).toEqual(goldens.find((x) => x.id === g.origen)!.factura);
  });
});
