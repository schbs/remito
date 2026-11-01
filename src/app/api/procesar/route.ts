// Demo: { accion: "reiniciar" } vuelve los 10 mails al inicio. Real: { accion: "procesar" } lee Gmail ahora.
import { reiniciarDemo, servicio } from "@/bandeja/servicio";
import { rechazo } from "@/lib/guardia";

export async function POST(pedido: Request) {
  const r = rechazo(pedido);
  if (r) return r;
  const { accion } = ((await pedido.json().catch(() => ({}))) ?? {}) as { accion?: string };
  const s = await servicio();
  if (accion === "reiniciar" && s.modo === "demo") {
    await reiniciarDemo();
    return Response.json({ ok: true });
  }
  if (accion === "procesar" && s.modo === "real") {
    // El candado de archivo (src/bandeja/real.ts) evita correr a la vez que `npm run procesar`.
    try {
      const resumen = await s.procesar();
      return Response.json({ ok: true, mensajes: resumen.length, documentos: resumen.flatMap((m) => m.documentos).filter((d) => d.nuevo).length });
    } catch (e) {
      const ocupado = e instanceof Error && e.message.startsWith("Ya hay otro proceso");
      console.error("procesar falló:", e instanceof Error ? e.message : e);
      return Response.json({ error: ocupado ? "Ya se está leyendo la casilla." : "No se pudo leer la casilla." }, { status: ocupado ? 429 : 502 });
    }
  }
  return Response.json({ error: "Acción no disponible en este modo." }, { status: 400 });
}
