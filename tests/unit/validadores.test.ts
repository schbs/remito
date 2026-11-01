import { describe, expect, it } from "vitest";
import { claveFactura, facturaSchema, numeroComprobante, type Factura } from "@/factura/esquema";
import { formatoAR, importeRenglon } from "@/factura/montos";
import { armarCuit, digitoVerificador, validarCuit } from "@/validacion/cuit";
import { validarDuplicado, validarFactura, validarFecha, validarItems, validarIva, validarTotal } from "@/validacion/validadores";

// Factura A chica y correcta: 2 renglones (uno con bonificación), dos alícuotas y una percepción.
const base = (): Factura => ({
  tipo: "A",
  proveedor: { razonSocial: "Proveedor de Prueba S.A.", cuit: armarCuit("30", "71988001")! },
  puntoVenta: 3,
  numero: 5146,
  fecha: "2026-09-04",
  items: [
    { codigo: "X1", descripcion: "Leche 1 L x 12", cantidad: 10, precioUnitario: 14250, bonificacionPct: 0, importe: 142500, alicuotaIva: 10.5 },
    { codigo: "X2", descripcion: "Queso (kg)", cantidad: 12.5, precioUnitario: 8940.5, bonificacionPct: 5, importe: 106168.44, alicuotaIva: 21 },
  ],
  netoGravado: 248668.44,
  iva: [
    { alicuota: 10.5, base: 142500, importe: 14962.5 },
    { alicuota: 21, base: 106168.44, importe: 22295.37 },
  ],
  percepciones: [{ concepto: "Percepción IIBB Neuquén", importe: 7460.05 }],
  total: 293386.36,
});

const codigos = (f: Factura, cargadas?: Set<string>) => validarFactura(f, cargadas).problemas.map((p) => p.codigo);

describe("CUIT", () => {
  it("calcula el dígito verificador (módulo 11 con pesos 5432765432)", () => {
    expect(digitoVerificador("2012345678")).toBe(6);
    expect(validarCuit("20-12345678-6")).toEqual({ ok: true, normalizado: "20-12345678-6" });
  });

  it("acepta el CUIT sin guiones o con espacios y lo normaliza", () => {
    expect(validarCuit("20 12345678 6")).toMatchObject({ ok: true, normalizado: "20-12345678-6" });
    expect(validarCuit("20123456786")).toMatchObject({ ok: true });
  });

  it("rechaza verificador incorrecto, prefijo inexistente y largo equivocado", () => {
    expect(validarCuit("20-12345678-5")).toEqual({ ok: false, motivo: "verificador" });
    expect(validarCuit("21-12345678-6")).toEqual({ ok: false, motivo: "prefijo" });
    expect(validarCuit("20-1234567-6")).toEqual({ ok: false, motivo: "formato" });
  });

  it("si el resto da 10 no hay verificador posible con ese prefijo", () => {
    // Busca un número con resto 10 y comprueba que no se puede armar ni validar.
    const ocho = Array.from({ length: 2000 }, (_, i) => String(10000000 + i)).find((n) => digitoVerificador(`20${n}`) === null)!;
    expect(armarCuit("20", ocho)).toBeNull();
    for (let dv = 0; dv <= 9; dv++) expect(validarCuit(`20${ocho}${dv}`).ok).toBe(false);
  });

  it("los CUIT ficticios generados para el set son válidos", () => {
    expect(validarCuit(armarCuit("30", "71988001")!).ok).toBe(true);
  });
});

describe("montos", () => {
  it("formato argentino: punto de miles y coma decimal", () => {
    expect(formatoAR(18476225.99)).toBe("18.476.225,99");
    expect(formatoAR(0.5)).toBe("0,50");
    expect(formatoAR(-1234)).toBe("-1.234,00");
  });

  it("importe del renglón con bonificación, redondeado a centavos", () => {
    expect(importeRenglon(12.5, 8940.5, 5)).toBe(106168.44);
    expect(importeRenglon(3, 0.1, 0)).toBe(0.3);
  });
});

describe("validadores", () => {
  it("una factura A que cierra no tiene problemas", () => {
    expect(facturaSchema.safeParse(base()).success).toBe(true);
    expect(validarFactura(base())).toEqual({ ok: true, problemas: [] });
  });

  it("renglón mal calculado: dice cuánto da y cuánto figura", () => {
    const f = base();
    f.items[1].importe = 106168.94;
    const [p] = validarItems(f);
    expect(p).toMatchObject({ codigo: "item_importe", campo: "items[1].importe", esperado: 106168.44, encontrado: 106168.94 });
    expect(p.detalle).toContain("$ 106.168,44");
  });

  it("tolera un centavo de redondeo en el renglón, pero no dos", () => {
    const f = base();
    f.items[0].importe = 142500.01;
    expect(validarItems(f)).toEqual([]);
    f.items[0].importe = 142500.02;
    expect(validarItems(f)).toHaveLength(1);
  });

  it("IVA mal liquidado en una alícuota (el resto de la factura cierra con ese IVA)", () => {
    const f = base();
    f.iva[1].importe = 20172; // 21 % calculado al 19 %
    f.total = 291262.99;
    expect(codigos(f)).toEqual(["iva_incorrecto"]);
    expect(validarIva(f)[0]).toMatchObject({ campo: "iva[21].importe", esperado: 22295.37 });
  });

  it("base de IVA que no coincide con los renglones de esa alícuota", () => {
    const f = base();
    f.iva[0].base = 142000;
    expect(validarIva(f).map((p) => p.codigo)).toEqual(["base_iva_no_cierra"]);
  });

  it("neto que no es la suma de los renglones", () => {
    const f = base();
    f.netoGravado = 248000;
    expect(codigos(f)).toContain("neto_no_cierra");
  });

  it("total mal sumado", () => {
    const f = base();
    f.total = 294386.36;
    expect(validarTotal(f)[0]).toMatchObject({ codigo: "total_no_cierra", esperado: 293386.36, encontrado: 294386.36 });
  });

  it("factura B: total = renglones con IVA incluido; si discrimina IVA es inconsistente", () => {
    const b: Factura = { ...base(), tipo: "B", items: base().items.map((i) => ({ ...i, alicuotaIva: null })), netoGravado: null, iva: [], percepciones: [], total: 248668.44 };
    expect(validarFactura(b).ok).toBe(true);
    expect(codigos({ ...b, total: 248668.5 })).toEqual(["total_no_cierra"]);
    expect(codigos({ ...b, iva: [{ alicuota: 21, base: 1, importe: 0.21 }] })).toContain("tipo_inconsistente");
  });

  it("duplicada: mismo proveedor, tipo, punto de venta y número", () => {
    const f = base();
    const cargadas = new Set([claveFactura(f)]);
    expect(validarDuplicado(f, cargadas)[0].detalle).toContain("0003-00005146");
    expect(validarDuplicado({ ...f, numero: 5147 }, cargadas)).toEqual([]);
    expect(validarDuplicado({ ...f, tipo: "B" }, cargadas)).toEqual([]);
  });

  it("fecha imposible y CUIT con verificador mal", () => {
    expect(validarFecha({ ...base(), fecha: "2026-02-30" })[0].codigo).toBe("fecha_invalida");
    expect(codigos({ ...base(), proveedor: { razonSocial: "X S.A.", cuit: "30-71988001-0" } })).toContain("cuit_invalido");
  });

  it("el esquema rechaza formas inválidas (CUIT sin guiones, sin renglones, tipo C)", () => {
    expect(facturaSchema.safeParse({ ...base(), proveedor: { razonSocial: "X S.A.", cuit: "30719880017" } }).success).toBe(false);
    expect(facturaSchema.safeParse({ ...base(), items: [] }).success).toBe(false);
    expect(facturaSchema.safeParse({ ...base(), tipo: "C" }).success).toBe(false);
    expect(numeroComprobante(base())).toBe("0003-00005146");
  });
});
