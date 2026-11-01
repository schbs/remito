// Token de acceso de Google a partir del refresh token de la casilla de demo (OAuth de "app de escritorio"). Se guarda
// en memoria hasta un minuto antes de vencer. El refresh token vive solo en el archivo local de variables.
import { z } from "zod";
import { pedirGoogle, type Fetch } from "./http";

export const URL_TOKEN = "https://oauth2.googleapis.com/token";
export const ALCANCES = ["https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/spreadsheets"];

const respuestaToken = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() });

export interface CredencialesGoogle {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export function crearToken(c: CredencialesGoogle, op: { fetch?: Fetch; ahora?: () => number } = {}): () => Promise<string> {
  const ahora = op.ahora ?? Date.now;
  let actual: { token: string; vence: number } | null = null;
  return async () => {
    if (actual && actual.vence - 60_000 > ahora()) return actual.token;
    const r = await pedirGoogle(
      URL_TOKEN,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", client_id: c.clientId, client_secret: c.clientSecret, refresh_token: c.refreshToken }).toString() },
      respuestaToken,
      { fetch: op.fetch },
    );
    actual = { token: r.access_token, vence: ahora() + r.expires_in * 1000 };
    return actual.token;
  };
}
