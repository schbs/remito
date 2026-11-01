import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Factura } from "@/factura/esquema";
import { cuitConGuiones, extraerFactura, fechaISO, mimeDe, normalizar, numeroAR } from "@/extraccion/extract";
import { procesarDocumento } from "@/extraccion/pipeline";
import { crearModeloConCache, type ModeloJson, type RespuestaJson } from "@/ia/gemini";

const ADJUNTO = { mimeType: "application/pdf" as const, base64: "JVBERi0=" };

/** Salida del modelo para una factura A que cierra (la base del IVA no viene: se calcula). */
const salidaA = () => ({
  tipo: "A",
  proveedor: { razonSocial: "Proveedor de Prueba S.A.", cuit: "30719880017" },
  puntoVenta: 3,
  numero: 5146,
  fecha: "04/09/2026",
  items: [
    { codigo: "X1", descripcion: "Leche", cantidad: 10, precioUnitario: 14250, bonificacionPct: 0, importe: 142500, alicuotaIva: 10.5 },
    { codigo: "", descripcion: "Queso (kg)", cantidad: "12,5", precioUnitario: "8.940,50", bonificacionPct: 5, importe: "106.168,44", alicuotaIva: 21 },
  ],
  netoGravado: 248668.44,
  iva: [
    { alicuota: 10.5, importe: 14962.5 },
    { alicuota: 21, importe: 22295.37 },
  ],
  percepciones: [{ concepto: "Percepción IIBB Neuquén", importe: 7460.05 }],
  total: 293386.36,
});

/** Modelo falso que devuelve las respuestas en orden y cuenta los pedidos. */
function modeloFalso(respuestas: unknown[]): ModeloJson & { pedidos: string[] } {
  const pedidos: string[] = [];
  return {
    nombre: "falso",
    pedidos,
    async generar(p) {
      pedidos.push(p.usuario);
      return { json: respuestas[Math.min(pedidos.length - 1, respuestas.length - 1)], uso: { entrada: 1000, salida: 200 }, ms: 1500 };
    },
  };
}

describe("normalización", () => {
  it("números con formato argentino, CUIT sin guiones y fechas DD/MM/AAAA", () => {
    expect(numeroAR("1.234.567,89")).toBe(1234567.89);
    expect(numeroAR("106,2")).toBe(106.2);
    expect(numeroAR("$ 14.250,00")).toBe(14250);
    expect(numeroAR("1234.5")).toBe(1234.5);
    expect(numeroAR(42)).toBe(42);
    expect(cuitConGuiones("30 71988001 7")).toBe("30-71988001-7");
    expect(fechaISO("4/9/2026")).toBe("2026-09-04");
    expect(fechaISO("2026-09-04")).toBe("2026-09-04");
  });

  it("calcula la base de cada alícuota con los renglones y deja el código vacío como null", () => {
    const n = normalizar(salidaA()) as Factura;
    expect(n.iva).toEqual([
      { alicuota: 10.5, base: 142500, importe: 14962.5 },
      { alicuota: 21, base: 106168.44, importe: 22295.37 },
    ]);
    expect(n.items[1]).toMatchObject({ codigo: null, cantidad: 12.5, precioUnitario: 8940.5, importe: 106168.44 });
  });

  it("en una factura B no queda IVA discriminado aunque el modelo lo devuelva", () => {
    const n = normalizar({ ...salidaA(), tipo: "b" }) as Factura;
    expect(n).toMatchObject({ tipo: "B", netoGravado: null, iva: [] });
    expect(n.items.every((i) => i.alicuotaIva === null)).toBe(true);
  });

  it("tipo de archivo por extensión", () => {
    expect(mimeDe("a/F01.pdf")).toBe("application/pdf");
    expect(mimeDe("D03-F10.jpg")).toBe("image/jpeg");
    expect(() => mimeDe("x.gif")).toThrow();
  });
});

describe("extracción", () => {
  it("salida válida al primer intento: una sola llamada, con tokens y tiempo", async () => {
    const m = modeloFalso([salidaA()]);
    const r = await extraerFactura(ADJUNTO, m);
    expect(r).toMatchObject({ ok: true, intentos: 1, uso: { entrada: 1000, salida: 200 }, ms: 1500 });
    expect(m.pedidos).toHaveLength(1);
  });

  it("si no valida, reintenta una vez con el error en el pedido", async () => {
    const m = modeloFalso([{ ...salidaA(), proveedor: { razonSocial: "X", cuit: "1234" } }, salidaA()]);
    const r = await extraerFactura(ADJUNTO, m);
    expect(r).toMatchObject({ ok: true, intentos: 2 });
    expect(m.pedidos[1]).toContain("proveedor.cuit");
  });

  it("si tampoco valida al segundo intento, es una excepción (no se completa nada)", async () => {
    const m = modeloFalso([{ ...salidaA(), items: [] }]);
    const r = await extraerFactura(ADJUNTO, m);
    expect(r).toMatchObject({ ok: false, intentos: 2 });
    expect(m.pedidos).toHaveLength(2);
    if (!r.ok) expect(r.error).toContain("items");
  });
});

describe("pipeline: extraer → validar → clasificar", () => {
  it("una factura que cierra queda ok y se suma a las cargadas; la misma otra vez es duplicada", async () => {
    const cargadas = new Set<string>();
    const a = await procesarDocumento(ADJUNTO, modeloFalso([salidaA()]), cargadas);
    expect(a).toMatchObject({ estado: "ok", motivos: [] });
    expect(a.costoUsd).toBeCloseTo((1000 * 0.3 + 200 * 2.5) / 1e6);
    const b = await procesarDocumento(ADJUNTO, modeloFalso([salidaA()]), cargadas);
    expect(b).toMatchObject({ estado: "excepcion", motivos: [{ codigo: "duplicada" }] });
  });

  it("un total impreso que no cierra va a revisión con el motivo calculado", async () => {
    const r = await procesarDocumento(ADJUNTO, modeloFalso([{ ...salidaA(), total: 294386.36 }]), new Set());
    expect(r.estado).toBe("excepcion");
    expect(r.motivos[0]).toMatchObject({ codigo: "total_no_cierra", esperado: 293386.36 });
  });

  it("si la extracción no valida, la excepción dice por qué", async () => {
    const r = await procesarDocumento(ADJUNTO, modeloFalso([{ tipo: "C" }]), new Set());
    expect(r).toMatchObject({ estado: "excepcion", factura: null, motivos: [{ codigo: "extraccion_invalida" }] });
  });
});

describe("respuestas grabadas de Gemini (sin red)", () => {
  const archivo = path.join(process.cwd(), "data", "extraccion", "respuestas.json");
  const grabadas: Record<string, RespuestaJson> = fs.existsSync(archivo) ? JSON.parse(fs.readFileSync(archivo, "utf8")) : {};

  it("un pedido grabado no llama al modelo real; uno nuevo sin modelo real es un error", async () => {
    const real = modeloFalso([salidaA()]);
    const m = crearModeloConCache({}, real);
    await m.generar({ sistema: "s", usuario: "u", schema: {} });
    await m.generar({ sistema: "s", usuario: "u", schema: {} });
    expect([real.pedidos.length, m.nuevas, m.desdeCache]).toEqual([1, 1, 1]);
    await expect(crearModeloConCache({}).generar({ sistema: "s", usuario: "otro", schema: {} })).rejects.toThrow("No hay respuesta grabada");
  });

  it.runIf(Object.keys(grabadas).length >= 55)("reproduce la medición: las 5 facturas con error van a revisión y las limpias cierran", async () => {
    const modelo = crearModeloConCache(grabadas);
    const golden = (id: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "golden", `${id}.json`), "utf8")) as { archivo: string; factura: Factura };
    const doc = (id: string) => {
      const g = golden(id);
      return { mimeType: mimeDe(g.archivo), base64: fs.readFileSync(path.join(process.cwd(), g.archivo)).toString("base64") };
    };
    const cargadas = new Set<string>();
    const limpias = Array.from({ length: 40 }, (_, i) => `F${String(i + 1).padStart(2, "0")}`);
    for (const id of limpias) expect((await procesarDocumento(doc(id), modelo, cargadas)).estado, id).toBe("ok");
    for (const [id, codigo] of [["E01", "total_no_cierra"], ["E02", "total_no_cierra"], ["E03", "iva_incorrecto"], ["E04", "iva_incorrecto"], ["E05", "duplicada"]]) {
      const r = await procesarDocumento(doc(id), modelo, cargadas);
      expect(r.motivos.map((m) => m.codigo), id).toContain(codigo);
    }
  });
});
