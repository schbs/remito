import type { Metadata } from "next";
import { Documento, metadataDe, viewportRemito } from "@/components/Documento";

export const metadata: Metadata = metadataDe("es");
export const viewport = viewportRemito;

export default function LayoutEspanol({ children }: Readonly<{ children: React.ReactNode }>) {
  return <Documento idioma="es">{children}</Documento>;
}
