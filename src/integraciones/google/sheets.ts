// Cliente mínimo de la Sheets API v4 (REST): crear la planilla con sus pestañas, leer una columna y agregar filas.
// Doc: developers.google.com/workspace/sheets/api/reference/rest (consultada el 31/10/2026).
import { z } from "zod";
import { ErrorGoogle, pedirGoogle, type OpcionesPedido } from "./http";

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const creadaSchema = z.object({ spreadsheetId: z.string(), spreadsheetUrl: z.string().optional() });
const valoresSchema = z.object({ values: z.array(z.array(z.union([z.string(), z.number(), z.boolean()]))).default([]) });
const appendSchema = z.object({ updates: z.object({ updatedRows: z.number() }) });

export type Celda = string | number;

export function crearSheets(op: Pick<OpcionesPedido, "fetch" | "token" | "esperar" | "azar">) {
  return {
    /** Planilla nueva con las pestañas pedidas y sus encabezados. */
    async crear(titulo: string, pestanas: Record<string, string[]>): Promise<{ id: string; url: string }> {
      const r = await pedirGoogle(
        BASE,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ properties: { title: titulo, locale: "es_AR" }, sheets: Object.keys(pestanas).map((t) => ({ properties: { title: t, gridProperties: { frozenRowCount: 1 } } })) }) },
        creadaSchema,
        { ...op, reintentable: false },
      );
      for (const [t, encabezados] of Object.entries(pestanas)) await this.agregar(r.spreadsheetId, t, [encabezados]);
      return { id: r.spreadsheetId, url: r.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${r.spreadsheetId}` };
    },

    /** Valores de un rango ("Cabecera!A2:A"). */
    async leer(id: string, rango: string): Promise<Celda[][]> {
      const r = await pedirGoogle(`${BASE}/${encodeURIComponent(id)}/values/${encodeURIComponent(rango)}`, { method: "GET" }, valoresSchema, op);
      return r.values.map((f) => f.map((c) => (typeof c === "boolean" ? String(c) : c)));
    },

    /** Agrega filas al final de la pestaña. No se reintenta: quien llama controla los duplicados por clave antes. */
    async agregar(id: string, pestana: string, filas: Celda[][]): Promise<number> {
      const q = new URLSearchParams({ valueInputOption: "RAW", insertDataOption: "INSERT_ROWS" });
      const r = await pedirGoogle(`${BASE}/${encodeURIComponent(id)}/values/${encodeURIComponent(`${pestana}!A1`)}:append?${q}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: filas }) }, appendSchema, { ...op, reintentable: false });
      if (r.updates.updatedRows !== filas.length) throw new ErrorGoogle("esquema", `Sheets agregó ${r.updates.updatedRows} filas de ${filas.length}`);
      return r.updates.updatedRows;
    },
  };
}

export type ClienteSheets = ReturnType<typeof crearSheets>;
