// Pedidos a las APIs de Google (Gmail, Sheets, OAuth) con errores tipados, timeout y reintentos solo cuando es seguro:
// red, timeout, 429, 502, 503 y 504, con backoff y jitter (o el Retry-After si viene). Un pedido que crea algo
// (enviar un mail, agregar filas) no se reintenta: lo marca quien llama con `reintentable: false`.
import type { z } from "zod";

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export type TipoErrorGoogle = "autenticacion" | "no_encontrado" | "limite" | "caido" | "red" | "pedido" | "esquema";

export class ErrorGoogle extends Error {
  constructor(
    readonly tipo: TipoErrorGoogle,
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "ErrorGoogle";
  }
}

export interface OpcionesPedido {
  fetch?: Fetch;
  token?: () => Promise<string>;
  timeoutMs?: number;
  /** false para los pedidos que crean algo y no tienen clave de idempotencia. */
  reintentable?: boolean;
  intentos?: number;
  esperar?: (ms: number) => Promise<void>;
  azar?: () => number;
}

const REINTENTABLES = new Set([429, 502, 503, 504]);
/** Tope de espera entre intentos aunque el Retry-After pida más (un pedido de la web no puede quedar colgado). */
const ESPERA_MAXIMA = 60_000;
const esperarReal = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Backoff con jitter completo: entre 0 y min(30 s, 500 ms × 2^intento). */
export const espera = (intento: number, azar = Math.random) => Math.round(azar() * Math.min(30_000, 500 * 2 ** intento));

/** Retry-After en segundos o como fecha HTTP. */
export function retryAfterMs(valor: string | null): number | null {
  if (!valor) return null;
  const s = Number(valor);
  if (Number.isFinite(s)) return Math.max(0, s * 1000);
  const t = Date.parse(valor);
  return Number.isNaN(t) ? null : Math.max(0, t - Date.now());
}

/** Pide, valida la respuesta con el schema y devuelve el dato tipado. Los mensajes de error no incluyen tokens. */
export async function pedirGoogle<T>(url: string, init: RequestInit, schema: z.ZodType<T>, op: OpcionesPedido = {}): Promise<T> {
  const pedir = op.fetch ?? fetch;
  const intentos = op.reintentable === false ? 1 : (op.intentos ?? 5);
  const esperar = op.esperar ?? esperarReal;
  const ruta = new URL(url).pathname;
  let ultimo: ErrorGoogle = new ErrorGoogle("red", `Sin respuesta de ${ruta}`);
  for (let i = 0; i < intentos; i++) {
    const headers = new Headers(init.headers);
    if (op.token) headers.set("Authorization", `Bearer ${await op.token()}`);
    let r: Response;
    try {
      r = await pedir(url, { ...init, headers, signal: AbortSignal.timeout(op.timeoutMs ?? 10_000) });
    } catch (e) {
      ultimo = new ErrorGoogle("red", `${ruta}: ${e instanceof Error ? e.name : "error de red"}`);
      if (i < intentos - 1) await esperar(espera(i + 1, op.azar));
      continue;
    }
    if (r.ok) {
      // Un 2xx que no es JSON no se toma como vacío: los schemas con valores por defecto lo aceptarían.
      const cuerpo = r.status === 204 ? {} : await r.json().catch(() => undefined);
      if (cuerpo === undefined) throw new ErrorGoogle("esquema", `${ruta}: la respuesta no es JSON`, r.status);
      const p = schema.safeParse(cuerpo);
      if (!p.success) throw new ErrorGoogle("esquema", `${ruta}: la respuesta no tiene la forma esperada (${p.error.issues[0]?.path.join(".")})`, r.status);
      return p.data;
    }
    const cuerpo = (await r.json().catch(() => null)) as { error?: { message?: string; status?: string; errors?: { reason?: string }[] } | string } | null;
    const detalle = cuerpo?.error;
    const razon = typeof detalle === "object" ? (detalle?.errors?.[0]?.reason ?? detalle?.status) : detalle;
    const msg = `${ruta}: HTTP ${r.status}${razon ? ` ${razon}` : ""}`;
    // Gmail y Sheets avisan el límite también con 403 (rateLimitExceeded, userRateLimitExceeded): se trata como 429.
    const esLimite = r.status === 429 || (r.status === 403 && /ratelimit|quota/i.test(String(razon)));
    // OAuth: un refresh token vencido o revocado responde 400 invalid_grant.
    if (r.status === 400 && razon === "invalid_grant") throw new ErrorGoogle("autenticacion", `${msg}: hay que volver a autorizar (npm run google:autorizar)`, r.status);
    if ((r.status === 401 || r.status === 403) && !esLimite) throw new ErrorGoogle("autenticacion", msg, r.status);
    if (r.status === 404) throw new ErrorGoogle("no_encontrado", msg, r.status);
    if (!esLimite && !REINTENTABLES.has(r.status)) throw new ErrorGoogle(r.status >= 500 ? "caido" : "pedido", msg, r.status);
    ultimo = new ErrorGoogle(esLimite ? "limite" : "caido", msg, r.status);
    if (i < intentos - 1) await esperar(Math.min(ESPERA_MAXIMA, retryAfterMs(r.headers.get("retry-after")) ?? espera(i + 1, op.azar)));
  }
  throw ultimo;
}
