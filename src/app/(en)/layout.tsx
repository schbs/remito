import type { Metadata } from "next";
import { Documento, metadataDe, viewportRemito } from "@/components/Documento";

export const metadata: Metadata = metadataDe("en");
export const viewport = viewportRemito;

export default function LayoutIngles({ children }: Readonly<{ children: React.ReactNode }>) {
  return <Documento idioma="en">{children}</Documento>;
}
