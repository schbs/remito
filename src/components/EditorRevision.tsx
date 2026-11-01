"use client";
// Revisión de una factura: el documento original al lado de los datos que leyó la IA, editables. Valida en vivo con
// los mismos validadores que el servidor: lo que no cierra queda marcado con resaltador y el motivo en pesos. La base
// de cada alícuota se recalcula con los renglones (no está impresa). Aprobar carga la factura en la planilla.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type { DocumentoBandeja } from "@/bandeja/tipos";
import type { Motivo } from "@/extraccion/pipeline";
import type { Factura } from "@/factura/esquema";
import { redondear } from "@/factura/montos";
import { textoProblema } from "@/i18n/problemas";
import { TEXTOS, type Idioma } from "@/i18n/textos";
import { validarFactura } from "@/validacion/validadores";

const VACIA: Factura = { tipo: "A", proveedor: { razonSocial: "", cuit: "" }, puntoVenta: 1, numero: 1, fecha: "", items: [{ codigo: null, descripcion: "", cantidad: 1, precioUnitario: 0, bonificacionPct: 0, importe: 0, alicuotaIva: 21 }], netoGravado: 0, iva: [{ alicuota: 21, base: 0, importe: 0 }], percepciones: [], total: 0 };

/** La base de cada alícuota sale de los renglones (en el documento no figura). */
function conBases(f: Factura): Factura {
  if (f.tipo === "B") return { ...f, netoGravado: null, iva: [], items: f.items.map((i) => ({ ...i, alicuotaIva: null })) };
  return { ...f, iva: f.iva.map((v) => ({ ...v, base: redondear(f.items.filter((i) => i.alicuotaIva === v.alicuota).reduce((t, i) => t + i.importe, 0)) })) };
}

const num = (v: string) => (v.trim() === "" ? 0 : Number(v));
const fmtAlicuota = (a: number, idioma: Idioma) => (idioma === "es" ? String(a).replace(".", ",") : String(a));

/** Campo con su problema (si tiene): resaltador y el motivo debajo, asociado al control. Afuera del editor: si se
 *  definiera adentro, React lo recrearía en cada tecla y el campo perdería el foco. */
function Campo({ etiqueta, id, problema, idioma, children, ancho = "" }: { etiqueta: string; id: string; problema?: Motivo; idioma: Idioma; children: (props: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => React.ReactNode; ancho?: string }) {
  return (
    <div className={`${ancho} ${problema ? "resaltado px-1" : ""}`}>
      <label htmlFor={id} className="block text-sm font-semibold">
        {etiqueta}
      </label>
      {children({ id, ...(problema ? { "aria-invalid": true, "aria-describedby": `${id}-p` } : {}) })}
      {problema ? (
        <p id={`${id}-p`} className="mt-1 text-sm font-semibold">
          <span aria-hidden="true">▲ </span>
          {textoProblema(problema, idioma)}
        </p>
      ) : null}
    </div>
  );
}

export function EditorRevision({ idioma, doc, urlDocumento, urlSiguiente, dimensiones }: { idioma: Idioma; doc: DocumentoBandeja; urlDocumento: string; urlSiguiente: string | null; dimensiones: { ancho: number; alto: number } | null }) {
  const t = TEXTOS[idioma].revision;
  const router = useRouter();
  const uid = useId();
  const [f, setF] = useState<Factura>(doc.cargada ?? doc.extraida ?? VACIA);
  const [forzar, setForzar] = useState(false);
  const [nota, setNota] = useState("");
  const [estado, setEstado] = useState<"editando" | "enviando" | "aprobada" | "rechazada">(doc.estado === "aprobada" ? "aprobada" : doc.estado === "rechazada" ? "rechazada" : "editando");
  const [error, setError] = useState<string | null>(null);

  const duplicada = doc.motivos.find((m) => m.codigo === "duplicada");
  const problemas: Motivo[] = [...(duplicada ? [duplicada] : []), ...validarFactura(conBases(f)).problemas];
  const porCampo = new Map(problemas.map((p) => [p.campo, p]));
  const soloLectura = estado !== "editando" && estado !== "enviando";
  const set = (cambio: Partial<Factura>) => setF((x) => ({ ...x, ...cambio }));
  const setItem = (i: number, cambio: Partial<Factura["items"][number]>) => setF((x) => ({ ...x, items: x.items.map((it, k) => (k === i ? { ...it, ...cambio } : it)) }));

  async function enviar(cuerpo: unknown, fin: "aprobada" | "rechazada") {
    setEstado("enviando");
    setError(null);
    const r = await fetch(`/api/bandeja/${encodeURIComponent(doc.id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) }).catch(() => null);
    const datos = (await r?.json().catch(() => null)) as { error?: string } | null;
    if (r?.ok) {
      setEstado(fin);
      router.refresh();
    } else {
      setEstado("editando");
      setError(datos?.error ?? t.error);
    }
  }

  /** Props de un campo: id estable y su problema, si tiene. */
  const prop = (campo: string) => ({ id: `${uid}-${campo.replace(/[^\w-]/g, "_")}`, problema: porCampo.get(campo), idioma });

  const entrada = "mt-1 block min-h-11 w-full border-2 border-cinta bg-papel px-2 tabular-nums disabled:bg-hormigon";
  const esPdf = doc.archivo.mimeType === "application/pdf";

  return (
    <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section aria-labelledby={`${uid}-doc`} className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id={`${uid}-doc`} className="font-display text-2xl font-bold uppercase">
            {t.documento}
          </h2>
          <a href={urlDocumento} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">
            {t.abrir}
          </a>
        </div>
        <p className="text-sm text-grafito-suave">{doc.mensaje.asunto}</p>
        <div className="mt-2 border-2 border-cinta bg-papel">
          {esPdf ? (
            <object data={urlDocumento} type="application/pdf" className="block h-[70vh] w-full" aria-label={`${t.documento}: ${doc.archivo.nombre}`}>
              <p className="p-4">
                <a href={urlDocumento} className="underline">
                  {t.abrir}
                </a>
              </p>
            </object>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- imagen servida por la API de la bandeja, de tamaño variable
            <img src={`${urlDocumento}?vista=1`} alt={`${t.documento}: ${doc.archivo.nombre}`} width={dimensiones?.ancho} height={dimensiones?.alto} fetchPriority="high" decoding="async" className="block h-auto w-full" />
          )}
        </div>
      </section>

      <section aria-labelledby={`${uid}-datos`} className="relative min-w-0">
        <h2 id={`${uid}-datos`} className="font-display text-2xl font-bold uppercase">
          {t.datos}
        </h2>

        {doc.motivos.length ? (
          <div className="mt-2 border-2 border-cinta bg-papel p-3">
            <h3 className="font-semibold">{t.porQue}</h3>
            <ul className="mt-1 list-inside list-disc text-sm">
              {doc.motivos.map((m, i) => (
                <li key={i}>{m.codigo === "extraccion_invalida" ? t.extraccionInvalida : textoProblema(m, idioma)}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <fieldset disabled={soloLectura || estado === "enviando"} className="mt-4 grid gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Campo etiqueta={t.tipo} {...prop("tipo")}>
              {(p) => (
                <select {...p} value={f.tipo} onChange={(e) => set({ tipo: e.target.value as "A" | "B" })} className={entrada}>
                  <option value="A">A</option>
                  <option value="B">B</option>
                </select>
              )}
            </Campo>
            <Campo etiqueta={t.puntoVenta} {...prop("puntoVenta")}>
              {(p) => <input {...p} type="number" min={1} value={f.puntoVenta} onChange={(e) => set({ puntoVenta: num(e.target.value) })} className={entrada} />}
            </Campo>
            <Campo etiqueta={t.numero} {...prop("numero")}>
              {(p) => <input {...p} type="number" min={1} value={f.numero} onChange={(e) => set({ numero: num(e.target.value) })} className={entrada} />}
            </Campo>
            <Campo etiqueta={t.fecha} {...prop("fecha")}>
              {(p) => <input {...p} type="date" value={f.fecha} onChange={(e) => set({ fecha: e.target.value })} className={entrada} />}
            </Campo>
          </div>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <Campo etiqueta={t.proveedor} {...prop("proveedor.razonSocial")}>
              {(p) => <input {...p} value={f.proveedor.razonSocial} onChange={(e) => set({ proveedor: { ...f.proveedor, razonSocial: e.target.value } })} className={entrada} />}
            </Campo>
            <Campo etiqueta={t.cuit} {...prop("proveedor.cuit")}>
              {(p) => <input {...p} value={f.proveedor.cuit} onChange={(e) => set({ proveedor: { ...f.proveedor, cuit: e.target.value } })} className={entrada} />}
            </Campo>
          </div>

          <div>
            <h3 className="font-display text-xl font-bold uppercase">{t.renglones}</h3>
            <ol className="mt-2 grid gap-3">
              {f.items.map((it, i) => (
                <li key={i} className="border-l-4 border-cinta bg-papel p-2">
                  <p className="text-sm font-semibold">
                    {i + 1}. {it.descripcion}
                  </p>
                  <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <Campo etiqueta={t.cantidad} {...prop(`items[${i}].cantidad`)}>
                      {(p) => <input {...p} type="number" step="any" value={it.cantidad} onChange={(e) => setItem(i, { cantidad: num(e.target.value) })} className={entrada} />}
                    </Campo>
                    <Campo etiqueta={t.precio} {...prop(`items[${i}].precioUnitario`)}>
                      {(p) => <input {...p} type="number" step="any" value={it.precioUnitario} onChange={(e) => setItem(i, { precioUnitario: num(e.target.value) })} className={entrada} />}
                    </Campo>
                    <Campo etiqueta={t.bonificacion} {...prop(`items[${i}].bonificacionPct`)}>
                      {(p) => <input {...p} type="number" step="any" value={it.bonificacionPct} onChange={(e) => setItem(i, { bonificacionPct: num(e.target.value) })} className={entrada} />}
                    </Campo>
                    {f.tipo === "A" ? (
                      <Campo etiqueta={t.alicuota} {...prop(`items[${i}].alicuotaIva`)}>
                        {(p) => (
                          <select {...p} value={String(it.alicuotaIva ?? 21)} onChange={(e) => setItem(i, { alicuotaIva: Number(e.target.value) })} className={entrada}>
                            {[10.5, 21, 27].map((a) => (
                              <option key={a} value={a}>
                                {fmtAlicuota(a, idioma)}
                              </option>
                            ))}
                          </select>
                        )}
                      </Campo>
                    ) : null}
                    <Campo etiqueta={t.importe} {...prop(`items[${i}].importe`)} ancho="col-span-2 sm:col-span-1">
                      {(p) => <input {...p} type="number" step="any" value={it.importe} onChange={(e) => setItem(i, { importe: num(e.target.value) })} className={entrada} />}
                    </Campo>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {f.tipo === "A" ? (
              <Campo etiqueta={t.neto} {...prop("netoGravado")}>
                {(p) => <input {...p} type="number" step="any" value={f.netoGravado ?? 0} onChange={(e) => set({ netoGravado: num(e.target.value) })} className={entrada} />}
              </Campo>
            ) : null}
            {f.tipo === "A"
              ? f.iva.map((v, k) => (
                  <Campo key={v.alicuota} etiqueta={t.iva(fmtAlicuota(v.alicuota, idioma))} {...prop(porCampo.has(`iva[${v.alicuota}].base`) ? `iva[${v.alicuota}].base` : `iva[${v.alicuota}].importe`)}>
                    {(p) => <input {...p} type="number" step="any" value={v.importe} onChange={(e) => set({ iva: f.iva.map((x, j) => (j === k ? { ...x, importe: num(e.target.value) } : x)) })} className={entrada} />}
                  </Campo>
                ))
              : null}
            {f.percepciones.map((pc, k) => (
              <Campo key={k} etiqueta={pc.concepto} {...prop(`percepciones[${k}]`)}>
                {(p) => <input {...p} type="number" step="any" value={pc.importe} onChange={(e) => set({ percepciones: f.percepciones.map((x, j) => (j === k ? { ...x, importe: num(e.target.value) } : x)) })} className={entrada} />}
              </Campo>
            ))}
            <Campo etiqueta={t.total} {...prop("total")}>
              {(p) => <input {...p} type="number" step="any" value={f.total} onChange={(e) => set({ total: num(e.target.value) })} className={`${entrada} font-semibold`} />}
            </Campo>
          </div>
        </fieldset>

        {soloLectura ? (
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <p aria-hidden="true" className={`sello inline-block border-4 px-4 py-1 font-display text-4xl font-bold tracking-widest ${estado === "aprobada" ? "border-control text-control" : "border-alerta text-alerta"}`}>
              {estado === "aprobada" ? t.aprobada : t.rechazar.toUpperCase()}
            </p>
            <p role="status" className="font-semibold">
              {estado === "aprobada" ? t.aprobadaTexto : t.rechazadaTexto}
            </p>
            {urlSiguiente ? (
              <Link href={urlSiguiente} className="inline-flex min-h-11 items-center border-2 border-cinta bg-papel px-4 font-semibold hover:bg-hormigon">
                {t.siguiente} →
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="mt-6 grid gap-3 border-t-2 border-cinta pt-4">
            <p aria-live="polite" className={`font-semibold ${problemas.length ? "" : "text-control"}`}>
              <span aria-hidden="true">{problemas.length ? "▲ " : "✓ "}</span>
              {duplicada ? t.duplicada : problemas.length ? t.noCierra(problemas.length) : t.cierra}
            </p>
            {problemas.length && !duplicada ? (
              <label className="flex min-h-11 items-center gap-2">
                <input type="checkbox" checked={forzar} onChange={(e) => setForzar(e.target.checked)} className="size-5 accent-grafito" />
                {t.forzar}
              </label>
            ) : null}
            {error ? (
              <p role="alert" className="font-semibold text-alerta">
                <span aria-hidden="true">✕ </span>
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap items-end gap-3">
              <button
                type="button"
                disabled={Boolean(duplicada) || (problemas.length > 0 && !forzar) || estado === "enviando"}
                onClick={() => enviar({ accion: "aprobar", factura: conBases(f), forzar: problemas.length > 0 }, "aprobada")}
                className="min-h-12 bg-grafito px-5 font-display text-lg font-bold tracking-wide text-papel uppercase hover:bg-cinta disabled:opacity-50"
              >
                {t.aprobar}
              </button>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-sm">
                  <span className="block font-semibold">{t.notaRechazo}</span>
                  <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} className="mt-1 min-h-11 w-64 max-w-full border-2 border-cinta bg-papel px-2" />
                </label>
                <button type="button" disabled={estado === "enviando"} onClick={() => enviar({ accion: "rechazar", nota }, "rechazada")} className="min-h-11 border-2 border-alerta bg-papel px-4 font-semibold text-alerta hover:bg-alerta-suave">
                  {t.rechazar}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
