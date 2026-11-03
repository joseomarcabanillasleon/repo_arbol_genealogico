// Lógica de la pantalla de Inicio (sin DOM, testeable):
// preguntas para completar el árbol, completitud, aniversarios y revisión de datos.

import { MONTHS_GED, yearOf } from './dates.js';
import { fullName } from './store.js';

const g = (sex, m, f, u) => (sex === 'M' ? m : sex === 'F' ? f : u);
const first = (p) => (p?.givenName || '').split(/\s+/)[0] || fullName(p);

/** Etiqueta de parentesco respecto a "tú" para los familiares cercanos. */
function kin(tree, rootId, id) {
  if (id === rootId) return 'tú';
  const p = tree.get(id);
  const parents = tree.parents(rootId);
  if (parents.includes(id)) return g(p.sex, 'tu padre', 'tu madre', 'tu progenitor');
  for (const par of parents) {
    if (tree.parents(par).includes(id)) {
      const side = tree.get(par).sex === 'F' ? 'materno' : tree.get(par).sex === 'M' ? 'paterno' : '';
      return `tu ${g(p.sex, 'abuelo', 'abuela', 'abuelo/a')}${side ? ' ' + (p.sex === 'F' ? side.replace(/o$/, 'a') : side) : ''}`;
    }
  }
  if (tree.spouses(rootId).includes(id)) return g(p.sex, 'tu esposo', 'tu esposa', 'tu pareja');
  if (tree.children(rootId).includes(id)) return g(p.sex, 'tu hijo', 'tu hija', 'tu hijo/a');
  if (tree.siblings(rootId).includes(id)) return g(p.sex, 'tu hermano', 'tu hermana', 'tu hermano/a');
  return fullName(p);
}

/**
 * Preguntas para completar el árbol, de la más importante a la menos.
 * Cada una: { id, text, subjectId, sex?, yes: { mode, anchor, sex? } }
 * yes.mode: 'partner' | 'child' | 'sibling' | 'parent' | 'edit'
 */
export function questions(tree, rootId, dismissed = {}) {
  const me = tree.get(rootId);
  if (!me) return [];
  const out = [];
  const add = (q) => !dismissed[q.id] && out.push(q);

  // 1) familia directa que falta
  if (!tree.spouses(rootId).length) {
    add({ id: `partner:${rootId}`, subjectId: rootId, text: g(me.sex, '¿Tienes esposa o pareja?', '¿Tienes esposo o pareja?', '¿Tienes pareja?'), yes: { mode: 'partner', anchor: rootId } });
  }
  if (!tree.children(rootId).length) {
    add({ id: `children:${rootId}`, subjectId: rootId, text: '¿Tienes hijos?', yes: { mode: 'child', anchor: rootId } });
  }
  const parents = tree.orderedParents(rootId).map((id) => tree.get(id));
  for (const sex of ['F', 'M']) {
    if (!parents.some((p) => p.sex === sex) && parents.length < 2) {
      add({ id: `parent-${sex}:${rootId}`, subjectId: rootId, sex, text: sex === 'F' ? '¿Sabes cómo se llama tu madre?' : '¿Sabes cómo se llama tu padre?', yes: { mode: 'parent', anchor: rootId, sex } });
    }
  }
  if (!tree.siblings(rootId).length) {
    add({ id: `siblings:${rootId}`, subjectId: rootId, text: '¿Tienes hermanos?', yes: { mode: 'sibling', anchor: rootId } });
  }
  // 2) abuelos que faltan
  for (const par of parents) {
    const gp = tree.orderedParents(par.id).map((id) => tree.get(id));
    for (const sex of ['F', 'M']) {
      if (!gp.some((p) => p.sex === sex) && gp.length < 2) {
        const who = sex === 'F' ? 'la madre' : 'el padre';
        add({ id: `parent-${sex}:${par.id}`, subjectId: par.id, sex, text: `¿Sabes cómo se llamaba ${who} de ${first(par)} (${kin(tree, rootId, par.id)})?`, yes: { mode: 'parent', anchor: par.id, sex } });
      }
    }
  }
  // 3) datos de la familia cercana: fecha, lugar y foto
  const close = [rootId, ...parents.map((p) => p.id), ...tree.spouses(rootId), ...tree.children(rootId)];
  for (const par of parents) close.push(...tree.parents(par.id));
  const uniq = [...new Set(close)];
  for (const id of uniq) {
    const p = tree.get(id);
    const name = id === rootId ? 'tú' : `${first(p)} (${kin(tree, rootId, id)})`;
    if (!p.birth.date) add({ id: `birth:${id}`, subjectId: id, text: id === rootId ? '¿Cuándo naciste?' : `¿Sabes cuándo nació ${name}?`, yes: { mode: 'edit', anchor: id } });
  }
  for (const id of uniq) {
    const p = tree.get(id);
    if (!p.photo) add({ id: `photo:${id}`, subjectId: id, text: id === rootId ? '¿Quieres poner tu foto?' : `¿Tienes una foto de ${first(p)} (${kin(tree, rootId, id)})?`, yes: { mode: 'edit', anchor: id } });
  }
  for (const id of uniq) {
    const p = tree.get(id);
    if (!p.birth.place) add({ id: `place:${id}`, subjectId: id, text: id === rootId ? '¿Dónde naciste?' : `¿Sabes dónde nació ${first(p)} (${kin(tree, rootId, id)})?`, yes: { mode: 'edit', anchor: id } });
  }
  return out;
}

/** Completitud: antepasados directos conocidos hasta bisabuelos (15 huecos) y calidad de sus datos. */
export function completeness(tree, rootId) {
  if (!tree.get(rootId)) return { known: 0, total: 15, pct: 0, withDate: 0, withPhoto: 0, byGen: [] };
  let level = [rootId];
  const known = [rootId];
  const byGen = [{ gen: 0, known: 1, total: 1 }];
  for (let gen = 1; gen <= 3; gen++) {
    const next = level.flatMap((id) => (id ? tree.parents(id) : []));
    byGen.push({ gen, known: next.length, total: 2 ** gen });
    known.push(...next);
    level = next;
  }
  const total = 15;
  const people = known.map((id) => tree.get(id));
  return {
    known: known.length,
    total,
    pct: Math.round((known.length / total) * 100),
    withDate: people.filter((p) => p.birth.date).length,
    withPhoto: people.filter((p) => p.photo).length,
    byGen,
  };
}

function dayMonth(date) {
  const m = (date || '').match(/^(?:ABT |EST |CAL )?(\d{1,2}) ([A-Z]{3}) (\d{3,4})$/);
  if (!m) return null;
  const mo = MONTHS_GED.indexOf(m[2]);
  return mo < 0 ? null : { d: +m[1], m: mo, y: +m[3] };
}

/** Cumpleaños, aniversarios de boda y de fallecimiento en los próximos `days` días. */
export function upcoming(tree, today = new Date(), days = 30) {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const out = [];
  const push = (date, info) => {
    const dm = dayMonth(date);
    if (!dm) return;
    let next = new Date(t0.getFullYear(), dm.m, dm.d);
    if (next < t0) next = new Date(t0.getFullYear() + 1, dm.m, dm.d);
    const inDays = Math.round((next - t0) / 86400000);
    if (inDays > days) return;
    out.push({ ...info, inDays, date: next, years: next.getFullYear() - dm.y });
  };
  for (const p of tree.all()) {
    push(p.birth.date, { kind: p.deceased ? 'birth-memory' : 'birthday', personIds: [p.id] });
    if (p.deceased) push(p.death.date, { kind: 'death', personIds: [p.id] });
  }
  for (const f of Object.values(tree.families)) {
    if (f.partners.length === 2) push(f.marriage.date, { kind: 'wedding', personIds: [...f.partners] });
  }
  return out.sort((a, b) => a.inDays - b.inDays);
}

/** Posibles errores en las fechas (como un revisor de coherencia). */
export function consistency(tree, now = new Date()) {
  const issues = [];
  const year = now.getFullYear();
  for (const p of tree.all()) {
    const b = yearOf(p.birth.date);
    const d = yearOf(p.death.date);
    const name = fullName(p);
    if (b && d && d < b) issues.push({ personId: p.id, text: `${name}: la defunción (${d}) es anterior al nacimiento (${b}).` });
    if (b && b > year) issues.push({ personId: p.id, text: `${name}: el año de nacimiento (${b}) está en el futuro.` });
    if (b && !p.deceased && year - b > 110) issues.push({ personId: p.id, text: `${name} tendría ${year - b} años. ¿Ha fallecido?` });
    for (const parId of tree.parents(p.id)) {
      const par = tree.get(parId);
      const pb = yearOf(par.birth.date);
      const pd = yearOf(par.death.date);
      if (b && pb) {
        const age = b - pb;
        const max = par.sex === 'F' ? 55 : 80;
        if (age < 12) issues.push({ personId: p.id, text: `${fullName(par)} tendría ${age} años cuando nació ${name}.` });
        else if (age > max) issues.push({ personId: p.id, text: `${fullName(par)} tendría ${age} años cuando nació ${name}. ¿Es correcto?` });
      }
      if (b && pd && b > pd + (par.sex === 'F' ? 0 : 1)) issues.push({ personId: p.id, text: `${name} nació en ${b}, después de la defunción de ${fullName(par)} (${pd}).` });
    }
  }
  return issues;
}

/** Enlace de búsqueda gratuita en FamilySearch con nombre, apellidos y año aproximado. */
export function familySearchURL(p) {
  const params = new URLSearchParams();
  if (p.givenName) params.set('q.givenName', p.givenName);
  if (p.surname) params.set('q.surname', p.surname);
  const b = yearOf(p.birth.date);
  if (b) {
    params.set('q.birthLikeDate.from', String(b - 2));
    params.set('q.birthLikeDate.to', String(b + 2));
  }
  if (p.birth.place) params.set('q.birthLikePlace', p.birth.place);
  return `https://www.familysearch.org/search/record/results?${params}`;
}
