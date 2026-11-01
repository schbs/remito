import { describe, expect, it } from "vitest";
import { leerGolden, mensajesDemo, modeloGrabado, SET_DEMO } from "@/bandeja/demo";
import { crearAlmacenMemoria, crearFuenteMemoria } from "@/bandeja/memoria";
import { crearDestinoMemoria, crearDestinoSheets, filaCabecera, PESTANAS } from "@/bandeja/planilla";
import { aprobar, cambios, procesarEntrada, rechazar } from "@/bandeja/procesar";
import { claveFactura, type Factura } from "@/factura/esquema";
import type { ClienteSheets } from "@/integraciones/google/sheets";

async function demo() {
  const almacen = crearAlmacenMemoria();
  const destino = crearDestinoMemoria();
  const fuente = crearFuenteMemoria(mensajesDemo());
  const dep = { fuente, destino, almacen, modelo: modeloGrabado(), ahora: () => new Date("2026-10-31T15:00:00Z") };
  const resumen = await procesarEntrada(dep);
  return { ...dep, resumen };
}
const idDe = (golden: string) => `demo-${String(SET_DEMO.indexOf(golden as never) + 1).padStart(2, "0")}-1`;

describe("procesar la casilla (10 mails de la demo, respuestas grabadas)", () => {
  it("6 se cargan solas y 4 van a revisión, cada una con su motivo; los mails quedan archivados", async () => {
    const { resumen, destino, fuente } = await demo();
    const estados = Object.fromEntries(resumen.map((m) => [m.documentos[0].archivo.split(".")[0], `${m.documentos[0].estado}${m.documentos[0].motivos.length ? `:${m.documentos[0].motivos.join("+")}` : ""}`]));
    expect(estados).toEqual({ F01: "cargada", F05: "cargada", F18: "cargada", F23: "cargada", F30: "cargada", D03: "cargada", D07: "excepcion:iva_incorrecto", E01: "excepcion:total_no_cierra", E03: "excepcion:iva_incorrecto", E05: "excepcion:duplicada" });
    expect(destino.cabecera).toHaveLength(6);
    expect(destino.items.length).toBe(["F01", "F05", "F18", "F23", "F30", "D03"].reduce((t, id) => t + leerGolden(id).factura.items.length, 0));
    expect([...fuente.etiquetas.values()].filter((e) => e === "excepciones")).toHaveLength(4);
    expect(await fuente.entrada()).toEqual([]);
  });

  it("es idempotente: procesar de nuevo no extrae ni carga nada otra vez", async () => {
    const d = await demo();
    for (const id of d.fuente.etiquetas.keys()) d.fuente.etiquetas.set(id, "entrada"); // como si no se hubieran archivado
    const filas = d.destino.cabecera.length;
    const otra = await procesarEntrada(d);
    expect(otra.flatMap((m) => m.documentos).every((x) => !x.nuevo)).toBe(true);
    expect(d.destino.cabecera).toHaveLength(filas);
  });
});

describe("revisión humana", () => {
  it("aprobar con el total corregido carga la factura con origen 'revisión humana' y registra el cambio", async () => {
    const d = await demo();
    const doc = (await d.almacen.obtener(idDe("E01")))!;
    const corregida: Factura = { ...doc.extraida!, total: Math.round((doc.extraida!.total - 1000) * 100) / 100 };
    const r = await aprobar(d, doc.id, corregida);
    expect(r).toMatchObject({ ok: true, doc: { estado: "aprobada", revision: { cambios: ["total"], forzada: false } } });
    expect(d.destino.cabecera.at(-1)).toContain("revisión humana");
    expect(d.destino.cabecera.at(-1)![0]).toBe(claveFactura(corregida));
  });

  it("sin corregir no se carga, salvo que la persona confirme (queda como forzada)", async () => {
    const d = await demo();
    const doc = (await d.almacen.obtener(idDe("E03")))!;
    const sin = await aprobar(d, doc.id, doc.extraida!);
    expect(sin).toMatchObject({ ok: false, problemas: [{ codigo: "iva_incorrecto" }] });
    const forzada = await aprobar(d, doc.id, doc.extraida!, { forzar: true });
    expect(forzada).toMatchObject({ ok: true, doc: { revision: { forzada: true } } });
  });

  it("una duplicada no se carga nunca; se rechaza con una nota", async () => {
    const d = await demo();
    const id = idDe("E05");
    const doc = (await d.almacen.obtener(id))!;
    expect(await aprobar(d, id, doc.extraida!, { forzar: true })).toMatchObject({ ok: false, error: expect.stringContaining("ya está cargada") });
    expect(await rechazar(d, id, "Reenvío de la 0003-… ya cargada")).toMatchObject({ ok: true, doc: { estado: "rechazada" } });
    expect(await rechazar(d, id, "otra vez")).toMatchObject({ ok: false });
  });

  it("la alícuota mal leída en la foto (D07) se corrige y la factura cierra", async () => {
    const d = await demo();
    const doc = (await d.almacen.obtener(idDe("D07")))!;
    const g = leerGolden("D07").factura;
    const r = await aprobar(d, doc.id, g);
    expect(r).toMatchObject({ ok: true, doc: { revision: { forzada: false } } });
    if (r.ok) expect(r.doc.revision!.cambios.some((c) => c.startsWith("renglón"))).toBe(true);
  });

  it("cambios: compara lo leído con lo corregido", () => {
    const f = leerGolden("F01").factura;
    expect(cambios(f, f)).toEqual([]);
    expect(cambios(f, { ...f, fecha: "2026-01-01", total: 1 })).toEqual(["fecha", "total"]);
    expect(cambios(null, f)).toEqual(["datos cargados a mano"]);
  });
});

describe("planilla en Google Sheets (cliente simulado)", () => {
  function sheetsFalso(claves: string[][]) {
    const agregadas: { pestana: string; filas: unknown[][] }[] = [];
    const s = {
      crear: async () => ({ id: "x", url: "" }),
      leer: async () => claves,
      agregar: async (_id: string, pestana: string, filas: unknown[][]) => (agregadas.push({ pestana, filas }), filas.length),
    } as unknown as ClienteSheets;
    return { s, agregadas };
  }

  it("carga ítems y cabecera; si la clave ya está, no agrega nada", async () => {
    const f = leerGolden("F01").factura;
    const { s, agregadas } = sheetsFalso([]);
    expect(await crearDestinoSheets(s, "ID").cargar(f, { documentoId: "d1", origen: "automatica" })).toBe("cargada");
    expect(agregadas.map((a) => a.pestana)).toEqual(["Ítems", "Cabecera"]);
    expect(agregadas[0].filas).toHaveLength(f.items.length);
    const ya = sheetsFalso([[claveFactura(f), "d0"]]);
    expect(await crearDestinoSheets(ya.s, "ID").cargar(f, { documentoId: "d1", origen: "automatica" })).toBe("ya_estaba");
    expect(ya.agregadas).toEqual([]);
  });

  it("la fila de cabecera tiene una celda por columna", () => {
    const f = leerGolden("F05").factura;
    expect(filaCabecera(f, { documentoId: "d", origen: "automatica" })).toHaveLength(PESTANAS.Cabecera.length);
  });
});

describe("cortes a mitad de camino (revisión de la integración)", () => {
  it("si se cortó después de leer y antes de cargar, la próxima corrida carga lo leído sin volver a llamar a la IA", async () => {
    const almacen = crearAlmacenMemoria();
    const destino = crearDestinoMemoria();
    const fuente = crearFuenteMemoria(mensajesDemo().slice(0, 1));
    const modelo = modeloGrabado();
    const cargarReal = destino.cargar;
    destino.cargar = async () => {
      throw new Error("corte de red");
    };
    const primera = await procesarEntrada({ fuente, destino, almacen, modelo });
    expect(primera[0]).toMatchObject({ archivadoEn: null, error: "corte de red" });
    expect((await almacen.obtener("demo-01-1"))?.estado).toBe("pendiente");
    expect(fuente.etiquetas.get("demo-01")).toBe("entrada");
    destino.cargar = cargarReal;
    const llamadas = modelo.desdeCache + modelo.nuevas;
    const segunda = await procesarEntrada({ fuente, destino, almacen, modelo });
    expect(segunda[0]).toMatchObject({ archivadoEn: "procesadas", documentos: [{ estado: "cargada", nuevo: false }] });
    expect(modelo.desdeCache + modelo.nuevas).toBe(llamadas);
    expect(destino.cabecera).toHaveLength(1);
  });

  it("aprobar después de un corte entre cargar y guardar no queda trabado", async () => {
    const d = await demo();
    const id = idDe("E01");
    const doc = (await d.almacen.obtener(id))!;
    const corregida: Factura = { ...doc.extraida!, total: Math.round((doc.extraida!.total - 1000) * 100) / 100 };
    await d.destino.cargar(corregida, { documentoId: id, origen: "revision" }); // se cargó, pero el estado no se guardó
    expect(await aprobar(d, id, corregida)).toMatchObject({ ok: true, doc: { estado: "aprobada" } });
    expect(d.destino.cabecera.filter((f) => f[0] === claveFactura(corregida))).toHaveLength(1);
  });

  it("Sheets: si los ítems ya quedaron escritos, al reintentar solo agrega la cabecera", async () => {
    const f = leerGolden("F01").factura;
    const agregadas: string[] = [];
    const s = {
      leer: async (_id: string, rango: string) => (rango.startsWith("Ítems") ? [[claveFactura(f)]] : []),
      agregar: async (_id: string, pestana: string, filas: unknown[][]) => (agregadas.push(pestana), filas.length),
    } as unknown as ClienteSheets;
    expect(await crearDestinoSheets(s, "ID").cargar(f, { documentoId: "d1", origen: "automatica" })).toBe("cargada");
    expect(agregadas).toEqual(["Cabecera"]);
  });
});
