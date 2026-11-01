// Cliente mínimo de Gemini (REST generateContent) con salida JSON según un schema, adjuntos (PDF o imagen) inline,
// timeout y reintentos con backoff. También un caché de respuestas grabadas: la medición se puede repetir sin cuota.
// Base: el cliente de Fojas y Radar, con adjuntos sumados.

export interface Uso {
  entrada: number;
  salida: number;
}

export interface RespuestaJson {
  json: unknown;
  uso: Uso;
  /** Milisegundos que tardó el pedido real (0 si vino del caché). */
  ms?: number;
}

export interface Adjunto {
  mimeType: "application/pdf" | "image/png" | "image/jpeg";
  /** Contenido en base64. */
  base64: string;
}

export interface PedidoJson {
  sistema: string;
  usuario: string;
  schema: Record<string, unknown>;
  adjuntos?: Adjunto[];
}

export interface ModeloJson {
  nombre: string;
  generar(pedido: PedidoJson): Promise<RespuestaJson>;
}

// Flash-Lite: rápido y con su propio cupo gratis (gemini-3.5-flash da solo 20 pedidos por día en el plan gratis).
export const MODELO_POR_DEFECTO = "gemini-3.5-flash-lite";

/** Plan pago de Gemini Flash-Lite, USD por millón de tokens (ai.google.dev/gemini-api/docs/pricing, 31/10/2026). */
export const PRECIO = { entrada: 0.3, salida: 2.5 };
export const costoUsd = (u: Uso) => (u.entrada * PRECIO.entrada + u.salida * PRECIO.salida) / 1e6;

export class CupoAgotado extends Error {}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** "Please retry in 12h9m7.8s" → segundos. 0 si el mensaje no lo dice. */
export function segundosDeEspera(mensaje: string): number {
  const m = mensaje.match(/retry in (?:(\d+)h)?(?:(\d+)m)?([\d.]+)s/);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3]) : 0;
}

/** Backoff con jitter completo: entre 0 y min(30 s, 500 ms × 2^intento). */
export const esperaBackoff = (intento: number, azar = Math.random) => Math.round(azar() * Math.min(30_000, 500 * 2 ** intento));

/** Gemini acepta un subconjunto de JSON Schema: se saca la cabecera "$schema" que agrega Zod. */
function schemaParaGemini(schema: Record<string, unknown>): Record<string, unknown> {
  const resto = { ...schema };
  delete resto.$schema;
  return resto;
}

export function crearModeloGemini(opciones: { apiKey: string; modelo?: string; timeoutMs?: number; reintentos?: number; fetch?: typeof fetch }): ModeloJson {
  const nombre = opciones.modelo || MODELO_POR_DEFECTO;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${nombre}:generateContent`;
  const pedirA = opciones.fetch ?? fetch;

  return {
    nombre,
    async generar({ sistema, usuario, schema, adjuntos = [] }) {
      const cuerpo = JSON.stringify({
        systemInstruction: { parts: [{ text: sistema }] },
        contents: [{ role: "user", parts: [...adjuntos.map((a) => ({ inlineData: { mimeType: a.mimeType, data: a.base64 } })), { text: usuario }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseJsonSchema: schemaParaGemini(schema),
          thinkingConfig: { thinkingLevel: "low" },
        },
      });

      let ultimoError: unknown;
      for (let intento = 0; intento <= (opciones.reintentos ?? 4); intento++) {
        if (intento > 0) await esperar(esperaBackoff(intento));
        const t0 = Date.now();
        let r: Response;
        try {
          r = await pedirA(url, {
            method: "POST",
            headers: { "x-goog-api-key": opciones.apiKey, "Content-Type": "application/json" },
            body: cuerpo,
            signal: AbortSignal.timeout(opciones.timeoutMs ?? 60_000),
          });
        } catch (e) {
          ultimoError = e; // red o timeout: se reintenta
          continue;
        }
        if (r.status === 429) {
          const error = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
          const espera = segundosDeEspera(error?.error?.message ?? "");
          // Si pide esperar más de un minuto es el cupo diario: reintentar no sirve.
          if (espera > 60) throw new CupoAgotado(`Se terminó el cupo de Gemini (${nombre}); vuelve en ${Math.round(espera / 60)} min.`);
          ultimoError = new Error("Gemini respondió 429");
          await esperar(Math.max(espera, 1) * 1000);
          continue;
        }
        if (r.status >= 500) {
          ultimoError = new Error(`Gemini respondió ${r.status}`);
          continue;
        }
        const datos = (await r.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
          error?: { message?: string };
        };
        // Un 4xx que no es 429 no se reintenta: el pedido está mal y va a seguir igual.
        if (!r.ok) throw new Error(`Gemini respondió ${r.status}: ${datos.error?.message ?? "sin detalle"}`);
        const texto = datos.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
        try {
          return {
            json: JSON.parse(texto),
            uso: { entrada: datos.usageMetadata?.promptTokenCount ?? 0, salida: datos.usageMetadata?.candidatesTokenCount ?? 0 },
            ms: Date.now() - t0,
          };
        } catch {
          ultimoError = new Error("Gemini devolvió un JSON inválido");
        }
      }
      throw ultimoError instanceof Error ? ultimoError : new Error("Gemini no respondió");
    },
  };
}

/** Clave de un pedido: el mismo sistema, usuario, schema y adjuntos dan la misma clave (sirve para grabar y repetir). */
export async function clavePedido(p: PedidoJson, modelo: string): Promise<string> {
  const texto = JSON.stringify([modelo, p.sistema, p.usuario, p.schema, (p.adjuntos ?? []).map((a) => [a.mimeType, a.base64])]);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/**
 * Envuelve un modelo con un caché de respuestas por clave de pedido. Si el pedido ya se hizo, repite la respuesta
 * guardada (sin cuota); si no, y hay modelo real, lo pide y lo guarda. Sin modelo real, un pedido nuevo es un error.
 */
export function crearModeloConCache(grabadas: Record<string, RespuestaJson>, real?: ModeloJson, nombreModelo = MODELO_POR_DEFECTO): ModeloJson & { nuevas: number; desdeCache: number } {
  const envoltorio = {
    nombre: real?.nombre ?? nombreModelo,
    nuevas: 0,
    desdeCache: 0,
    async generar(pedido: PedidoJson) {
      const clave = await clavePedido(pedido, real?.nombre ?? nombreModelo);
      if (grabadas[clave]) {
        envoltorio.desdeCache++;
        return grabadas[clave];
      }
      if (!real) throw new Error(`No hay respuesta grabada para este pedido (${clave})`);
      const r = await real.generar(pedido);
      grabadas[clave] = r;
      envoltorio.nuevas++;
      return r;
    },
  };
  return envoltorio;
}
