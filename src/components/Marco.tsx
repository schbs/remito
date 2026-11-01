// Encabezado (marca, navegación, idioma, modo) y pie de todas las páginas.
import Link from "next/link";
import type { Modo } from "@/bandeja/servicio";
import { TEXTOS, type Idioma } from "@/i18n/textos";
import { BotonModo } from "./BotonModo";

export function Marco({ idioma, modo, actual, pendientes, otroHref, children }: { idioma: Idioma; modo: Modo; actual: "panel" | "revision"; pendientes: number; otroHref: string; children: React.ReactNode }) {
  const t = TEXTOS[idioma];
  const enlace = (id: "panel" | "revision", href: string, texto: string) => (
    <Link href={href} aria-current={actual === id ? "page" : undefined} className={`inline-flex min-h-11 items-center gap-2 border-b-4 px-1 font-display text-lg font-semibold tracking-wide uppercase ${actual === id ? "border-grafito" : "border-transparent hover:border-linea"}`}>
      {texto}
      {id === "revision" && pendientes > 0 ? <span className="bg-lima px-1.5 font-sans text-sm font-semibold tabular-nums">{pendientes}</span> : null}
    </Link>
  );
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b-2 border-cinta bg-papel">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-end justify-between gap-x-6 gap-y-2 px-4 pt-4 sm:px-6">
          <div className="pb-2">
            <p className="text-sm font-medium text-grafito-suave">{t.marca}</p>
            <p className="font-display text-4xl leading-none font-bold tracking-tight uppercase">{t.nombre}</p>
          </div>
          <nav aria-label={idioma === "es" ? "Secciones" : "Sections"} className="flex items-end gap-5">
            {enlace("panel", t.base || "/", t.nav.panel)}
            {enlace("revision", `${t.base}/revision`, t.nav.revision)}
            <a href={otroHref} hrefLang={t.otroIdioma.lang} lang={t.otroIdioma.lang} className="mb-1 inline-flex min-h-11 items-center border-2 border-cinta px-3 text-sm font-semibold hover:bg-hormigon">
              {t.otroIdioma.texto}
            </a>
          </nav>
        </div>
      </header>
      <div className="border-b border-linea">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm sm:px-6">
          <p className="flex items-center gap-2">
            <span aria-hidden="true">{modo === "demo" ? "◇" : "◆"}</span>
            {modo === "demo" ? t.modoDemo : t.modoReal}
          </p>
          <BotonModo modo={modo} textos={{ reiniciar: t.reiniciar, reiniciada: t.reiniciada, procesar: t.procesar, error: t.revision.error }} />
        </div>
      </div>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      <footer className="border-t-2 border-cinta bg-papel">
        <div className="mx-auto max-w-7xl px-4 py-5 text-sm text-grafito-suave sm:px-6">
          <p>{t.pie}</p>
          <p className="mt-1">{t.autor}</p>
        </div>
      </footer>
    </div>
  );
}
