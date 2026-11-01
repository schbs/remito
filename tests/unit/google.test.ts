// Integración con Google sin llamadas reales: éxito, 401, 404, 429 con Retry-After, 5xx, timeout, respuesta con otra
// forma, pedidos que no se reintentan, token en caché, y Gmail/Sheets con fetch simulado.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { aBase64Url, adjuntosDe, crearGmail, deBase64Url, exigirDestinoPermitido } from "@/integraciones/google/gmail";
import { ErrorGoogle, pedirGoogle, retryAfterMs, type Fetch } from "@/integraciones/google/http";
import { crearToken } from "@/integraciones/google/oauth";
import { crearSheets } from "@/integraciones/google/sheets";

const json = (cuerpo: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json", ...headers } });

/** fetch falso que responde en orden y anota cada pedido. */
function fetchFalso(respuestas: (Response | Error)[]) {
  const pedidos: { url: string; init?: RequestInit }[] = [];
  const f: Fetch = async (url, init) => {
    pedidos.push({ url, init });
    const r = respuestas[Math.min(pedidos.length - 1, respuestas.length - 1)];
    if (r instanceof Error) throw r;
    return r.clone();
  };
  return Object.assign(f, { pedidos });
}

const esquema = z.object({ ok: z.literal(true) });
const URL_X = "https://gmail.googleapis.com/gmail/v1/users/me/x";
const sinEspera = { esperar: async () => undefined, azar: () => 0.5 };

describe("pedidos a Google", () => {
  it("éxito: valida la respuesta y manda el token", async () => {
    const f = fetchFalso([json({ ok: true })]);
    await expect(pedirGoogle(URL_X, { method: "GET" }, esquema, { fetch: f, token: async () => "tok" })).resolves.toEqual({ ok: true });
    expect(new Headers(f.pedidos[0].init?.headers).get("authorization")).toBe("Bearer tok");
  });

  it("401 es de autenticación y no se reintenta; 404 es no encontrado", async () => {
    const f = fetchFalso([json({ error: { status: "UNAUTHENTICATED" } }, 401)]);
    await expect(pedirGoogle(URL_X, {}, esquema, { fetch: f, ...sinEspera })).rejects.toMatchObject({ tipo: "autenticacion", status: 401 });
    expect(f.pedidos).toHaveLength(1);
    await expect(pedirGoogle(URL_X, {}, esquema, { fetch: fetchFalso([json({}, 404)]), ...sinEspera })).rejects.toMatchObject({ tipo: "no_encontrado" });
  });

  it("429 respeta el Retry-After y después sale bien", async () => {
    const esperas: number[] = [];
    const f = fetchFalso([json({}, 429, { "Retry-After": "2" }), json({ ok: true })]);
    await expect(pedirGoogle(URL_X, {}, esquema, { fetch: f, esperar: async (ms) => void esperas.push(ms) })).resolves.toEqual({ ok: true });
    expect(esperas).toEqual([2000]);
    expect(retryAfterMs("1.5")).toBe(1500);
  });

  it("503 se reintenta con backoff hasta 5 intentos y termina como proveedor caído", async () => {
    const f = fetchFalso([json({}, 503)]);
    await expect(pedirGoogle(URL_X, {}, esquema, { fetch: f, ...sinEspera })).rejects.toMatchObject({ tipo: "caido", status: 503 });
    expect(f.pedidos).toHaveLength(5);
  });

  it("timeout o red: se reintenta; un 500 que no está en la lista no", async () => {
    const f = fetchFalso([new DOMException("timeout", "TimeoutError"), json({ ok: true })]);
    await expect(pedirGoogle(URL_X, {}, esquema, { fetch: f, ...sinEspera })).resolves.toEqual({ ok: true });
    const g = fetchFalso([json({}, 500)]);
    await expect(pedirGoogle(URL_X, {}, esquema, { fetch: g, ...sinEspera })).rejects.toMatchObject({ tipo: "caido" });
    expect(g.pedidos).toHaveLength(1);
  });

  it("una respuesta con otra forma es un error de esquema", async () => {
    await expect(pedirGoogle(URL_X, {}, esquema, { fetch: fetchFalso([json({ ok: "si" })]) })).rejects.toBeInstanceOf(ErrorGoogle);
    await expect(pedirGoogle(URL_X, {}, esquema, { fetch: fetchFalso([json({ ok: "si" })]) })).rejects.toMatchObject({ tipo: "esquema" });
  });

  it("un pedido que crea algo no se reintenta aunque dé 503", async () => {
    const f = fetchFalso([json({}, 503)]);
    await expect(pedirGoogle(URL_X, { method: "POST" }, esquema, { fetch: f, reintentable: false, ...sinEspera })).rejects.toMatchObject({ status: 503 });
    expect(f.pedidos).toHaveLength(1);
  });

  it("el mensaje de error no incluye el token", async () => {
    const e = (await pedirGoogle(URL_X, {}, esquema, { fetch: fetchFalso([json({}, 403)]), token: async () => "secreto-123" }).catch((x: Error) => x)) as Error;
    expect(e.message).not.toContain("secreto-123");
  });
});

describe("OAuth", () => {
  it("pide el token una vez y lo reusa hasta un minuto antes de vencer", async () => {
    let t = 0;
    const f = fetchFalso([json({ access_token: "a1", expires_in: 3600 }), json({ access_token: "a2", expires_in: 3600 })]);
    const token = crearToken({ clientId: "c", clientSecret: "s", refreshToken: "r" }, { fetch: f, ahora: () => t });
    expect(await token()).toBe("a1");
    t = 3_000_000;
    expect(await token()).toBe("a1");
    t = 3_560_000;
    expect(await token()).toBe("a2");
    expect(f.pedidos).toHaveLength(2);
    expect(String(f.pedidos[0].init?.body)).toContain("grant_type=refresh_token");
  });
});

describe("Gmail", () => {
  it("encuentra los adjuntos en partes anidadas y decodifica base64url", () => {
    const partes = { mimeType: "multipart/mixed", parts: [{ mimeType: "text/plain", body: { data: "eA" } }, { mimeType: "multipart/alternative", parts: [{ filename: "F01.pdf", mimeType: "application/pdf", body: { attachmentId: "att1" } }] }] };
    expect(adjuntosDe(partes)).toEqual([{ nombre: "F01.pdf", mimeType: "application/pdf", attachmentId: "att1" }]);
    const b = Buffer.from([0xfb, 0xff, 0x10]);
    expect(aBase64Url(b)).toBe("-_8Q");
    expect(deBase64Url("-_8Q")).toEqual(b);
  });

  it("asegura etiquetas: usa las que hay y crea las que faltan", async () => {
    const f = fetchFalso([json({ labels: [{ id: "L1", name: "facturas/entrada" }] }), json({ id: "L2", name: "facturas/procesadas" })]);
    const g = crearGmail({ fetch: f, token: async () => "t" });
    expect(await g.asegurarEtiquetas(["facturas/entrada", "facturas/procesadas"])).toEqual({ "facturas/entrada": "L1", "facturas/procesadas": "L2" });
    expect(f.pedidos[1].init?.method).toBe("POST");
  });

  it("lista paginando por cursor y lee asunto, remitente y adjuntos", async () => {
    const f = fetchFalso([
      json({ messages: [{ id: "m1" }], nextPageToken: "p2" }),
      json({ messages: [{ id: "m2" }] }),
      json({ id: "m1", labelIds: ["L1"], internalDate: "1792000000000", payload: { headers: [{ name: "Subject", value: "Factura A 0003-00005146" }, { name: "From", value: "demo@example.com" }], parts: [{ filename: "F01.pdf", mimeType: "application/pdf", body: { attachmentId: "a1" } }] } }),
    ]);
    const g = crearGmail({ fetch: f, token: async () => "t" });
    expect(await g.listar("L1")).toEqual(["m1", "m2"]);
    expect(f.pedidos[1].url).toContain("pageToken=p2");
    expect(await g.leer("m1")).toMatchObject({ asunto: "Factura A 0003-00005146", de: "demo@example.com", adjuntos: [{ attachmentId: "a1" }] });
  });
});

describe("Sheets", () => {
  it("agrega filas con RAW al final de la pestaña y lee una columna", async () => {
    const f = fetchFalso([json({ updates: { updatedRows: 2 } }), json({ values: [["k1"], ["k2"]] })]);
    const s = crearSheets({ fetch: f, token: async () => "t" });
    expect(await s.agregar("ID", "Ítems", [["a"], ["b"]])).toBe(2);
    expect(decodeURIComponent(f.pedidos[0].url)).toContain("Ítems!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS");
    expect(await s.leer("ID", "Cabecera!A2:A")).toEqual([["k1"], ["k2"]]);
  });
});

describe("mail de demo (RFC 822)", () => {
  it("lleva el adjunto en base64 y el asunto codificado; no deja inyectar encabezados", async () => {
    const { armarMail } = await import("../../scripts/send-demo-mails");
    const crudo = armarMail({ de: "demo@example.com", para: "demo@example.com\r\nBcc: otro@example.com", asunto: "Factura A 0003-00005146 — Lácteos Ñire Sur S.A.", texto: "hola", adjunto: { nombre: "F01.pdf", mimeType: "application/pdf", contenido: Buffer.from("%PDF-1.7 prueba") } }).toString();
    expect(crudo).toContain('Content-Disposition: attachment; filename="F01.pdf"');
    expect(crudo).toContain(Buffer.from("%PDF-1.7 prueba").toString("base64"));
    expect(crudo).toContain("Subject: =?UTF-8?B?");
    expect(crudo).not.toMatch(/^Bcc:/m);
  });
});

describe("arreglos de la revisión de la integración", () => {
  it("un 2xx que no es JSON es error de esquema (no se toma como lista vacía)", async () => {
    const f = fetchFalso([new Response("<html>ok</html>", { status: 200 })]);
    await expect(pedirGoogle(URL_X, {}, z.object({ messages: z.array(z.string()).default([]) }), { fetch: f })).rejects.toMatchObject({ tipo: "esquema" });
  });

  it("refresh token revocado (400 invalid_grant) es de autenticación y dice cómo arreglarlo", async () => {
    const f = fetchFalso([json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400)]);
    const e = await pedirGoogle(URL_X, {}, esquema, { fetch: f }).catch((x: ErrorGoogle) => x);
    expect(e).toMatchObject({ tipo: "autenticacion" });
    expect((e as Error).message).toContain("google:autorizar");
  });

  it("un 403 por límite de Gmail se reintenta como 429; el Retry-After tiene tope de 60 s", async () => {
    const esperas: number[] = [];
    const f = fetchFalso([json({ error: { errors: [{ reason: "rateLimitExceeded" }] } }, 403, { "Retry-After": "3600" }), json({ ok: true })]);
    await expect(pedirGoogle(URL_X, {}, esquema, { fetch: f, esperar: async (ms) => void esperas.push(ms) })).resolves.toEqual({ ok: true });
    expect(esperas).toEqual([60_000]);
  });

  it("429 sin Retry-After usa el backoff con jitter", async () => {
    const esperas: number[] = [];
    const f = fetchFalso([json({}, 429), json({ ok: true })]);
    await pedirGoogle(URL_X, {}, esquema, { fetch: f, azar: () => 0.5, esperar: async (ms) => void esperas.push(ms) });
    expect(esperas).toEqual([500]);
  });

  it("Sheets: agregar y Gmail: enviar no se reintentan ante un 503; si Sheets agrega menos filas, es error", async () => {
    const f = fetchFalso([json({}, 503)]);
    await expect(crearSheets({ fetch: f, token: async () => "t" }).agregar("ID", "Cabecera", [["a"]])).rejects.toMatchObject({ status: 503 });
    expect(f.pedidos).toHaveLength(1);
    const g = fetchFalso([json({}, 503)]);
    await expect(crearGmail({ fetch: g, token: async () => "t" }).enviar(Buffer.from("x"), "demo@example.com", ["demo@example.com"])).rejects.toMatchObject({ status: 503 });
    expect(g.pedidos).toHaveLength(1);
    await expect(crearSheets({ fetch: fetchFalso([json({ updates: { updatedRows: 1 } })]), token: async () => "t" }).agregar("ID", "Ítems", [["a"], ["b"]])).rejects.toMatchObject({ tipo: "esquema" });
  });

  it("enviar rechaza cualquier destino que no esté en la lista permitida, sin hacer el pedido", async () => {
    const f = fetchFalso([json({ id: "m1" })]);
    const g = crearGmail({ fetch: f, token: async () => "t" });
    await expect(g.enviar(Buffer.from("x"), "tercero@example.com", ["demo@example.com"])).rejects.toThrow("Destino no permitido");
    await expect(g.enviar(Buffer.from("x"), "demo@example.com", [])).rejects.toThrow("Destino no permitido");
    expect(f.pedidos).toHaveLength(0);
    expect(() => exigirDestinoPermitido("DEMO@example.com ", ["demo@example.com"])).not.toThrow();
  });
});
