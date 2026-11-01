import { NextResponse, type NextRequest } from "next/server";

// En modo real (npm run dev:real) las páginas y la API muestran facturas de la casilla de Gmail: solo se sirven con un
// Host local. Así un sitio externo no puede leerlas apuntando su dominio a 127.0.0.1 (DNS rebinding). Cubre todas las
// rutas en un solo lugar; en la demo no hace nada.
const LOCALES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function proxy(request: NextRequest) {
  if (process.env.REMITO_REAL === "1") {
    const host = (request.headers.get("host") ?? "").replace(/:\d+$/, "");
    if (!LOCALES.has(host)) return new NextResponse("El modo real solo se usa desde esta PC.", { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/((?!_next/static|_next/image|icon.svg).*)",
};
