// Seis proveedores FICTICIOS de "Distribuidora Alto Valle" (también ficticia). Los CUIT tienen formato y dígito
// verificador válidos pero son inventados, y cada factura los imprime con la marca "FICTICIO". Cada proveedor tiene su
// propio diseño de factura (como pasa en la realidad: cada sistema de facturación imprime distinto).
import { armarCuit } from "../../src/validacion/cuit";

export type Diseno = "clasico" | "banda" | "dos-columnas" | "compacto" | "sistema-viejo" | "recuadro";

export interface Producto {
  codigo: string;
  descripcion: string;
  precio: number;
  alicuota: 10.5 | 21 | 27;
  /** Se vende por peso (cantidades con decimales). */
  porPeso?: boolean;
}

export interface Proveedor {
  id: string;
  razonSocial: string;
  domicilio: string;
  cuit: string;
  iibb: string;
  inicioActividades: string;
  puntoVenta: number;
  diseno: Diseno;
  /** Proporción de facturas A (el resto, B). */
  proporcionA: number;
  /** Percepciones que aplica en las facturas A (porcentaje sobre el neto). */
  percepciones: { concepto: string; pct: number }[];
  productos: Producto[];
}

const cuit = (prefijo: string, ocho: string) => {
  const c = armarCuit(prefijo, ocho);
  if (!c) throw new Error(`CUIT sin verificador posible: ${prefijo}${ocho}`);
  return c;
};

export const RECEPTOR = {
  razonSocial: "Distribuidora Alto Valle S.A. (FICTICIA)",
  cuit: cuit("30", "71900123"),
  domicilio: "Ruta 22 km 1.234, Parque Industrial, Neuquén (dirección ficticia)",
  condicionIva: "IVA Responsable Inscripto",
};

export const PROVEEDORES: Proveedor[] = [
  {
    id: "nire",
    razonSocial: "Lácteos Ñire Sur S.A.",
    domicilio: "Calle Inventada 100, Plottier, Neuquén",
    cuit: cuit("30", "71988001"),
    iibb: "Conv. Multilateral 901-000001-0 (ficticio)",
    inicioActividades: "03/2011",
    puntoVenta: 3,
    diseno: "clasico",
    proporcionA: 0.8,
    percepciones: [{ concepto: "Percepción IIBB Neuquén", pct: 3 }],
    productos: [
      { codigo: "LS-101", descripcion: "Leche entera larga vida 1 L x 12", precio: 14250, alicuota: 10.5 },
      { codigo: "LS-102", descripcion: "Leche descremada larga vida 1 L x 12", precio: 14980, alicuota: 10.5 },
      { codigo: "LS-210", descripcion: "Yogur bebible frutilla 900 g x 6", precio: 12600, alicuota: 21 },
      { codigo: "LS-305", descripcion: "Queso cremoso horma (kg)", precio: 8940.5, alicuota: 21, porPeso: true },
      { codigo: "LS-306", descripcion: "Queso de rallar horma (kg)", precio: 13210, alicuota: 21, porPeso: true },
      { codigo: "LS-410", descripcion: "Manteca 200 g x 20", precio: 31800, alicuota: 21 },
      { codigo: "LS-520", descripcion: "Dulce de leche 1 kg x 6", precio: 21540, alicuota: 21 },
      { codigo: "LS-530", descripcion: "Crema de leche 350 g x 12", precio: 22990, alicuota: 21 },
    ],
  },
  {
    id: "piedra",
    razonSocial: "Bodega Piedra Callada S.R.L.",
    domicilio: "Pasaje Ficticio 45, San Patricio del Chañar, Neuquén",
    cuit: cuit("30", "71988118"),
    iibb: "Neuquén 41-0000118-2 (ficticio)",
    inicioActividades: "09/2008",
    puntoVenta: 2,
    diseno: "banda",
    proporcionA: 0.85,
    percepciones: [
      { concepto: "Percepción IIBB Neuquén", pct: 2.5 },
      { concepto: "Percepción IVA RG 2408", pct: 3 },
    ],
    productos: [
      { codigo: "PC-MAL-75", descripcion: "Malbec reserva 750 ml x 6", precio: 41400, alicuota: 21 },
      { codigo: "PC-PIN-75", descripcion: "Pinot noir 750 ml x 6", precio: 46800, alicuota: 21 },
      { codigo: "PC-MER-75", descripcion: "Merlot joven 750 ml x 6", precio: 28920, alicuota: 21 },
      { codigo: "PC-SAU-75", descripcion: "Sauvignon blanc 750 ml x 6", precio: 31560, alicuota: 21 },
      { codigo: "PC-ESP-75", descripcion: "Espumante extra brut 750 ml x 6", precio: 52380, alicuota: 21 },
      { codigo: "PC-DAM-5L", descripcion: "Tinto de mesa damajuana 5 L", precio: 9875, alicuota: 21 },
    ],
  },
  {
    id: "molino",
    razonSocial: "Molino Tres Ríos S.A.",
    domicilio: "Av. de Ejemplo 2020, Cipolletti, Río Negro",
    cuit: cuit("30", "71988236"),
    iibb: "Conv. Multilateral 921-000236-7 (ficticio)",
    inicioActividades: "05/1999",
    puntoVenta: 7,
    diseno: "dos-columnas",
    proporcionA: 0.7,
    percepciones: [{ concepto: "Percepción IIBB Río Negro", pct: 2 }],
    productos: [
      { codigo: "MT-H000", descripcion: "Harina 000 25 kg", precio: 16890, alicuota: 10.5 },
      { codigo: "MT-H0000", descripcion: "Harina 0000 1 kg x 10", precio: 9450, alicuota: 10.5 },
      { codigo: "MT-FS500", descripcion: "Fideos spaghetti 500 g x 20", precio: 18720, alicuota: 10.5 },
      { codigo: "MT-FM500", descripcion: "Fideos mostachol 500 g x 20", precio: 18720, alicuota: 10.5 },
      { codigo: "MT-SEM", descripcion: "Sémola 1 kg x 10", precio: 11380, alicuota: 10.5 },
      { codigo: "MT-PRE", descripcion: "Premezcla para pizza 1 kg x 10", precio: 15460, alicuota: 21 },
      { codigo: "MT-GAL", descripcion: "Galletitas de agua 300 g x 24", precio: 27350, alicuota: 21 },
    ],
  },
  {
    id: "austral",
    razonSocial: "Química Limpia Austral S.R.L.",
    domicilio: "Calle Sin Nombre 789, Centenario, Neuquén",
    cuit: cuit("30", "71988354"),
    iibb: "Neuquén 41-0000354-1 (ficticio)",
    inicioActividades: "11/2015",
    puntoVenta: 1,
    diseno: "compacto",
    proporcionA: 0.6,
    percepciones: [],
    productos: [
      { codigo: "QA-LAV5", descripcion: "Lavandina 5 L", precio: 3420, alicuota: 21 },
      { codigo: "QA-DET750", descripcion: "Detergente concentrado 750 ml x 12", precio: 19860, alicuota: 21 },
      { codigo: "QA-DES900", descripcion: "Desinfectante de pisos 900 ml x 12", precio: 16740, alicuota: 21 },
      { codigo: "QA-JAB3", descripcion: "Jabón líquido para ropa 3 L x 4", precio: 28400, alicuota: 21 },
      { codigo: "QA-ESP", descripcion: "Esponja doble uso x 40", precio: 12350, alicuota: 21 },
      { codigo: "QA-BOL", descripcion: "Bolsa de residuos 60x90 x 100", precio: 8890, alicuota: 21 },
      { codigo: "QA-GUA", descripcion: "Guantes de látex talle M x 12 pares", precio: 7420, alicuota: 21 },
      { codigo: "QA-PAP", descripcion: "Papel higiénico 30 m x 48", precio: 21980, alicuota: 21 },
    ],
  },
  {
    id: "frigo",
    razonSocial: "Frigorífico Meseta Blanca S.A.",
    domicilio: "Ruta Ficticia 7 km 12, Senillosa, Neuquén",
    cuit: cuit("30", "71988472"),
    iibb: "Conv. Multilateral 901-000472-4 (ficticio)",
    inicioActividades: "02/2005",
    puntoVenta: 4,
    diseno: "sistema-viejo",
    proporcionA: 0.75,
    percepciones: [{ concepto: "Percepción IIBB Neuquén", pct: 1.5 }],
    productos: [
      { codigo: "000412", descripcion: "Media res novillo (kg)", precio: 5480, alicuota: 10.5, porPeso: true },
      { codigo: "000415", descripcion: "Bola de lomo (kg)", precio: 9120, alicuota: 10.5, porPeso: true },
      { codigo: "000420", descripcion: "Carne picada especial (kg)", precio: 6390, alicuota: 10.5, porPeso: true },
      { codigo: "000433", descripcion: "Pollo entero congelado (kg)", precio: 3150, alicuota: 10.5, porPeso: true },
      { codigo: "000447", descripcion: "Chorizo parrillero (kg)", precio: 6870, alicuota: 21, porPeso: true },
      { codigo: "000451", descripcion: "Hamburguesas 80 g x 36", precio: 18240, alicuota: 21 },
    ],
  },
  {
    id: "comahue",
    razonSocial: "Bebidas Cumbre Andina S.A.",
    domicilio: "Calle Imaginaria 555, General Roca, Río Negro",
    cuit: cuit("30", "71988590"),
    iibb: "Conv. Multilateral 921-000590-3 (ficticio)",
    inicioActividades: "07/2012",
    puntoVenta: 12,
    diseno: "recuadro",
    proporcionA: 0.8,
    percepciones: [
      { concepto: "Percepción IIBB Río Negro", pct: 2 },
      { concepto: "Impuestos internos", pct: 4 },
    ],
    productos: [
      { codigo: "CA-COL2", descripcion: "Gaseosa cola 2,25 L x 8", precio: 15960, alicuota: 21 },
      { codigo: "CA-LIM2", descripcion: "Gaseosa lima-limón 2,25 L x 8", precio: 14880, alicuota: 21 },
      { codigo: "CA-AGU", descripcion: "Agua mineral sin gas 2 L x 6", precio: 6420, alicuota: 21 },
      { codigo: "CA-SOD", descripcion: "Soda en sifón 2 L x 6", precio: 5390, alicuota: 21 },
      { codigo: "CA-JUG", descripcion: "Jugo de manzana 1 L x 12", precio: 19740, alicuota: 21 },
      { codigo: "CA-ENE", descripcion: "Bebida energizante 473 ml x 24", precio: 52800, alicuota: 27 },
      { codigo: "CA-CER", descripcion: "Cerveza rubia lata 473 ml x 24", precio: 38160, alicuota: 21 },
    ],
  },
];
