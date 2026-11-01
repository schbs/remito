// Manda los 10 mails de la demo (facturas FICTICIAS adjuntas) a la casilla de demo, desde ella misma, y les pone la
// etiqueta "facturas/entrada" (en la realidad lo haría un filtro de Gmail). El único destino permitido es la casilla
// autorizada: GMAIL_DEMO tiene que coincidir con el perfil de Gmail del refresh token, y `enviar` rechaza cualquier
// otro destinatario. Nunca se manda a terceros.
// Idempotente: cada mail lleva un Message-ID fijo (<remito-demo-F01@remito.demo>); antes de mandarlo se busca y, si
// ya está, solo se asegura la etiqueta. Si se corta a mitad de camino, correrlo de nuevo completa lo que falta.
// Uso: npx tsx scripts/send-demo-mails.ts
import path from "node:path";
import { asuntoDe, leerGolden, mensajesDemo, SET_DEMO } from "../src/bandeja/demo";
import { clientesGoogle, ETIQUETAS } from "../src/bandeja/real";
import { cargar, exigir } from "./lib/variables.mjs";

const limpio = (s: string) => s.replace(/[\r\n]/g, " ");
const encabezadoUtf8 = (s: string) => `=?UTF-8?B?${Buffer.from(limpio(s)).toString("base64")}?=`;
export const messageIdDemo = (id: string) => `<remito-demo-${id}@remito.demo>`;

/** Mail RFC 822 con un texto y un adjunto. */
export function armarMail(o: { de: string; para: string; asunto: string; texto: string; messageId?: string; adjunto: { nombre: string; mimeType: string; contenido: Buffer } }): Buffer {
  const borde = `remito-${Math.random().toString(36).slice(2)}`;
  const partes = [
    `From: ${limpio(o.de)}`,
    `To: ${limpio(o.para)}`,
    `Subject: ${encabezadoUtf8(o.asunto)}`,
    ...(o.messageId ? [`Message-ID: ${limpio(o.messageId)}`] : []),
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${borde}"`,
    "",
    `--${borde}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(o.texto).toString("base64"),
    `--${borde}`,
    `Content-Type: ${o.adjunto.mimeType}; name="${o.adjunto.nombre}"`,
    `Content-Disposition: attachment; filename="${o.adjunto.nombre}"`,
    "Content-Transfer-Encoding: base64",
    "",
    o.adjunto.contenido.toString("base64").replace(/.{76}/g, "$&\r\n"),
    `--${borde}--`,
    "",
  ];
  return Buffer.from(partes.join("\r\n"));
}

async function main() {
  cargar();
  exigir(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "GMAIL_DEMO"], "Primero: node scripts/autorizar-google.mjs");
  const casilla = process.env.GMAIL_DEMO!.trim();
  const { gmail } = clientesGoogle();
  const autorizada = await gmail.perfil();
  if (autorizada.toLowerCase() !== casilla.toLowerCase()) {
    console.error("GMAIL_DEMO no coincide con la casilla autorizada: no se manda nada. Volvé a correr npm run google:autorizar.");
    process.exit(1);
  }
  const permitidos = [autorizada];
  const etiquetas = await gmail.asegurarEtiquetas(Object.values(ETIQUETAS));
  const mensajes = mensajesDemo();
  for (const [i, id] of SET_DEMO.entries()) {
    const messageId = messageIdDemo(id);
    const existentes = await gmail.buscar(`rfc822msgid:${messageId}`);
    if (existentes.length) {
      // Ya se mandó (quizás se cortó antes de etiquetarlo): solo se asegura la etiqueta si todavía no se procesó.
      const m = await gmail.leer(existentes[0]);
      const ids = Object.values(etiquetas);
      if (!m.etiquetas.some((e) => ids.includes(e))) await gmail.mover(m.id, [etiquetas[ETIQUETAS.entrada]], []);
      console.log(`${String(i + 1).padStart(2)}. ${id} → ya estaba en la casilla, no se manda de nuevo`);
      continue;
    }
    const g = leerGolden(id);
    const adj = mensajes[i].adjuntos[0];
    const crudo = armarMail({
      de: autorizada,
      para: autorizada,
      asunto: asuntoDe(g.factura, id === "E05"),
      messageId,
      texto: `Adjuntamos la factura ${path.basename(g.archivo)}.\n\nMail de demostración de Remito: la factura y el proveedor son FICTICIOS.`,
      adjunto: { nombre: adj.nombre, mimeType: adj.mimeType, contenido: await adj.leer() },
    });
    const enviado = await gmail.enviar(crudo, autorizada, permitidos);
    await gmail.mover(enviado, [etiquetas[ETIQUETAS.entrada]], []);
    console.log(`${String(i + 1).padStart(2)}. ${id} → enviado a la casilla de demo y etiquetado "${ETIQUETAS.entrada}"`);
  }
  console.log(`\nListo. Ahora: npm run procesar`);
}

if (process.argv[1]?.includes("send-demo-mails")) {
  void main().catch((e) => {
    console.error("Falló:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
