// Revisión: las facturas pendientes arriba y, de la elegida, el documento original a la izquierda y los datos
// editables a la derecha, con lo que no cierra marcado con resaltador.
import Link from "next/link";
import sharp from "sharp";
import { ANCHO_VISTA } from "@/lib/vista";
import { servicio } from "@/bandeja/servicio";
import { numeroComprobante } from "@/factura/esquema";
import { monto } from "@/i18n/problemas";
import { TEXTOS, type Idioma } from "@/i18n/textos";
import { EditorRevision } from "./EditorRevision";
import { Marco } from "./Marco";

export async function Revision({ idioma, docId }: { idioma: Idioma; docId?: string }) {
  const t = TEXTOS[idioma];
  const s = await servicio();
  const todos = await s.almacen.listar();
  const pendientes = todos.filter((d) => d.estado === "excepcion").sort((a, b) => a.mensaje.recibido.localeCompare(b.mensaje.recibido) || a.id.localeCompare(b.id));
  const elegido = todos.find((d) => d.id === docId) ?? pendientes[0] ?? null;
  const siguiente = pendientes.find((d) => d.id !== elegido?.id) ?? null;
  const url = (id: string) => `${t.base}/revision?doc=${encodeURIComponent(id)}`;
  const otroHref = `${t.otroIdioma.href === "/" ? "" : t.otroIdioma.href}/revision${elegido ? `?doc=${encodeURIComponent(elegido.id)}` : ""}`;
  // Tamaño de la imagen (si el documento es una foto o un escaneo): el visor reserva el lugar y no salta (CLS).
  let dimensiones: { ancho: number; alto: number } | null = null;
  if (elegido && elegido.archivo.mimeType !== "application/pdf") {
    const archivo = await s.almacen.leerArchivo(elegido.id);
    const m = archivo ? await sharp(archivo).metadata() : null;
    if (m?.width && m.height) dimensiones = { ancho: Math.min(m.width, ANCHO_VISTA), alto: Math.round((m.height * Math.min(m.width, ANCHO_VISTA)) / m.width) };
  }

  return (
    <Marco idioma={idioma} modo={s.modo} actual="revision" pendientes={pendientes.length} otroHref={otroHref}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-3xl font-bold tracking-tight uppercase sm:text-4xl">{t.revision.titulo}</h1>
        <p className="font-semibold">{pendientes.length ? t.revision.pendientes(pendientes.length) : ""}</p>
      </div>

      {pendientes.length ? (
        <nav aria-label={t.revision.pendientes(pendientes.length)} className="mt-3 overflow-x-auto">
          <ul className="flex gap-2 pb-2">
            {pendientes.map((d) => {
              const f = d.extraida;
              return (
                <li key={d.id}>
                  <Link href={url(d.id)} aria-current={d.id === elegido?.id ? "page" : undefined} className={`block min-h-11 w-56 border-2 border-cinta px-3 py-2 text-sm ${d.id === elegido?.id ? "bg-lima" : "bg-papel hover:bg-hormigon"}`}>
                    <span className="block truncate font-semibold">{f?.proveedor.razonSocial ?? d.archivo.nombre}</span>
                    <span className="block tabular-nums">{f ? `${f.tipo} ${numeroComprobante(f)} · ${monto(f.total, idioma)}` : d.mensaje.asunto}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      {elegido ? (
        <EditorRevision
          key={elegido.id}
          idioma={idioma}
          doc={elegido}
          urlDocumento={`/api/documentos/${encodeURIComponent(elegido.id)}`}
          dimensiones={dimensiones}
          urlSiguiente={siguiente ? url(siguiente.id) : null}
        />
      ) : (
        <p className="mt-6 border-2 border-cinta bg-papel p-4">{t.revision.sinPendientes}</p>
      )}
    </Marco>
  );
}
