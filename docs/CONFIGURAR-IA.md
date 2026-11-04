# Configurar la IA de Raíces (una sola vez)

La IA de Raíces **lee documentos antiguos** (partidas de bautismo, actas, esquelas, lápidas…) y **escribe la historia** de una persona con los datos del árbol. Usa Google Gemini.

Lo configura **una vez** quien administra el árbol. La familia solo usa la app: nunca ve ni necesita ninguna clave.

## Por qué hay un "servicio de IA" intermedio

La app es una web pública (GitHub Pages). Si la clave de Google estuviera en la app, cualquiera podría copiarla del código y gastar tu cuota. Por eso la clave vive en un pequeño servicio intermedio (**Cloudflare Worker**, gratis para este uso) que:

- guarda la clave como secreto (nunca llega al navegador);
- solo acepta peticiones desde la web de Raíces;
- puede exigir un **código familiar**;
- solo hace dos tareas (leer documentos y escribir historias), no sirve para otra cosa;
- limita a 10 peticiones por minuto por persona.

## Antes de empezar: ¿clave gratuita o de pago?

Según los [términos de la API de Gemini](https://ai.google.dev/gemini-api/terms):

- En el **nivel gratuito**, Google puede usar lo que envías para mejorar sus productos y puede haber **revisores humanos**; recomiendan no enviar datos personales.
- Para ofrecer la app a usuarios del **Espacio Económico Europeo** (España incluida), Suiza o Reino Unido, los términos exigen el **nivel de pago**.
- En el **nivel de pago**, Google **no** usa tus datos para mejorar sus productos.

**Recomendación:** activa la facturación en Google con un **límite de presupuesto** bajo. Para un uso familiar el coste suele ser muy pequeño (pago por uso), pero compruébalo en la [página de precios](https://ai.google.dev/gemini-api/docs/pricing) y en el panel de uso de AI Studio.

## Configuración desde GitHub, sin ordenador (recomendada)

Se puede hacer todo desde el navegador del móvil (en Safari, usa **aA → Solicitar sitio web de escritorio** para ver los menús de GitHub y Cloudflare). **Nunca pegues claves en un chat ni en un archivo del repositorio**: solo en los secretos de GitHub.

### Paso 1. Clave de Google Gemini (2 minutos)

1. Entra en <https://aistudio.google.com/apikey> con tu cuenta de Google.
2. Pulsa **«Create API key»** (Crear clave de API) y cópiala.
3. (Recomendado) Activa la facturación de ese proyecto con un **presupuesto y alerta** (ver arriba).

### Paso 2. Cuenta y permiso de Cloudflare (5 minutos)

1. Crea una cuenta gratuita en <https://dash.cloudflare.com/sign-up>.
2. En el panel, abre **Workers & Pages** una vez. Si te pide elegir un subdominio `workers.dev`, elige uno (por ejemplo tu apellido).
3. Copia tu **Account ID**: aparece en **Workers & Pages** (columna derecha) o en la página de inicio de tu cuenta.
4. Crea un permiso (API token): **icono de perfil → My Profile → API Tokens → Create Token →** plantilla **«Edit Cloudflare Workers» → Use template → Continue to summary → Create Token**. Copia el token (solo se muestra una vez).

### Paso 3. Guardar los 4 secretos en GitHub (3 minutos)

Abre <https://github.com/joseomarcabanillasleon/repo_arbol_genealogico/settings/secrets/actions> y pulsa **New repository secret** cuatro veces:

| Name (exacto) | Secret (valor) |
|---|---|
| `GEMINI_API_KEY` | la clave del paso 1 |
| `CLOUDFLARE_API_TOKEN` | el token del paso 2 |
| `CLOUDFLARE_ACCOUNT_ID` | el Account ID del paso 2 |
| `ACCESS_CODE` | un código familiar que inventes, p. ej. `naranjos-1946` |

GitHub los guarda cifrados: nadie (ni tú) puede volver a leerlos, solo reemplazarlos.

### Paso 4. Ejecutar la publicación (1 minuto)

1. Abre <https://github.com/joseomarcabanillasleon/repo_arbol_genealogico/actions/workflows/ia-worker.yml>.
2. Pulsa **Run workflow → Run workflow**.
3. En 1–2 minutos verás un check verde. El workflow:
   - publica el servicio en Cloudflare con la clave como secreto,
   - escribe su dirección en `js/config.js`,
   - vuelve a publicar la web con la IA conectada.

Después, en cada móvil, la primera vez que se use la IA hay que escribir el **código familiar** en **Inicio → Conectar IA**.

Para **cambiar la clave o el código**: reemplaza el secreto en GitHub y vuelve a pulsar *Run workflow*.

## Alternativa: desde un ordenador con la terminal

```bash
git clone https://github.com/joseomarcabanillasleon/repo_arbol_genealogico.git
cd repo_arbol_genealogico/worker
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put ACCESS_CODE
npx wrangler deploy        # muestra la dirección del servicio
```

Después pon esa dirección en `js/config.js` (`export const AI_ENDPOINT = 'https://…workers.dev';`) y publica, o pégala en **Inicio → Conectar IA** solo en tu dispositivo.

## Uso

- **Leer documento antiguo:** Inicio → *Leer documento antiguo (IA)*, o desde la ficha de una persona. Elige de quién es el documento, haz una foto y revisa lo que se añadirá. Nunca se sobrescriben tus datos: las diferencias se muestran para que decidas tú.
- **Escribir su historia:** desde la ficha → *Escribir su historia (IA)*, para adultos o para niños. Se envían solo nombres, fechas y lugares (nunca fotos). Puedes corregir el texto antes de guardarlo.

## Privacidad

- La imagen del documento o los datos de la persona se envían a Google Gemini a través de tu servicio.
- **No envíes fotos de niños** ni documentos de personas vivas que no lo hayan consentido.
- Nada se guarda en el servicio intermedio: solo reenvía la petición y devuelve la respuesta.

## Si algo falla

| Mensaje | Qué hacer |
|---|---|
| «Origen no permitido» | Revisa `ALLOWED_ORIGINS` en `worker/wrangler.toml` y vuelve a hacer `npx wrangler deploy`. |
| «Código familiar incorrecto» | Escribe el código exacto en *Conectar IA*. |
| «Falta configurar GEMINI_API_KEY» | Repite `npx wrangler secret put GEMINI_API_KEY`. |
| «Se ha alcanzado el límite de uso» | Cuota de Google agotada: espera o revisa la facturación en AI Studio. |
| El workflow falla en «Comprobar que están los 4 secretos» | Falta alguno o el nombre no es exacto (mayúsculas incluidas). |
| El workflow falla en «Publicar el servicio en Cloudflare» | Revisa el token (plantilla «Edit Cloudflare Workers»), el Account ID y que hayas elegido el subdominio `workers.dev`. |
| «Error de Gemini: … model …» | Cambia `MODEL` en `wrangler.toml` por un modelo disponible en AI Studio y despliega de nuevo. |
