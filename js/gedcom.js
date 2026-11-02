// Importación y exportación GEDCOM 5.5.1 (el estándar que usan MyHeritage,
// Ancestry, FamilySearch, Gramps, etc.).

import { emptyPerson, uid } from './store.js';
import { todayGed } from './dates.js';

// ---------- lectura ----------
export function parseLines(text) {
  const root = { level: -1, tag: 'ROOT', value: '', children: [] };
  const stack = [root];
  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/);
  for (const raw of lines) {
    const line = raw.replace(/^\s+/, '');
    if (!line) continue;
    const m = line.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?: (.*))?$/);
    if (!m) continue;
    const level = +m[1];
    const node = { level, xref: m[2] || null, tag: m[3].toUpperCase(), value: m[4] ?? '', children: [] };
    const parent = stack[Math.min(level, stack.length - 1)];
    parent.children.push(node);
    stack.length = Math.min(level, stack.length - 1) + 1;
    stack.push(node);
  }
  return root.children;
}

const sub = (node, tag) => node.children.find((c) => c.tag === tag);
const subs = (node, tag) => node.children.filter((c) => c.tag === tag);

function text(node) {
  if (!node) return '';
  let out = node.value;
  for (const c of node.children) {
    if (c.tag === 'CONT') out += '\n' + c.value;
    else if (c.tag === 'CONC') out += c.value;
  }
  return out;
}

function event(node) {
  if (!node) return { date: '', place: '' };
  return { date: text(sub(node, 'DATE')).trim(), place: text(sub(node, 'PLAC')).trim() };
}

function parseName(nameNode) {
  if (!nameNode) return { givenName: '', surname: '' };
  const raw = nameNode.value || '';
  const givn = text(sub(nameNode, 'GIVN')).trim();
  const surn = text(sub(nameNode, 'SURN')).trim();
  const m = raw.match(/^([^/]*)\/([^/]*)\/?(.*)$/);
  const given = m ? `${m[1]} ${m[3]}`.replace(/\s+/g, ' ').trim() : raw.trim();
  const sur = m ? m[2].trim() : '';
  return { givenName: givn || given, surname: surn || sur };
}

/** Devuelve { people, families, rootId, warnings } en el formato del store. */
export function importGedcom(textContent) {
  const records = parseLines(textContent);
  if (!records.some((r) => r.tag === 'HEAD') && !records.some((r) => r.tag === 'INDI')) {
    throw new Error('El archivo no parece un GEDCOM válido');
  }
  const notes = {};
  const objects = {};
  for (const r of records) {
    if (r.tag === 'NOTE' && r.xref) notes[r.xref] = text(r);
    if (r.tag === 'OBJE' && r.xref) objects[r.xref] = text(sub(r, 'FILE')).trim();
  }

  const idMap = {};
  const people = {};
  const families = {};
  const warnings = [];

  for (const r of records.filter((x) => x.tag === 'INDI')) {
    const id = uid('p');
    if (r.xref) idMap[r.xref] = id;
    const death = sub(r, 'DEAT');
    const noteText = subs(r, 'NOTE')
      .map((n) => (/^@[^@]+@$/.test(n.value.trim()) ? notes[n.value.trim()] || '' : text(n)))
      .filter(Boolean)
      .join('\n\n');
    let photo = '';
    for (const o of subs(r, 'OBJE')) {
      const file = /^@[^@]+@$/.test(o.value.trim()) ? objects[o.value.trim()] : text(sub(o, 'FILE')).trim();
      if (file && /^https?:\/\//i.test(file)) {
        photo = file;
        break;
      }
    }
    const sexVal = text(sub(r, 'SEX')).trim().toUpperCase();
    people[id] = emptyPerson({
      id,
      ...parseName(sub(r, 'NAME')),
      sex: sexVal === 'M' || sexVal === 'F' ? sexVal : 'U',
      occupation: text(sub(r, 'OCCU')).trim(),
      birth: event(sub(r, 'BIRT')),
      death: event(death),
      deceased: Boolean(death),
      photo,
      notes: noteText,
    });
  }

  for (const r of records.filter((x) => x.tag === 'FAM')) {
    const partners = [...subs(r, 'HUSB'), ...subs(r, 'WIFE')]
      .map((n) => idMap[n.value.trim()])
      .filter(Boolean)
      .slice(0, 2);
    const children = subs(r, 'CHIL').map((n) => idMap[n.value.trim()]).filter(Boolean);
    if (partners.length + children.length === 0) continue;
    const id = uid('f');
    families[id] = { id, partners, children, marriage: event(sub(r, 'MARR')) };
  }

  // Un hijo en varias familias de origen (p. ej. adopción): nos quedamos con la primera
  const seen = new Set();
  for (const f of Object.values(families)) {
    f.children = f.children.filter((c) => {
      if (seen.has(c)) {
        warnings.push(`${people[c].givenName} ${people[c].surname} aparece en varias familias de origen; se ha conservado la primera.`);
        return false;
      }
      seen.add(c);
      return true;
    });
  }

  return { people, families, rootId: Object.keys(people)[0] || null, warnings };
}

// ---------- escritura ----------
function line(level, tag, value, xref) {
  return [level, xref, tag, value].filter((x) => x !== undefined && x !== null && x !== '').join(' ');
}

function textLines(level, tag, value) {
  const out = [];
  const paragraphs = String(value).split(/\r?\n/);
  paragraphs.forEach((p, i) => {
    const chunks = p.match(/.{1,200}/gs) || [''];
    chunks.forEach((c, j) => {
      if (i === 0 && j === 0) out.push(line(level, tag, c));
      else out.push(line(level + 1, j === 0 ? 'CONT' : 'CONC', c));
    });
  });
  return out;
}

function eventLines(tag, ev, forceY = false) {
  if (!ev.date && !ev.place) return forceY ? [line(1, tag, 'Y')] : [];
  const out = [line(1, tag)];
  if (ev.date) out.push(line(2, 'DATE', ev.date));
  if (ev.place) out.push(line(2, 'PLAC', ev.place));
  return out;
}

export function exportGedcom(tree) {
  const people = tree.all();
  const fams = Object.values(tree.families);
  const pRef = Object.fromEntries(people.map((p, i) => [p.id, `@I${i + 1}@`]));
  const fRef = Object.fromEntries(fams.map((f, i) => [f.id, `@F${i + 1}@`]));
  const L = [
    '0 HEAD',
    '1 SOUR RAICES',
    '2 NAME Raices - Arbol genealogico',
    '2 VERS 1.0',
    `1 DATE ${todayGed()}`,
    '1 SUBM @SUB1@',
    '1 GEDC',
    '2 VERS 5.5.1',
    '2 FORM LINEAGE-LINKED',
    '1 CHAR UTF-8',
    '0 @SUB1@ SUBM',
    '1 NAME Usuario de Raices',
  ];
  for (const p of people) {
    L.push(line(0, 'INDI', '', pRef[p.id]));
    L.push(line(1, 'NAME', `${p.givenName} /${p.surname}/`.trim()));
    if (p.givenName) L.push(line(2, 'GIVN', p.givenName));
    if (p.surname) L.push(line(2, 'SURN', p.surname));
    L.push(line(1, 'SEX', p.sex));
    if (p.occupation) L.push(line(1, 'OCCU', p.occupation));
    L.push(...eventLines('BIRT', p.birth));
    if (p.deceased) L.push(...eventLines('DEAT', p.death, true));
    if (p.photo && /^https?:\/\//i.test(p.photo)) {
      L.push(line(1, 'OBJE'));
      L.push(line(2, 'FILE', p.photo));
    }
    if (p.notes) L.push(...textLines(1, 'NOTE', p.notes));
    for (const f of tree.parentFamilies(p.id)) L.push(line(1, 'FAMC', fRef[f.id]));
    for (const f of tree.spouseFamilies(p.id)) L.push(line(1, 'FAMS', fRef[f.id]));
  }
  for (const f of fams) {
    L.push(line(0, 'FAM', '', fRef[f.id]));
    const partners = f.partners.map((id) => tree.get(id));
    // HUSB/WIFE por sexo; si no se puede decidir, por orden
    let husb = partners.find((p) => p.sex === 'M');
    let wife = partners.find((p) => p !== husb && p.sex === 'F');
    const rest = partners.filter((p) => p !== husb && p !== wife);
    if (!husb && rest.length) husb = rest.shift();
    if (!wife && rest.length) wife = rest.shift();
    if (husb) L.push(line(1, 'HUSB', pRef[husb.id]));
    if (wife) L.push(line(1, 'WIFE', pRef[wife.id]));
    for (const c of f.children) L.push(line(1, 'CHIL', pRef[c]));
    L.push(...eventLines('MARR', f.marriage));
  }
  L.push('0 TRLR');
  return L.join('\n') + '\n';
}
