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

## Paso 1. Conseguir la clave de Google Gemini (2 minutos)

1. Entra en <https://aistudio.google.com/apikey> con tu cuenta de Google.
2. Pulsa **«Create API key»** (Crear clave de API) y cópiala. **No la compartas ni la pegues en la app.**
3. (Recomendado) En Google Cloud, activa la facturación del proyecto de esa clave y crea un **presupuesto con alerta**.

## Paso 2. Crear el servicio de IA en Cloudflare (10 minutos)

Necesitas una cuenta gratuita en <https://dash.cloudflare.com/sign-up> y Node.js en tu ordenador.

```bash
git clone https://github.com/joseomarcabanillasleon/repo_arbol_genealogico.git
cd repo_arbol_genealogico/worker

npx wrangler login                       # abre el navegador para entrar en Cloudflare
npx wrangler secret put GEMINI_API_KEY   # pega la clave del paso 1
npx wrangler secret put ACCESS_CODE      # inventa un código familiar, p. ej. "naranjos-1946"
npx wrangler deploy                      # publica el servicio
```

Al terminar, `wrangler deploy` muestra la dirección del servicio, algo como:
`https://raices-ia.TU-USUARIO.workers.dev`

El modelo por defecto es `gemini-flash-latest` (siempre el Flash más reciente). Se puede cambiar en `worker/wrangler.toml` (`MODEL`).

## Paso 3. Conectar la app (1 minuto)

**Opción A — para toda la familia (recomendada):** escribe la dirección en `js/config.js`:

```js
export const AI_ENDPOINT = 'https://raices-ia.TU-USUARIO.workers.dev';
```

y publícalo (commit a `main`). La dirección no es secreta: sin el código familiar no sirve.

**Opción B — solo en tu dispositivo:** en la app, **Inicio → Conectar IA** (o menú **⋮ → Inteligencia artificial**), pega la dirección y el código, y pulsa **Probar y guardar**.

En cada móvil de la familia, la primera vez que usen la IA la app les pedirá el **código familiar** (se lo das tú por WhatsApp). Se guarda solo en ese dispositivo.

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
| «Error de Gemini: … model …» | Cambia `MODEL` en `wrangler.toml` por un modelo disponible en AI Studio y despliega de nuevo. |
