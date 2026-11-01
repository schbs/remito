// <html> de cada idioma: un layout raíz por grupo de rutas ((es) y (en)) para que lang sea el correcto.
import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { TEXTOS, type Idioma } from "@/i18n/textos";
import "@/app/globals.css";

const condensada = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-barlow-condensed", display: "swap" });
const texto = Barlow({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-barlow", display: "swap" });

export function metadataDe(idioma: Idioma): Metadata {
  const t = TEXTOS[idioma].meta;
  return { title: t.titulo, description: t.descripcion };
}

export const viewportRemito: Viewport = { themeColor: "#f3f4f0" };

export function Documento({ idioma, children }: { idioma: Idioma; children: React.ReactNode }) {
  return (
    <html lang={TEXTOS[idioma].lang} className={`${condensada.variable} ${texto.variable}`}>
      <body>{children}</body>
    </html>
  );
}
