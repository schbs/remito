# Integración con Google (Gmail y Sheets)

Remito lee las facturas que llegan a una **casilla de Gmail de demostración**, las carga en una **planilla de Google
Sheets** y deja las dudosas para revisión. La demo pública no usa nada de esto: corre con los 10 mails de ejemplo y
las respuestas de Gemini grabadas. La integración real solo se usa en la PC (`npm run dev:real`, escucha en 127.0.0.1).

## Qué hace

| Paso | API | Código |
|---|---|---|
| Asegurar las etiquetas `facturas/entrada`, `facturas/procesadas`, `facturas/excepciones` | Gmail `users.labels.list` / `create` | `src/integraciones/google/gmail.ts` |
| Listar los mails de `facturas/entrada` (paginando por cursor) y leer cada uno con sus adjuntos | `users.messages.list`, `get` (format=full), `attachments.get` | idem |
| Mover el mail a `procesadas` o `excepciones` | `users.messages.modify` | idem |
| Cargar la factura: pestañas **Cabecera** (clave en la columna A) e **Ítems** | Sheets `spreadsheets.values.get` / `append` (RAW) | `src/integraciones/google/sheets.ts`, `src/bandeja/planilla.ts` |
| Mandar los 10 mails de demo a la propia casilla | `users.messages.send`, `users.getProfile` | `scripts/send-demo-mails.ts` |

APIs: Gmail API v1 y Google Sheets API v4, por REST (sin SDK). Documentación oficial consultada el 31/10/2026:
- https://developers.google.com/workspace/gmail/api/reference/rest
- https://developers.google.com/workspace/sheets/api/reference/rest
- https://developers.google.com/identity/protocols/oauth2/native-app (OAuth para apps de escritorio, PKCE y loopback)

## Autenticación

OAuth 2.0 de **app de escritorio** con PKCE y redirección a `127.0.0.1` (`scripts/autorizar-google.mjs`). Alcances:
`gmail.modify` (leer y etiquetar), `gmail.send` (mandar los mails de demo a la misma casilla) y `spreadsheets`. El
refresh token se guarda en el archivo local de variables y nunca se imprime; el token de acceso se pide con él y se
reusa hasta un minuto antes de vencer (`src/integraciones/google/oauth.ts`).

La app queda en **modo Prueba** de Google Auth Platform con la casilla de demo como única usuaria de prueba: en ese
modo Google vence los refresh tokens a los 7 días (confirmar en la doc oficial). Si pasa, el error dice
`invalid_grant`: volver a correr `npm run google:autorizar`.

## Variables (solo nombres)

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (del cliente OAuth), `GOOGLE_REFRESH_TOKEN` y `GMAIL_DEMO` (los completa
`npm run google:autorizar`), `GOOGLE_SHEET_ID` (lo completa `npm run planilla:crear`). `npm run check-env` dice
OK/FALTA por nombre, sin valores.

## Errores, reintentos e idempotencia

- Errores tipados (`ErrorGoogle`): autenticación (401, 403 que no es por límite, 400 `invalid_grant`), no encontrado
  (404), límite (429 o 403 `rateLimitExceeded`), proveedor caído (5xx), red/timeout, pedido mal armado y respuesta con
  otra forma (incluido un 2xx que no es JSON). Los mensajes llevan ruta y código, nunca tokens.
- Timeout de 10 s por pedido. Reintentos solo ante red, timeout, 429, 403 por límite, 502, 503 y 504: hasta 5
  intentos, con el `Retry-After` si viene (tope 60 s) o backoff con jitter completo (0 a min(30 s, 500 ms × 2^n)).
- **No se reintenta lo que crea algo** (mandar un mail, agregar filas, crear una etiqueta). La idempotencia la dan:
  - Sheets: antes de cargar se lee la columna A de Cabecera; si la clave está, no se agrega nada. Si un corte dejó
    los ítems escritos sin la cabecera, al reintentar no se repiten los ítems.
  - Gmail: un mail ya procesado sale de `facturas/entrada`; un adjunto ya guardado no se vuelve a leer con la IA.
  - Corte después de leer y antes de cargar: el documento queda `pendiente` y la próxima corrida carga lo ya leído.
  - Los mails de demo llevan un Message-ID fijo (`<remito-demo-F01@remito.demo>`): antes de mandar se busca.
- Un solo proceso a la vez sobre la casilla real: candado de archivo en `data/bandeja/.procesando` (lo comparten
  `npm run procesar` y el botón de la web; uno de más de 10 minutos se descarta).
- Mails leídos de a uno; si uno falla, queda en `facturas/entrada` para la próxima corrida y los demás siguen.

## Límites

- Gmail: cupo por usuario en "unidades" por segundo (cada método consume distinto); Sheets: cupo de lecturas y
  escrituras por minuto y por usuario. Para la casilla de demo (10 mails) no se llega; los valores exactos van en la
  doc oficial de cada API (confirmar ahí antes de un uso con volumen).
- Adjuntos que se procesan: PDF, PNG y JPEG. Otros se ignoran.

## Destinos permitidos

Los mails de prueba solo van a la casilla de demo: el script compara `GMAIL_DEMO` con el perfil de la cuenta
autorizada y `enviar()` rechaza cualquier destinatario que no esté en la lista (`exigirDestinoPermitido`).

## Rotar las credenciales

1. Google Cloud → Credenciales → el cliente OAuth → **Restablecer secreto** (o crear un cliente nuevo).
2. Pegar el nuevo con `node scripts/pegar-del-portapapeles.mjs GOOGLE_CLIENT_SECRET`.
3. `npm run google:autorizar` (genera un refresh token nuevo). Para cortar el acceso del anterior: en la cuenta de demo,
   myaccount.google.com → Seguridad → Apps con acceso → Remito demo → Quitar acceso.

## Tests

`npm test` corre sin red (fetch simulado): éxito, 401, 404, 429 con y sin Retry-After, 403 por límite, 503 con
reintentos, timeout, respuesta que no cumple el schema, 2xx que no es JSON, `invalid_grant`, POST sin reintento,
destinos no permitidos, OAuth en caché, Gmail (adjuntos anidados, paginación, base64url), Sheets (append, filas de
menos) y los cortes a mitad de camino del procesador y de la aprobación.
