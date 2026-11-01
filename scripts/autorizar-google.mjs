// Autoriza a Remito a usar la casilla de demo (Gmail) y Google Sheets, con OAuth de "app de escritorio" y PKCE.
// Abre el navegador; Germán entra con la casilla de demo y acepta. El refresh token se guarda en el archivo local de
// variables sin imprimirse; también se guarda la dirección de la casilla (GMAIL_DEMO), que es el único destino
// permitido para los mails de prueba.
// Antes: GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el archivo local (los copia Germán del cliente OAuth).
// Uso: node scripts/autorizar-google.mjs
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import http from "node:http";
import { cargar, exigir, guardar } from "./lib/variables.mjs";

const escapar = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const ALCANCES = ["https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/spreadsheets"];

cargar();
exigir(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], "Copialos del cliente OAuth de Google Cloud al archivo local de variables (ver notas/pendientes.md).");

const verificador = crypto.randomBytes(48).toString("base64url");
const desafio = crypto.createHash("sha256").update(verificador).digest("base64url");
const estado = crypto.randomBytes(16).toString("hex");

const servidor = http.createServer();
servidor.listen(0, "127.0.0.1", () => {
  const { port } = servidor.address();
  const redirect = `http://127.0.0.1:${port}/callback`;
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirect, response_type: "code", scope: ALCANCES.join(" "), access_type: "offline", prompt: "consent", code_challenge: desafio, code_challenge_method: "S256", state: estado })}`;
  console.log("Abrí este enlace, entrá con la casilla de DEMO (no con tu mail personal) y aceptá los permisos:\n");
  console.log(url + "\n");
  if (process.platform === "win32") execFile("cmd", ["/c", "start", "", url.replace(/&/g, "^&")]);

  servidor.on("request", async (req, res) => {
    const u = new URL(req.url ?? "/", redirect);
    if (u.pathname !== "/callback") return void res.writeHead(404).end();
    const fin = (codigo, texto) => {
      res.writeHead(codigo, { "Content-Type": "text/html; charset=utf-8" }).end(`<p style="font:16px system-ui;margin:2rem">${texto}</p>`);
      servidor.close();
    };
    if (u.searchParams.get("state") !== estado) return fin(400, "El estado no coincide: volvé a correr el script.");
    if (u.searchParams.get("error")) return fin(400, `Google respondió: ${escapar(u.searchParams.get("error"))}. Volvé a correr el script.`);
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(15_000),
      body: new URLSearchParams({ grant_type: "authorization_code", code: u.searchParams.get("code") ?? "", redirect_uri: redirect, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, code_verifier: verificador }),
    }).catch(() => null);
    if (!r) return fin(500, "Google no respondió a tiempo. Volvé a correr el script.");
    const t = await r.json().catch(() => ({}));
    if (!r.ok || !t.refresh_token) {
      console.error(`No se obtuvo el refresh token (HTTP ${r.status}${t.error ? ` ${t.error}` : ""}).`);
      return fin(500, "No se pudo completar la autorización. Mirá la terminal.");
    }
    const perfil = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(15_000) }).then((x) => x.json()).catch(() => ({}));
    guardar({ GOOGLE_REFRESH_TOKEN: t.refresh_token, ...(perfil.emailAddress ? { GMAIL_DEMO: perfil.emailAddress } : {}) });
    console.log(`Listo: refresh token guardado (no se muestra). Casilla autorizada: ${perfil.emailAddress ?? "(no se pudo leer)"}.`);
    fin(200, "Listo. Ya podés cerrar esta pestaña y volver a la terminal.");
  });
});
