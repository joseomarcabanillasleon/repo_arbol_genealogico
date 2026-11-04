// "Pide ayuda a la familia": enlaces de invitación y de respuesta SIN servidor.
// Los datos viajan dentro del fragmento de la URL (#...), que el navegador nunca
// envía al servidor web. Sin DOM salvo CompressionStream (también disponible en Node).

import { FamilyTree, fullName } from './store.js';
import { normalizeDate, formatDate } from './dates.js';

export const SLOTS = ['f', 'm', 'ff', 'fm', 'mf', 'mm'];
const SLOT_PARENT = { f: null, m: null, ff: 'f', fm: 'f', mf: 'm', mm: 'm' };
const SLOT_SEX = { f: 'M', m: 'F', ff: 'M', fm: 'F', mf: 'M', mm: 'F' };
const lowerFirst = (str) => str.charAt(0).toLowerCase() + str.slice(1);

/** Cómo se llama cada hueco respecto a la persona de la rama. */
export function slotLabel(slot, anchorName) {
  return {
    f: `Padre de ${anchorName}`,
    m: `Madre de ${anchorName}`,
    ff: `Abuelo paterno de ${anchorName}`,
    fm: `Abuela paterna de ${anchorName}`,
    mf: `Abuelo materno de ${anchorName}`,
    mm: `Abuela materna de ${anchorName}`,
  }[slot];
}

// ---------- codificación: JSON → deflate → base64url ----------
function b64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodePayload(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === 'function') return 'z' + b64url(await pipe(raw, new CompressionStream('deflate-raw')));
  return 'j' + b64url(raw);
}

export async function decodePayload(str) {
  const kind = str[0];
  let bytes = unb64url(str.slice(1));
  if (kind === 'z') {
    if (typeof DecompressionStream !== 'function') throw new Error('Este navegador es demasiado antiguo para abrir el enlace. Actualiza el sistema o prueba con otro navegador.');
    bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  } else if (kind !== 'j') {
    throw new Error('Enlace no válido');
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

// ---------- invitación ----------
const pack = (p) => p && {
  id: p.id,
  g: p.givenName,
  s: p.surname,
  x: p.sex,
  b: p.birth.date,
  bp: p.birth.place,
  dec: p.deceased ? 1 : 0,
};

function parentBySex(tree, id, sex) {
  if (!id) return null;
  const ps = tree.orderedParents(id).map((pid) => tree.get(pid));
  return ps.find((p) => p.sex === sex) || (sex === 'M' ? ps.find((p) => p.sex === 'U') : null) || null;
}

/** Resuelve las personas que ya existen en cada hueco de la rama. */
export function resolveSlots(tree, anchorId) {
  const f = parentBySex(tree, anchorId, 'M');
  const m = parentBySex(tree, anchorId, 'F');
  return {
    f, m,
    ff: parentBySex(tree, f?.id, 'M'), fm: parentBySex(tree, f?.id, 'F'),
    mf: parentBySex(tree, m?.id, 'M'), mm: parentBySex(tree, m?.id, 'F'),
  };
}

/** Datos (sin fotos) que viajan en la invitación: la persona, sus padres y sus abuelos. */
export function buildInvite(tree, anchorId, fromName) {
  const a = tree.get(anchorId);
  if (!a) throw new Error('La persona no existe');
  const slots = resolveSlots(tree, anchorId);
  return {
    v: 1,
    t: 'invite',
    from: fromName || '',
    fam: tree.displayName(),
    a: pack(a),
    k: Object.fromEntries(SLOTS.map((s) => [s, pack(slots[s])]).filter(([, p]) => p)),
  };
}

export function linkFor(base, kind, encoded) {
  return `${base.split('#')[0]}#${kind}=${encoded}`;
}

/** Lee el fragmento de la URL: { kind: 'ayuda'|'respuesta', data } o null. */
export function parseHash(hash) {
  const m = (hash || '').match(/^#(ayuda|respuesta)=([A-Za-z0-9_-]+)$/);
  return m ? { kind: m[1], data: m[2] } : null;
}

/** Extrae el fragmento de un enlace pegado (o de un texto que lo contenga). */
export function extractHash(text) {
  const m = (text || '').match(/#(ayuda|respuesta)=([A-Za-z0-9_-]+)/);
  return m ? `#${m[1]}=${m[2]}` : null;
}

// ---------- respuesta y fusión ----------
/**
 * reply: { v, t:'reply', by, fam, a:{ id, b, bp, n }, p:{ slot: { id?, g, s, b, bp, dec, ph?, n? } } }
 * Solo rellena lo que está vacío y añade personas que faltan; nunca sobrescribe:
 * las diferencias se devuelven como "conflicts" para que el usuario decida.
 */
export function applyReply(tree, reply, { dryRun = false } = {}) {
  if (reply?.t !== 'reply') throw new Error('Esto no es una respuesta de Raíces');
  const t = dryRun ? new FamilyTree(tree.toJSON()) : tree;
  const anchor = t.get(reply.a?.id);
  if (!anchor) throw new Error('La persona de esta respuesta no está en tu árbol');
  const by = reply.by || 'un familiar';
  const changes = [];
  const conflicts = [];

  const fill = (person, d, label) => {
    const upd = {};
    const set = (key, val, text) => {
      upd[key] = val;
      changes.push(`${label}: ${text}`);
    };
    const date = normalizeDate(d.b || '');
    if (!d.skipNames) {
      if (!person.givenName && d.g) set('givenName', d.g, `nombre «${d.g}»`);
      if (!person.surname && d.s) set('surname', d.s, `apellidos «${d.s}»`);
    }
    if (date) {
      if (!person.birth.date) upd.birth = { ...person.birth, date }, changes.push(`${label}: nacimiento ${formatDate(date)}`);
      else if (person.birth.date !== date) conflicts.push(`${label}: nacimiento — tú tienes ${formatDate(person.birth.date)}, ${by} dice ${formatDate(date)}`);
    }
    if (d.bp) {
      if (!person.birth.place) upd.birth = { ...(upd.birth || person.birth), place: d.bp }, changes.push(`${label}: lugar de nacimiento ${d.bp}`);
      else if (person.birth.place.trim().toLowerCase() !== d.bp.trim().toLowerCase()) conflicts.push(`${label}: lugar — tú tienes ${person.birth.place}, ${by} dice ${d.bp}`);
    }
    if (d.dec === 1 && !person.deceased) set('deceased', true, 'ha fallecido');
    if (d.dec === 0 && person.deceased) conflicts.push(`${label}: en tu árbol consta como fallecido/a; ${by} indica que vive`);
    if (d.ph && !person.photo) set('photo', d.ph, 'foto añadida');
    if (d.n) set('notes', [person.notes, `Recuerdo de ${by}: ${d.n}`].filter(Boolean).join('\n\n'), 'nueva historia');
    if (Object.keys(upd).length) t.updatePerson(person.id, upd);
  };

  const anchorLabel = fullName(anchor);
  fill(anchor, { ...reply.a, skipNames: true }, anchorLabel);

  const ids = { a: anchor.id };
  const existing = resolveSlots(t, anchor.id);
  for (const slot of SLOTS) {
    const d = reply.p?.[slot];
    const childId = SLOT_PARENT[slot] ? ids[SLOT_PARENT[slot]] : anchor.id;
    let person = existing[slot] || (d?.id && t.get(d.id)) || null;
    if (person) {
      ids[slot] = person.id;
      if (d) fill(t.get(person.id), d, `${fullName(person)} (${lowerFirst(slotLabel(slot, anchor.givenName))})`);
      continue;
    }
    if (!d || !(d.g || d.s) || !childId) continue;
    const data = {
      givenName: d.g,
      surname: d.s,
      sex: SLOT_SEX[slot],
      birth: { date: normalizeDate(d.b || ''), place: d.bp || '' },
      deceased: d.dec === 1,
      photo: d.ph || '',
      notes: d.n ? `Recuerdo de ${by}: ${d.n}` : '',
    };
    try {
      ids[slot] = t.addParent(childId, data);
      changes.push(`Nueva persona: ${fullName(t.get(ids[slot]))} (${lowerFirst(slotLabel(slot, anchor.givenName))})${d.ph ? ', con foto' : ''}`);
    } catch (e) {
      conflicts.push(`${slotLabel(slot, anchor.givenName)}: no se pudo añadir (${e.message})`);
    }
  }
  return { changes, conflicts, by };
}
