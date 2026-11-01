// Guardia común de las rutas de la API (la misma idea que en Radar): solo JSON y solo desde la misma página. En modo
// real, además, Host local: el modo real solo existe con `npm run dev:real`, que escucha en 127.0.0.1.
import "server-only";
import { modoRemito } from "@/bandeja/servicio";

const LOCALES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Para los GET que devuelven documentos: no piden JSON, pero sí que no los pida otro sitio (sec-fetch-site) y, en modo
 * real, Host local (contra un DNS rebinding que apunte un dominio externo a 127.0.0.1).
 */
export function rechazoLectura(pedido: Request): Response | null {
  const sitio = pedido.headers.get("sec-fetch-site");
  if (sitio === "cross-site") return new Response("Origen no permitido", { status: 403 });
  if (modoRemito() === "real" && !LOCALES.has(pedido.headers.get("host")?.replace(/:\d+$/, "") ?? "")) return new Response("El modo real solo se usa desde esta PC", { status: 403 });
  return null;
}

export function rechazo(pedido: Request): Response | null {
  if (!pedido.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return Response.json({ error: "Se espera JSON." }, { status: 415 });
  const sitio = pedido.headers.get("sec-fetch-site");
  if (sitio && sitio !== "same-origin" && sitio !== "none") return Response.json({ error: "Origen no permitido." }, { status: 403 });
  const origen = pedido.headers.get("origin");
  const host = pedido.headers.get("host");
  if (origen && (!host || URL.parse(origen)?.host !== host)) return Response.json({ error: "Origen no permitido." }, { status: 403 });
  if (modoRemito() === "real" && !LOCALES.has(host?.replace(/:\d+$/, "") ?? "")) return Response.json({ error: "El modo real solo se usa desde esta PC." }, { status: 403 });
  return null;
}
