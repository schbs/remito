# Identidad visual: Distribuidora Alto Valle · Remito (marca ficticia)

Herramienta interna de una distribuidora mayorista ficticia de Neuquén para leer las facturas de sus proveedores y
revisar las que no cierran. Estética "operativa/industrial" (lo pide el plan). Pie obligatorio: "Proyecto de
demostración — marca ficticia". Skill `design-identity-per-client`.

## Brief
- **Quién la usa:** la persona de cuentas a pagar, en la compu del depósito, todos los días; a veces desde el celular.
- **3 adjetivos:** claro, firme, confiable.
- **Gustan:** remitos y planillas de depósito, rótulos de pallets, el resaltador sobre el papel, los sellos de control.
- **No gusta:** dashboards de startup con degradés; "IA mágica" con brillos; tablas que no se pueden leer de un vistazo.
- **Conversión:** que una factura con problemas se resuelva en menos de un minuto: ver el documento al lado de los
  campos, ver qué no cierra y aprobar.

## Tres direcciones

| | A · Remito de depósito (recomendada) | B · Tablero de control | C · Ticket térmico |
|---|---|---|---|
| Concepto | El papel del depósito: cada factura es un remito con su rótulo, y lo que no cierra va marcado con resaltador | Un tablero de planta, oscuro, con contadores grandes y semáforos | La tira de papel térmico: todo en una columna angosta, como un ticket |
| Display / texto | Barlow Condensed / Barlow | Chivo / Chivo Mono | Courier Prime / Work Sans |
| Primario / acento | tinta grafito `oklch(0.24 0.01 110)` sobre gris hormigón `oklch(0.965 0.004 110)`, resaltador lima `oklch(0.90 0.16 112)` | azul acero `oklch(0.45 0.09 255)` / rojo alarma | negro térmico / rosa de copia `oklch(0.80 0.08 350)` |
| Layout | Bandeja en lista de rótulos (proveedor, número, total, estado) y revisión a dos columnas: documento a la izquierda, campos a la derecha | Grilla de contadores arriba y tabla a todo el ancho | Una sola columna de 420 px centrada |
| Movimiento | Sello "APROBADO" que baja y asienta al aprobar (translate + scale, una vez); filas que se deslizan al salir de la bandeja | Contadores que cuentan (no se anima número: se cambia) | Ticket que "sale" de arriba (translateY) |
| Forma | Bordes de 2 px como cinta de embalar, esquinas rectas, números tabulares grandes en los totales | Tarjetas redondeadas | Bordes dentados |
| Gesto propio | El campo que no cierra se marca con resaltador lima y una etiqueta con el motivo ("la suma da $ 12.345,00") | Semáforo por factura | Corte de ticket entre facturas |

**Elegida: A · Remito de depósito** (Germán delegó la elección en los proyectos anteriores: "hacé lo que recomiendes").
Es la que mejor cuenta el trabajo (papel, control y aprobación) y la más distinta de los proyectos anteriores: tipografía
condensada, fondo gris frío sin crema y acento lima. Contraste AA a medir en P4-G3: el lima es un **fondo** de resaltado
(texto en tinta grafito encima), nunca un color de texto sobre el gris.

## Control de diferencia (dirección A contra `taller/registro-visual.json`)

| Proyecto | Display | Hue (≥ 30°) | Layout | Movimiento | Forma | Difiere en |
|---|---|---|---|---|---|---|
| PROPUESTA RED INMOBILIARIA | ✓ Montserrat vs Barlow Condensed | ✓ 25° vs 112° | ✓ | ✓ | ✓ | 5/5 |
| PROPUESTA REY AUTOMOTOR | ✓ | ✓ 275° vs 112° | ✓ | ✓ | ✓ | 5/5 |
| turnolisto | ✓ Lexend vs Barlow Condensed | ✓ 188° vs 112° | ✓ | ✓ | ✓ fondo crema vs gris frío | 5/5 |
| embudo | ✓ Space Grotesk vs Barlow Condensed | ✓ 150° vs 112° (38°) | ✓ grilla 8/4 vs bandeja + revisión a dos columnas | ✓ barras vs sello | ✓ | 5/5 |
| fojas | ✓ Newsreader vs Barlow Condensed | ✓ 235° vs 112° | ✗ comparte "documento con algo al costado" (Fojas: margen de citas; Remito: documento al lado de campos editables) | ✓ | ✓ papel crema y sin radios vs gris frío y bordes de 2 px | 4/5 |
| radar | ✓ Martian Mono vs Barlow Condensed | ✓ 75° vs 112° (37°) | ✓ | ✓ barrido vs sello | ✓ oscuro vs claro | 5/5 |

Con Fojas comparte la idea de mostrar el documento junto a otra cosa: es lo que pide el producto (revisar contra el
original). Se diferencia en que acá el documento va a la izquierda a ancho completo de columna y los campos son un
formulario editable con el resaltador, no notas al margen.
