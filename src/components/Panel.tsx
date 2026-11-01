// Bandeja: contadores, los documentos procesados como rótulos y la planilla (pestaña Cabecera).
import Link from "next/link";
import { servicio } from "@/bandeja/servicio";
import type { DocumentoBandeja, EstadoDocumento } from "@/bandeja/tipos";
import { numeroComprobante } from "@/factura/esquema";
import { monto } from "@/i18n/problemas";
import { TEXTOS, type Idioma } from "@/i18n/textos";
import { Marco } from "./Marco";

export const ICONO: Record<EstadoDocumento, string> = { pendiente: "…", cargada: "✓", excepcion: "!", aprobada: "✓", rechazada: "✕" };

export function Estado({ estado, idioma }: { estado: EstadoDocumento; idioma: Idioma }) {
  const estilo = estado === "excepcion" ? "bg-lima" : estado === "rechazada" ? "bg-alerta-suave text-alerta" : "border-2 border-control text-control";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-sm font-semibold ${estilo}`}>
      <span aria-hidden="true">{ICONO[estado]}</span>
      {TEXTOS[idioma].estados[estado]}
    </span>
  );
}

const ordenar = (docs: DocumentoBandeja[]) => [...docs].sort((a, b) => b.mensaje.recibido.localeCompare(a.mensaje.recibido) || a.id.localeCompare(b.id));

export async function Panel({ idioma }: { idioma: Idioma }) {
  const t = TEXTOS[idioma];
  const s = await servicio();
  const docs = ordenar(await s.almacen.listar());
  const cuenta = (e: EstadoDocumento) => docs.filter((d) => d.estado === e).length;
  const hora = (iso: string) => new Date(iso).toLocaleString(t.locale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
  const factura = (d: DocumentoBandeja) => d.cargada ?? d.extraida;

  return (
    <Marco idioma={idioma} modo={s.modo} actual="panel" pendientes={cuenta("excepcion")} otroHref={t.otroIdioma.href}>
      <h1 className="font-display text-3xl font-bold tracking-tight uppercase sm:text-4xl">{t.panel.titulo}</h1>
      <p className="mt-2 max-w-3xl text-grafito-suave">{t.panel.bajada}</p>

      <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(["cargada", "excepcion", "aprobada", "rechazada"] as const).map((e) => (
          <div key={e} className={`border-2 border-cinta p-4 ${e === "excepcion" && cuenta(e) ? "bg-lima" : "bg-papel"}`}>
            <dt className="text-sm font-semibold">{t.panel.contadores[e === "cargada" ? "cargadas" : e === "excepcion" ? "excepciones" : e === "aprobada" ? "aprobadas" : "rechazadas"]}</dt>
            <dd className="font-display text-5xl leading-none font-bold tabular-nums">{cuenta(e)}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section aria-labelledby="titulo-lista" className="min-w-0">
          <h2 id="titulo-lista" className="font-display text-2xl font-bold uppercase">
            {t.panel.lista}
          </h2>
          <ul className="mt-3 grid gap-3">
            {docs.map((d) => {
              const f = factura(d);
              return (
                <li key={d.id} className="border-2 border-cinta bg-papel p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{f?.proveedor.razonSocial ?? d.mensaje.asunto}</p>
                      <p className="text-sm text-grafito-suave">
                        {f ? `${f.tipo} ${numeroComprobante(f)} · ` : ""}
                        {t.panel.recibido} {hora(d.mensaje.recibido)}
                      </p>
                    </div>
                    <Estado estado={d.estado} idioma={idioma} />
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-2">
                    <p className="font-display text-2xl font-bold tabular-nums">{f ? monto(f.total, idioma) : "—"}</p>
                    {d.estado === "excepcion" ? (
                      <Link href={`${t.base}/revision?doc=${encodeURIComponent(d.id)}`} className="inline-flex min-h-11 items-center border-2 border-cinta px-3 font-semibold hover:bg-hormigon">
                        {t.panel.irRevision}
                        <span className="sr-only">: {f?.proveedor.razonSocial ?? d.mensaje.asunto}</span>
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="titulo-planilla" className="min-w-0">
          <h2 id="titulo-planilla" className="font-display text-2xl font-bold uppercase">
            {t.planilla.titulo}
          </h2>
          <p className="mt-1 text-sm text-grafito-suave">{s.planilla ? t.planilla.bajada : t.planilla.real}</p>
          {s.planilla ? (
            // Con teclado se puede enfocar y desplazar la tabla en el celular (axe: scrollable-region-focusable).
            <div tabIndex={0} role="region" aria-labelledby="titulo-planilla" className="mt-3 overflow-x-auto border-2 border-cinta bg-papel">
              <table className="w-full min-w-xl border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-cinta">
                    {t.planilla.columnas.map((c, i) => (
                      <th key={c} scope="col" className={`px-3 py-2 font-semibold ${i === 3 ? "text-right" : ""}`}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.planilla.cabecera.map((f) => (
                    <tr key={String(f[0])} className="border-b border-linea">
                      <td className="px-3 py-2">{f[2]}</td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                        {f[4]} {f[5]}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{f[6]}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{monto(Number(f[12]), idioma)}</td>
                      <td className="px-3 py-2">{idioma === "es" ? f[13] : f[13] === "automática" ? "automatic" : "human review"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {s.planilla.cabecera.length === 0 ? <p className="p-3">{t.planilla.vacia}</p> : null}
            </div>
          ) : null}
        </section>
      </div>
    </Marco>
  );
}
