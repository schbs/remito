// El archivo original de un documento de la bandeja (PDF o imagen), para el visor de la revisión. Con ?vista=1 una
// imagen sale como vista previa liviana (WebP de 900 px de ancho): carga rápido en el celular; el original sigue
// disponible sin el parámetro.
import sharp from "sharp";
import { servicio } from "@/bandeja/servicio";
import { rechazoLectura } from "@/lib/guardia";
import { ANCHO_VISTA } from "@/lib/vista";

export async function GET(pedido: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = rechazoLectura(pedido);
  if (r) return r;
  const { id } = await ctx.params;
  const s = await servicio();
  const doc = await s.almacen.obtener(id);
  const archivo = doc ? await s.almacen.leerArchivo(id) : null;
  if (!doc || !archivo) return new Response("No encontrado", { status: 404 });
  const vista = new URL(pedido.url).searchParams.get("vista") === "1" && doc.archivo.mimeType !== "application/pdf";
  const cuerpo = vista ? await sharp(archivo).resize({ width: ANCHO_VISTA, withoutEnlargement: true }).webp({ quality: 68 }).toBuffer() : archivo;
  return new Response(new Uint8Array(cuerpo), {
    headers: {
      "Content-Type": vista ? "image/webp" : doc.archivo.mimeType,
      "Content-Disposition": `inline; filename="${doc.archivo.nombre.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
