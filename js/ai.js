// IA de Raíces: llamadas al Worker intermediario y conversión de documentos
// leídos en cambios seguros del árbol (reutiliza la fusión de "Pide ayuda").

import { AI_ENDPOINT } from './config.js';
import { FamilyTree, fullName } from './store.js';
import { applyReply } from './share.js';
import { yearOf, normalizeDate, formatDate } from './dates.js';

const KEY = 'raices.ai.v1';

export function aiSettings(storage = globalThis.localStorage) {
  let saved = {};
  try {
    saved = JSON.parse(storage?.getItem(KEY) || '{}');
  } catch { /* sin almacenamiento */ }
  return { endpoint: (saved.endpoint || AI_ENDPOINT || '').replace(/\/+$/, ''), code: saved.code || '' };
}

export function saveAiSettings(s, storage = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, JSON.stringify({ endpoint: (s.endpoint || '').trim().replace(/\/+$/, ''), code: (s.code || '').trim() }));
  } catch { /* sin almacenamiento */ }
}

export const aiReady = () => Boolean(aiSettings().endpoint);

export async function callAI(path, body, settings = aiSettings(), fetchImpl = globalThis.fetch) {
  if (!settings.endpoint) throw new Error('La IA no está configurada');
  let res;
  try {
    res = await fetchImpl(`${settings.endpoint}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(settings.code ? { 'x-raices-code': settings.code } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('No se pudo conectar con el servicio de IA. Revisa la conexión a internet o la dirección configurada.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

// ---------- documentos ----------
const ROLE_SLOT = { padre: 'f', madre: 'm', abuelo_paterno: 'ff', abuela_paterna: 'fm', abuelo_materno: 'mf', abuela_materna: 'mm' };
const ROLE_LABEL = {
  principal: 'Persona principal', padre: 'Padre', madre: 'Madre', abuelo_paterno: 'Abuelo paterno', abuela_paterna: 'Abuela paterna',
  abuelo_materno: 'Abuelo materno', abuela_materna: 'Abuela materna', conyuge: 'Cónyuge', hijo: 'Hijo/a', padrino: 'Padrino',
  madrina: 'Madrina', testigo: 'Testigo', otro: 'Otra persona',
};
export const roleLabel = (r) => ROLE_LABEL[r] || r;

const clean = (s) => String(s || '').trim();
const person = (p) => ({ g: clean(p.givenName), s: clean(p.surname), b: clean(p.birthDate), bp: clean(p.birthPlace), dd: clean(p.deathDate), dp: clean(p.deathPlace), o: clean(p.occupation) });

/** Nota que se guarda en la persona principal: tipo, fecha, resumen, otras personas y transcripción. */
export function documentNote(ex) {
  const head = [clean(ex.documentType), formatDate(normalizeDate(clean(ex.documentDate))), clean(ex.documentPlace)].filter(Boolean).join(' · ');
  const others = (ex.people || [])
    .filter((p) => !['principal', 'conyuge'].includes(p.role) && !ROLE_SLOT[p.role])
    .map((p) => `${roleLabel(p.role)}: ${[clean(p.givenName), clean(p.surname)].filter(Boolean).join(' ')}${p.notes ? ` (${clean(p.notes)})` : ''}`);
  return [head, clean(ex.summary), others.length ? others.join('; ') : '', ex.transcription ? `Transcripción: ${clean(ex.transcription)}` : '']
    .filter(Boolean).join('\n');
}

/** Convierte lo que devuelve la IA en una "respuesta" para fusionar con applyReply. */
export function extractionToReply(ex, anchorId) {
  const people = ex.people || [];
  const main = people.find((p) => p.role === 'principal');
  const reply = {
    v: 1, t: 'reply', by: `el documento (${clean(ex.documentType) || 'documento'})`, noteLabel: 'Documento leído con IA',
    a: { id: anchorId, n: documentNote(ex) },
    p: {},
  };
  if (main) Object.assign(reply.a, { b: clean(main.birthDate), bp: clean(main.birthPlace), dd: clean(main.deathDate), dp: clean(main.deathPlace), o: clean(main.occupation) });
  for (const p of people) {
    const slot = ROLE_SLOT[p.role];
    if (slot && !reply.p[slot] && (clean(p.givenName) || clean(p.surname))) reply.p[slot] = person(p);
  }
  return reply;
}

/** Aplica (o simula con dryRun) un documento leído. Nunca sobrescribe datos. */
export function applyExtraction(tree, ex, anchorId, { dryRun = false } = {}) {
  const t = dryRun ? new FamilyTree(tree.toJSON()) : tree;
  const res = applyReply(t, extractionToReply(ex, anchorId));
  // cónyuge (en matrimonios): se añade si no existe ya una pareja con ese nombre
  const sp = (ex.people || []).find((p) => p.role === 'conyuge' && (clean(p.givenName) || clean(p.surname)));
  if (sp) {
    const norm = (x) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const exists = t.spouses(anchorId).some((id) => norm(t.get(id).givenName).split(' ')[0] === norm(clean(sp.givenName)).split(' ')[0]);
    if (!exists) {
      const date = (ex.documentType || '').toLowerCase().includes('matrimonio') ? normalizeDate(clean(ex.documentDate)) : '';
      const id = t.addPartner(anchorId, {
        givenName: clean(sp.givenName), surname: clean(sp.surname), sex: ['M', 'F'].includes(sp.sex) ? sp.sex : 'U',
        birth: { date: normalizeDate(clean(sp.birthDate)), place: clean(sp.birthPlace) },
      }, { date, place: date ? clean(ex.documentPlace) : '' });
      res.changes.push(`Nueva persona: ${fullName(t.get(id))} (cónyuge)`);
    }
  }
  return res;
}

/** Datos (sin fotos) que se envían para escribir la historia de una persona. */
export function storyPayload(tree, id) {
  const p = tree.get(id);
  const facts = (x) => ({
    nombre: fullName(x),
    sexo: x.sex,
    nacimiento: [x.birth.date, x.birth.place].filter(Boolean).join(', ') || undefined,
    defuncion: x.deceased ? [x.death.date, x.death.place].filter(Boolean).join(', ') || 'fallecido/a' : undefined,
    ocupacion: x.occupation || undefined,
  });
  const rel = (ids, label) => ids.map((r) => ({ parentesco: label, nombre: fullName(tree.get(r)), nacimiento: yearOf(tree.get(r).birth.date) || undefined }));
  const fams = tree.spouseFamilies(id);
  return {
    person: { ...facts(p), notas: p.notes ? p.notes.slice(0, 1500) : undefined },
    relatives: [
      ...rel(tree.parents(id), 'padre/madre'),
      ...fams.flatMap((f) => f.partners.filter((x) => x !== id).map((x) => ({ parentesco: 'pareja', nombre: fullName(tree.get(x)), union: [f.marriage.date, f.marriage.place].filter(Boolean).join(', ') || undefined }))),
      ...rel(tree.children(id), 'hijo/a'),
      ...rel(tree.siblings(id), 'hermano/a'),
    ],
  };
}
