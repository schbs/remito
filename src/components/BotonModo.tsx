"use client";
// Demo: reiniciar los 10 mails. Real: leer Gmail ahora.
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Modo } from "@/bandeja/servicio";

export function BotonModo({ modo, textos }: { modo: Modo; textos: { reiniciar: string; reiniciada: string; procesar: string; error: string } }) {
  const router = useRouter();
  const [estado, setEstado] = useState<"" | "ocupado" | "listo" | "error">("");
  async function ejecutar() {
    setEstado("ocupado");
    const r = await fetch("/api/procesar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: modo === "demo" ? "reiniciar" : "procesar" }) }).catch(() => null);
    setEstado(r?.ok ? "listo" : "error");
    router.refresh();
  }
  return (
    <div className="flex items-center gap-3">
      <span role="status" className="text-grafito-suave">
        {estado === "listo" && modo === "demo" ? textos.reiniciada : estado === "error" ? textos.error : ""}
      </span>
      <button type="button" onClick={ejecutar} disabled={estado === "ocupado"} className="min-h-11 border-2 border-cinta bg-papel px-3 font-semibold hover:bg-hormigon disabled:opacity-70">
        {modo === "demo" ? textos.reiniciar : textos.procesar}
      </button>
    </div>
  );
}
