// Cliente mínimo de la Gmail API v1 (REST) para la casilla de demo: etiquetas, mensajes con adjuntos, mover entre
// etiquetas y enviar. Doc: developers.google.com/workspace/gmail/api/reference/rest (consultada el 31/10/2026).
import { z } from "zod";
import { pedirGoogle, type OpcionesPedido } from "./http";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

const etiquetasSchema = z.object({ labels: z.array(z.object({ id: z.string(), name: z.string() })).default([]) });
const etiquetaSchema = z.object({ id: z.string(), name: z.string() });
const listaSchema = z.object({ messages: z.array(z.object({ id: z.string() })).default([]), nextPageToken: z.string().optional() });

interface Parte {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: Parte[];
}
const parteSchema: z.ZodType<Parte> = z.lazy(() =>
  z.object({
    partId: z.string().optional(),
    mimeType: z.string().optional(),
    filename: z.string().optional(),
    headers: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
    body: z.object({ attachmentId: z.string().optional(), size: z.number().optional(), data: z.string().optional() }).optional(),
    parts: z.array(parteSchema).optional(),
  }),
);
const mensajeSchema = z.object({ id: z.string(), labelIds: z.array(z.string()).default([]), internalDate: z.string().optional(), payload: parteSchema });
const adjuntoSchema = z.object({ data: z.string(), size: z.number().optional() });
const vacioSchema = z.looseObject({});

export interface AdjuntoGmail {
  nombre: string;
  mimeType: string;
  attachmentId: string;
}

export interface MensajeGmail {
  id: string;
  asunto: string;
  de: string;
  recibido: string;
  etiquetas: string[];
  adjuntos: AdjuntoGmail[];
}

/** base64url → Buffer (Gmail usa el alfabeto URL-safe). */
export const deBase64Url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
export const aBase64Url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Adjuntos de un mensaje (recorre las partes anidadas). */
export function adjuntosDe(p: Parte): AdjuntoGmail[] {
  const propios = p.filename && p.body?.attachmentId ? [{ nombre: p.filename, mimeType: p.mimeType ?? "application/octet-stream", attachmentId: p.body.attachmentId }] : [];
  return [...propios, ...(p.parts ?? []).flatMap(adjuntosDe)];
}

/** Lista de destinos permitidos: en modo demo nada sale de la casilla de demo. */
export function exigirDestinoPermitido(para: string, permitidos: readonly string[]): void {
  const normal = (s: string) => s.trim().toLowerCase();
  if (!permitidos.length || !permitidos.map(normal).includes(normal(para))) throw new Error(`Destino no permitido: ${para.replace(/[\r\n]/g, " ")}`);
}

const encabezado = (p: Parte, nombre: string) => p.headers?.find((h) => h.name.toLowerCase() === nombre.toLowerCase())?.value ?? "";

export function crearGmail(op: Pick<OpcionesPedido, "fetch" | "token" | "esperar" | "azar">) {
  const get = <T>(ruta: string, schema: z.ZodType<T>) => pedirGoogle(`${BASE}${ruta}`, { method: "GET" }, schema, op);
  const post = <T>(ruta: string, cuerpo: unknown, schema: z.ZodType<T>, reintentable: boolean) => pedirGoogle(`${BASE}${ruta}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) }, schema, { ...op, reintentable });

  return {
    /** Ids de las etiquetas pedidas; crea las que falten ("facturas/entrada" se muestra anidada en Gmail). */
    async asegurarEtiquetas(nombres: string[]): Promise<Record<string, string>> {
      const { labels } = await get("/labels", etiquetasSchema);
      const ids: Record<string, string> = {};
      for (const n of nombres) {
        const hay = labels.find((l) => l.name === n);
        ids[n] = hay ? hay.id : (await post("/labels", { name: n, labelListVisibility: "labelShow", messageListVisibility: "show" }, etiquetaSchema, false)).id;
      }
      return ids;
    },

    /** Mensajes con la etiqueta, paginando por cursor. */
    async listar(etiquetaId: string, maximo = 100): Promise<string[]> {
      const ids: string[] = [];
      let pagina: string | undefined;
      do {
        const q = new URLSearchParams({ labelIds: etiquetaId, maxResults: String(Math.min(50, maximo)) });
        if (pagina) q.set("pageToken", pagina);
        const r = await get(`/messages?${q}`, listaSchema);
        ids.push(...r.messages.map((m) => m.id));
        pagina = r.nextPageToken;
      } while (pagina && ids.length < maximo);
      return ids.slice(0, maximo);
    },

    async leer(id: string): Promise<MensajeGmail> {
      const m = await get(`/messages/${encodeURIComponent(id)}?format=full`, mensajeSchema);
      return {
        id: m.id,
        asunto: encabezado(m.payload, "Subject"),
        de: encabezado(m.payload, "From"),
        recibido: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : "",
        etiquetas: m.labelIds,
        adjuntos: adjuntosDe(m.payload),
      };
    },

    async adjunto(mensajeId: string, attachmentId: string): Promise<Buffer> {
      const r = await get(`/messages/${encodeURIComponent(mensajeId)}/attachments/${encodeURIComponent(attachmentId)}`, adjuntoSchema);
      return deBase64Url(r.data);
    },

    /** Cambiar etiquetas es idempotente: se puede reintentar. */
    async mover(mensajeId: string, agregar: string[], quitar: string[]): Promise<void> {
      await post(`/messages/${encodeURIComponent(mensajeId)}/modify`, { addLabelIds: agregar, removeLabelIds: quitar }, vacioSchema, true);
    },

    /** Dirección de la casilla autorizada (la del refresh token). */
    async perfil(): Promise<string> {
      return (await get("/profile", z.object({ emailAddress: z.string() }))).emailAddress;
    },

    /** Ids de los mensajes que coinciden con una búsqueda de Gmail (por ejemplo "rfc822msgid:<…>"). */
    async buscar(q: string): Promise<string[]> {
      return (await get(`/messages?${new URLSearchParams({ q, maxResults: "10" })}`, listaSchema)).messages.map((m) => m.id);
    },

    /**
     * Envía un mail RFC 822 ya armado, solo si el destinatario está en la lista permitida (en la demo, la casilla de demo
     * misma). No se reintenta: la idempotencia la da el Message-ID fijo que busca quien llama antes de enviar.
     */
    async enviar(rfc822: Buffer, para: string, permitidos: readonly string[]): Promise<string> {
      exigirDestinoPermitido(para, permitidos);
      const r = await post("/messages/send", { raw: aBase64Url(rfc822) }, z.object({ id: z.string() }), false);
      return r.id;
    },
  };
}

export type ClienteGmail = ReturnType<typeof crearGmail>;
