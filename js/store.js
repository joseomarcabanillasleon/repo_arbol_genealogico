// Modelo de datos del árbol. Sin dependencias del DOM para poder testearlo en Node.
//
// person: { id, givenName, surname, sex: 'M'|'F'|'U', occupation,
//           birth: {date, place}, death: {date, place}, deceased, photo, notes }
// family: { id, partners: [personId...] (0-2), children: [personId...],
//           marriage: {date, place} }
// Es el mismo modelo que GEDCOM (INDI + FAM), lo que facilita importar/exportar.

import { yearOf } from './dates.js';

let counter = 0;
export function uid(prefix) {
  counter = (counter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyPerson(data = {}) {
  return {
    id: data.id || uid('p'),
    givenName: (data.givenName || '').trim(),
    surname: (data.surname || '').trim(),
    sex: ['M', 'F'].includes(data.sex) ? data.sex : 'U',
    occupation: (data.occupation || '').trim(),
    birth: { date: data.birth?.date || '', place: data.birth?.place || '' },
    death: { date: data.death?.date || '', place: data.death?.place || '' },
    deceased: Boolean(data.deceased || data.death?.date || data.death?.place),
    photo: data.photo || '',
    notes: data.notes || '',
  };
}

export class FamilyTree {
  constructor(data) {
    this.people = {};
    this.families = {};
    this.rootId = null;
    this.name = '';
    this.listeners = new Set();
    if (data) this.load(data);
  }

  // ---------- persistencia ----------
  load(data) {
    this.people = {};
    this.families = {};
    for (const p of Object.values(data.people || {})) this.people[p.id] = emptyPerson(p);
    for (const f of Object.values(data.families || {})) {
      this.families[f.id] = {
        id: f.id,
        partners: (f.partners || []).filter((id) => this.people[id]).slice(0, 2),
        children: (f.children || []).filter((id) => this.people[id]),
        marriage: { date: f.marriage?.date || '', place: f.marriage?.place || '' },
      };
    }
    this.rootId = this.people[data.rootId] ? data.rootId : Object.keys(this.people)[0] || null;
    this.name = typeof data.name === 'string' ? data.name : '';
    this.cleanup();
  }

  toJSON() {
    return { version: 1, name: this.name, rootId: this.rootId, people: this.people, families: this.families };
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  changed() {
    for (const fn of this.listeners) fn(this);
  }

  // ---------- consultas ----------
  get(id) {
    return this.people[id] || null;
  }

  get size() {
    return Object.keys(this.people).length;
  }

  all() {
    return Object.values(this.people);
  }

  parentFamilies(id) {
    return Object.values(this.families).filter((f) => f.children.includes(id));
  }

  parentFamily(id) {
    return this.parentFamilies(id)[0] || null;
  }

  spouseFamilies(id) {
    return Object.values(this.families).filter((f) => f.partners.includes(id));
  }

  parents(id) {
    const f = this.parentFamily(id);
    return f ? [...f.partners] : [];
  }

  /** Padres ordenados [padre, madre] según sexo (para dibujar). */
  orderedParents(id) {
    const ps = this.parents(id).map((pid) => this.people[pid]);
    ps.sort((a, b) => rankSex(a.sex) - rankSex(b.sex));
    return ps.map((p) => p.id);
  }

  spouses(id) {
    return this.spouseFamilies(id)
      .map((f) => f.partners.find((p) => p !== id))
      .filter(Boolean);
  }

  children(id) {
    return [...new Set(this.spouseFamilies(id).flatMap((f) => f.children))];
  }

  siblings(id) {
    const out = new Set();
    for (const f of this.parentFamilies(id)) f.children.forEach((c) => c !== id && out.add(c));
    return [...out];
  }

  familyOf(a, b) {
    return Object.values(this.families).find((f) => f.partners.includes(a) && f.partners.includes(b)) || null;
  }

  search(q, limit = 20) {
    const needle = normalize(q);
    if (!needle) return [];
    return this.all()
      .filter((p) => normalize(`${p.givenName} ${p.surname}`).includes(needle))
      .sort((a, b) => fullName(a).localeCompare(fullName(b), 'es'))
      .slice(0, limit);
  }

  // ---------- mutaciones ----------
  /** Acepta un id existente o datos de una persona nueva. Devuelve el id. */
  resolve(personOrId) {
    if (typeof personOrId === 'string') {
      if (!this.people[personOrId]) throw new Error('La persona no existe');
      return personOrId;
    }
    const p = emptyPerson(personOrId);
    this.people[p.id] = p;
    if (!this.rootId) this.rootId = p.id;
    return p.id;
  }

  addPerson(data) {
    const id = this.resolve(data);
    this.changed();
    return id;
  }

  updatePerson(id, data) {
    const cur = this.people[id];
    if (!cur) throw new Error('La persona no existe');
    this.people[id] = emptyPerson({ ...cur, ...data, id });
    this.changed();
  }

  deletePerson(id) {
    if (!this.people[id]) return;
    delete this.people[id];
    for (const f of Object.values(this.families)) {
      f.partners = f.partners.filter((p) => p !== id);
      f.children = f.children.filter((c) => c !== id);
    }
    if (this.rootId === id) this.rootId = Object.keys(this.people)[0] || null;
    this.cleanup();
    this.changed();
  }

  newFamily(partners = [], children = []) {
    const f = { id: uid('f'), partners, children, marriage: { date: '', place: '' } };
    this.families[f.id] = f;
    return f;
  }

  addParent(childId, parent) {
    let fam = this.parentFamily(childId);
    if (fam && fam.partners.length >= 2) throw new Error('Esta persona ya tiene dos progenitores registrados');
    const pid = this.resolve(parent);
    if (pid === childId) throw new Error('Una persona no puede ser su propio progenitor');
    if (this.isAncestor(childId, pid)) throw new Error('Eso crearía un ciclo en el árbol');
    if (!fam) {
      // Si el nuevo progenitor ya tiene una familia sin pareja, reutilizarla
      fam = this.spouseFamilies(pid).find((f) => f.partners.length === 1) || this.newFamily([], []);
      if (!fam.children.includes(childId)) fam.children.push(childId);
    }
    if (!fam.partners.includes(pid)) fam.partners.push(pid);
    this.changed();
    return pid;
  }

  addPartner(personId, partner, marriage = {}) {
    const sid = this.resolve(partner);
    if (sid === personId) throw new Error('Una persona no puede ser su propia pareja');
    let fam = this.familyOf(personId, sid);
    if (!fam) {
      // Reutiliza una familia monoparental de la persona (hijos ya registrados)
      fam = this.spouseFamilies(personId).find((f) => f.partners.length === 1);
      if (fam) fam.partners.push(sid);
      else fam = this.newFamily([personId, sid], []);
    }
    fam.marriage = { date: marriage.date || fam.marriage.date, place: marriage.place || fam.marriage.place };
    this.changed();
    return sid;
  }

  /** otherParentId: null => familia monoparental; undefined => la única familia existente. */
  addChild(personId, child, otherParentId) {
    const cid = this.resolve(child);
    if (cid === personId) throw new Error('Una persona no puede ser su propio hijo');
    if (this.isAncestor(cid, personId)) throw new Error('Eso crearía un ciclo en el árbol');
    let fam;
    if (otherParentId) {
      fam = this.familyOf(personId, otherParentId) || this.newFamily([personId, otherParentId], []);
    } else if (otherParentId === null) {
      fam = this.spouseFamilies(personId).find((f) => f.partners.length === 1) || this.newFamily([personId], []);
    } else {
      const fams = this.spouseFamilies(personId);
      fam = fams.length === 1 ? fams[0] : fams.find((f) => f.partners.length === 1) || this.newFamily([personId], []);
    }
    // Un hijo solo pertenece a una familia de origen en este modelo
    for (const f of this.parentFamilies(cid)) if (f !== fam) f.children = f.children.filter((c) => c !== cid);
    if (!fam.children.includes(cid)) fam.children.push(cid);
    this.cleanup();
    this.changed();
    return cid;
  }

  addSibling(personId, sibling) {
    let fam = this.parentFamily(personId);
    if (!fam) fam = this.newFamily([], [personId]);
    const sid = this.resolve(sibling);
    if (sid === personId) throw new Error('Una persona no puede ser su propio hermano');
    if (!fam.children.includes(sid)) fam.children.push(sid);
    this.changed();
    return sid;
  }

  updateFamily(famId, marriage) {
    const f = this.families[famId];
    if (!f) return;
    f.marriage = { date: marriage.date || '', place: marriage.place || '' };
    this.changed();
  }

  /** Rompe el vínculo de pareja (no borra a nadie). */
  unlinkPartner(personId, partnerId) {
    const f = this.familyOf(personId, partnerId);
    if (!f) return;
    f.partners = f.partners.filter((p) => p !== partnerId);
    this.cleanup();
    this.changed();
  }

  /** Quita a la persona de su familia de origen (no borra a nadie). */
  unlinkParents(personId) {
    for (const f of this.parentFamilies(personId)) f.children = f.children.filter((c) => c !== personId);
    this.cleanup();
    this.changed();
  }

  setRoot(id) {
    if (this.people[id]) {
      this.rootId = id;
      this.changed();
    }
  }

  /** Nombre visible del árbol: el elegido o "Familia <primer apellido> <segundo>" de la persona de inicio. */
  displayName() {
    if (this.name) return this.name;
    const root = this.get(this.rootId);
    return root?.surname ? `Familia ${root.surname}` : 'Mi árbol';
  }

  rename(name) {
    this.name = (name || '').trim();
    this.changed();
  }

  /** Viva = no consta fallecimiento y no nació hace más de 100 años. */
  isLiving(id) {
    const p = this.people[id];
    if (!p || p.deceased) return false;
    const y = yearOf(p.birth.date);
    return !y || y > new Date().getFullYear() - 100;
  }

  clear() {
    this.people = {};
    this.families = {};
    this.rootId = null;
    this.name = '';
    this.changed();
  }

  isAncestor(ancestorId, personId) {
    const seen = new Set();
    const stack = [personId];
    while (stack.length) {
      const id = stack.pop();
      for (const p of this.parents(id)) {
        if (p === ancestorId) return true;
        if (!seen.has(p)) {
          seen.add(p);
          stack.push(p);
        }
      }
    }
    return false;
  }

  cleanup() {
    for (const f of Object.values(this.families)) {
      f.children = [...new Set(f.children)];
      f.partners = [...new Set(f.partners)];
      if (f.partners.length + f.children.length < 2 && !(f.partners.length === 1 && f.children.length === 0 && (f.marriage.date || f.marriage.place))) {
        delete this.families[f.id];
      }
    }
  }

  // ---------- estadísticas ----------
  stats() {
    const people = this.all();
    const surnames = countBy(people.flatMap((p) => p.surname.split(/\s+/).filter(Boolean).slice(0, 1)));
    const places = countBy(people.map((p) => p.birth.place.split(',')[0].trim()).filter(Boolean));
    const centuries = countBy(
      people.map((p) => yearOf(p.birth.date)).filter(Boolean).map((y) => `s. ${toRoman(Math.floor((y - 1) / 100) + 1)}`)
    );
    const lifespans = people
      .map((p) => [yearOf(p.birth.date), yearOf(p.death.date)])
      .filter(([b, d]) => b && d && d >= b)
      .map(([b, d]) => d - b);
    const years = people.map((p) => yearOf(p.birth.date)).filter(Boolean);
    const oldest = people
      .filter((p) => yearOf(p.birth.date))
      .sort((a, b) => yearOf(a.birth.date) - yearOf(b.birth.date))[0];
    return {
      people: people.length,
      families: Object.keys(this.families).length,
      male: people.filter((p) => p.sex === 'M').length,
      female: people.filter((p) => p.sex === 'F').length,
      withPhoto: people.filter((p) => p.photo).length,
      generations: this.generations(),
      surnames: top(surnames, 8),
      places: top(places, 8),
      centuries: Object.entries(centuries).sort((a, b) => fromRoman(a[0]) - fromRoman(b[0])),
      avgLifespan: lifespans.length ? Math.round(lifespans.reduce((a, b) => a + b, 0) / lifespans.length) : null,
      span: years.length ? [Math.min(...years), Math.max(...years)] : null,
      oldest: oldest || null,
    };
  }

  /** Número máximo de generaciones de cualquier línea directa del árbol. */
  generations() {
    const memo = new Map();
    const depth = (id, guard = new Set()) => {
      if (memo.has(id)) return memo.get(id);
      if (guard.has(id)) return 0;
      guard.add(id);
      const ps = this.parents(id);
      const d = 1 + (ps.length ? Math.max(...ps.map((p) => depth(p, guard))) : 0);
      guard.delete(id);
      memo.set(id, d);
      return d;
    };
    let max = 0;
    for (const id of Object.keys(this.people)) max = Math.max(max, depth(id));
    return max;
  }
}

function rankSex(s) {
  return s === 'M' ? 0 : s === 'F' ? 2 : 1;
}

export function normalize(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function fullName(p) {
  if (!p) return '';
  return `${p.givenName} ${p.surname}`.trim() || 'Sin nombre';
}

export function lifeYears(p) {
  const b = yearOf(p.birth.date);
  const d = yearOf(p.death.date);
  if (b && d) return `${b} – ${d}`;
  if (b) return p.deceased ? `${b} – †` : `n. ${b}`;
  if (d) return `† ${d}`;
  return p.deceased ? '†' : '';
}

function countBy(arr) {
  const out = {};
  for (const x of arr) out[x] = (out[x] || 0) + 1;
  return out;
}

function top(obj, n) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
    .slice(0, n);
}

function toRoman(n) {
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}

function fromRoman(label) {
  const s = label.replace('s. ', '');
  const v = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = v[s[i]];
    const next = v[s[i + 1]] || 0;
    total += cur < next ? -cur : cur;
  }
  return total;
}
