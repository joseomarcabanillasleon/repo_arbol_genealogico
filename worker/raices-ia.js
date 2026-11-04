// Intermediario de IA para Raíces (Cloudflare Worker).
// Guarda la clave de Gemini como secreto (nunca llega al navegador), solo acepta
// peticiones de la web de Raíces y solo hace dos tareas concretas.
//
// Secretos / variables (ver docs/CONFIGURAR-IA.md):
//   GEMINI_API_KEY   (secreto, obligatorio)
//   ACCESS_CODE      (secreto, opcional) código familiar que deben enviar las peticiones
//   ALLOWED_ORIGINS  orígenes permitidos, separados por comas
//   MODEL            modelo de Gemini (por defecto gemini-flash-latest)
//   MAX_PER_MINUTE   peticiones por minuto y por IP (por defecto 10)

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_BODY = 6 * 1024 * 1024;
const hits = new Map(); // límite sencillo por IP (por instancia)

const ROLES = ['principal', 'padre', 'madre', 'abuelo_paterno', 'abuela_paterna', 'abuelo_materno', 'abuela_materna', 'conyuge', 'hijo', 'padrino', 'madrina', 'testigo', 'otro'];

const DOC_SCHEMA = {
  type: 'OBJECT',
  properties: {
    documentType: { type: 'STRING', description: 'Tipo: partida de bautismo, acta de nacimiento, matrimonio, defunción, libro de familia, esquela, lápida, padrón, otro' },
    documentDate: { type: 'STRING', description: 'Fecha del documento' },
    documentPlace: { type: 'STRING' },
    summary: { type: 'STRING', description: 'Resumen en español, 1-2 frases' },
    transcription: { type: 'STRING', description: 'Transcripción legible del texto principal, máximo 1200 caracteres' },
    confidence: { type: 'STRING', enum: ['alta', 'media', 'baja'] },
    people: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          role: { type: 'STRING', enum: ROLES },
          givenName: { type: 'STRING' },
          surname: { type: 'STRING' },
          sex: { type: 'STRING', enum: ['M', 'F', 'U'] },
          birthDate: { type: 'STRING' },
          birthPlace: { type: 'STRING' },
          deathDate: { type: 'STRING' },
          deathPlace: { type: 'STRING' },
          occupation: { type: 'STRING' },
          notes: { type: 'STRING' },
        },
        required: ['role', 'givenName', 'surname', 'sex'],
      },
    },
  },
  required: ['documentType', 'summary', 'confidence', 'people'],
};

const DOC_PROMPT = `Eres un archivero experto en genealogía hispana (España y Latinoamérica), incluida la letra antigua y el latín de los libros parroquiales.
Lee el documento de la imagen (partida de bautismo, acta de nacimiento, matrimonio o defunción, libro de familia, esquela, lápida, padrón...).
Reglas:
- Extrae SOLO lo que aparece en el documento. No inventes ni deduzcas datos que no estén escritos. Si algo no se lee, déjalo vacío.
- "principal" es la persona de la que trata el documento (el bautizado, el nacido, el difunto; en un matrimonio, el novio o la novia que indique el usuario, o el primero que aparezca).
- Los roles de padres y abuelos son respecto a la persona principal. En un matrimonio, el otro contrayente es "conyuge".
- Fechas en formato "12 MAR 1950" (mes en inglés, abreviado a 3 letras), o solo el año si no hay más. Fechas aproximadas: "ABT 1900".
- Lugares como "Pueblo, Provincia, País" cuando se pueda.
- Nombres con mayúscula inicial y apellidos completos tal como aparecen.`;

function story(person, relatives, audience) {
  const kids = audience === 'niños';
  return `Escribe una breve historia de vida en español de ${kids ? '80 a 120 palabras para niños de 4 a 8 años, con frases cortas y cálidas' : '120 a 180 palabras, cálida y respetuosa'}.
Usa SOLO estos datos; no inventes hechos, fechas, lugares ni anécdotas. Si faltan datos, no los rellenes: escribe una historia más corta.
No uses títulos ni listas: un solo párrafo de texto.

Persona: ${JSON.stringify(person)}
Familiares: ${JSON.stringify(relatives)}`;
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
}

async function gemini(env, parts, generationConfig = {}) {
  const model = env.MODEL || 'gemini-flash-latest';
  const res = await fetch(`${GEMINI}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.2, ...generationConfig } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    const err = new Error(res.status === 429 ? 'Se ha alcanzado el límite de uso de la IA. Prueba más tarde.' : `Error de Gemini: ${msg}`);
    err.status = res.status === 429 ? 429 : 502;
    throw err;
  }
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  if (!text) throw Object.assign(new Error('La IA no devolvió respuesta (puede que la imagen no se lea bien).'), { status: 502 });
  return { text, model };
}

function rateLimited(ip, max) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now);
  hits.set(ip, list);
  return list.length > max;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const cors = allowed.includes(origin)
      ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, x-raices-code', 'Access-Control-Max-Age': '86400', Vary: 'Origin' }
      : null;
    if (request.method === 'OPTIONS') return new Response(null, { status: cors ? 204 : 403, headers: cors || {} });
    if (!cors) return json({ error: 'Origen no permitido' }, 403);
    if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405, cors);
    if (!env.GEMINI_API_KEY) return json({ error: 'Falta configurar GEMINI_API_KEY en el Worker' }, 500, cors);
    if (env.ACCESS_CODE && request.headers.get('x-raices-code') !== env.ACCESS_CODE) return json({ error: 'Código familiar incorrecto' }, 401, cors);
    if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return json({ error: 'La imagen es demasiado grande' }, 413, cors);
    const ip = request.headers.get('cf-connecting-ip') || 'local';
    if (rateLimited(ip, Number(env.MAX_PER_MINUTE || 10))) return json({ error: 'Demasiadas peticiones seguidas. Espera un minuto.' }, 429, cors);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Petición no válida' }, 400, cors);
    }
    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    try {
      if (path.endsWith('/ping')) {
        const r = await gemini(env, [{ text: 'Responde solo con la palabra OK.' }], { maxOutputTokens: 10 });
        return json({ ok: true, model: r.model }, 200, cors);
      }
      if (path.endsWith('/documento')) {
        const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.image || '');
        if (!m) return json({ error: 'Envía una imagen JPEG, PNG o WebP' }, 400, cors);
        const hint = String(body.hint || '').slice(0, 300);
        const r = await gemini(env, [
          { text: DOC_PROMPT + (hint ? `\nContexto del usuario: ${hint}` : '') },
          { inlineData: { mimeType: m[1], data: m[2] } },
        ], { responseMimeType: 'application/json', responseSchema: DOC_SCHEMA });
        return json({ result: JSON.parse(r.text), model: r.model }, 200, cors);
      }
      if (path.endsWith('/historia')) {
        const r = await gemini(env, [{ text: story(body.person || {}, body.relatives || [], body.audience) }], { temperature: 0.6, maxOutputTokens: 600 });
        return json({ text: r.text.trim(), model: r.model }, 200, cors);
      }
      return json({ error: 'Ruta no encontrada' }, 404, cors);
    } catch (err) {
      return json({ error: err.message }, err.status || 500, cors);
    }
  },
};
