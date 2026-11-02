import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FamilyTree, fullName } from '../js/store.js';
import { normalizeDate, formatDate, yearOf } from '../js/dates.js';
import { importGedcom, exportGedcom } from '../js/gedcom.js';
import { relationship } from '../js/relationship.js';
import { computeLayout, CW, CH } from '../js/layout.js';
import { buildSample } from '../js/sample.js';

const sample = () => {
  const s = buildSample();
  return { t: new FamilyTree(s.data), ids: s.ids };
};

test('fechas: entrada en español → GEDCOM → español', () => {
  assert.equal(normalizeDate('12/03/1950'), '12 MAR 1950');
  assert.equal(normalizeDate('1950-03-12'), '12 MAR 1950');
  assert.equal(normalizeDate('12 de marzo de 1950'), '12 MAR 1950');
  assert.equal(normalizeDate('ago 1931'), 'AUG 1931');
  assert.equal(normalizeDate('c. 1900'), 'ABT 1900');
  assert.equal(normalizeDate('hacia 1900'), 'ABT 1900');
  assert.equal(normalizeDate('antes de 1880'), 'BEF 1880');
  assert.equal(normalizeDate('después de 1880'), 'AFT 1880');
  assert.equal(normalizeDate('entre 1900 y 1910'), 'BET 1900 AND 1910');
  assert.equal(normalizeDate('calc. 1890'), 'CAL 1890');
  assert.equal(normalizeDate('31/02/x'), '31/02/x'); // no reconocida: se conserva
  assert.equal(formatDate('12 MAR 1950'), '12 mar 1950');
  assert.equal(formatDate('ABT 1900'), 'c. 1900');
  assert.equal(formatDate('BET 1900 AND 1910'), 'entre 1900 y 1910');
  // ida y vuelta: lo que se muestra se vuelve a guardar igual
  for (const d of ['12 MAR 1950', 'ABT 1900', 'BEF 1880', 'AFT 1880', 'BET 1900 AND 1910', 'DEC 1931', 'CAL 1890', 'EST 1700']) {
    assert.equal(normalizeDate(formatDate(d)), d, d);
  }
  assert.equal(yearOf('ABT 1900'), 1900);
  assert.equal(yearOf(''), null);
});

test('store: relaciones básicas del árbol de ejemplo', () => {
  const { t, ids } = sample();
  assert.deepEqual(t.orderedParents(ids.jorge).map((id) => t.get(id).givenName), ['Manuel', 'Rosa']);
  assert.ok(t.siblings(ids.jorge).includes(ids.lucho));
  assert.ok(t.spouses(ids.ricardo).includes(ids.lucia));
  assert.equal(t.children(ids.daniel).length, 2);
  assert.equal(t.generations(), 5);
  const st = t.stats();
  assert.equal(st.people, t.size);
  assert.equal(st.surnames[0][0], 'Herrera');
});

test('store: addParent no permite tres progenitores ni ciclos', () => {
  const t = new FamilyTree();
  const a = t.addPerson({ givenName: 'A' });
  const b = t.addParent(a, { givenName: 'B', sex: 'M' });
  t.addParent(a, { givenName: 'C', sex: 'F' });
  assert.throws(() => t.addParent(a, { givenName: 'D' }), /dos progenitores/);
  assert.throws(() => t.addParent(b, a), /ciclo/);
  assert.throws(() => t.addChild(a, b), /ciclo/);
});

test('store: añadir hijo a una persona con dos parejas usa la familia correcta', () => {
  const t = new FamilyTree();
  const a = t.addPerson({ givenName: 'Ana', sex: 'F' });
  const b = t.addPartner(a, { givenName: 'Bruno', sex: 'M' });
  const c = t.addPartner(a, { givenName: 'Carlos', sex: 'M' });
  const k1 = t.addChild(a, { givenName: 'K1' }, b);
  const k2 = t.addChild(a, { givenName: 'K2', sex: 'M' }, c);
  const k3 = t.addChild(a, { givenName: 'K3' }, c);
  assert.deepEqual(t.parents(k1).sort(), [a, b].sort());
  assert.deepEqual(t.parents(k2).sort(), [a, c].sort());
  assert.equal(relationship(t, k1, k2).label, 'medio hermano');
  assert.equal(relationship(t, k1, k3).label, 'medio/a hermano/a');
  assert.equal(relationship(t, k2, k3).label, 'hermano/a');
});

test('store: eliminar persona limpia familias vacías', () => {
  const t = new FamilyTree();
  const a = t.addPerson({ givenName: 'A' });
  const b = t.addPartner(a, { givenName: 'B' });
  t.deletePerson(b);
  assert.equal(Object.keys(t.families).length, 0);
  assert.equal(t.spouses(a).length, 0);
});

test('parentesco: consanguinidad y afinidad', () => {
  const { t, ids } = sample();
  const label = (a, b) => relationship(t, a, b).label;
  assert.equal(label(ids.daniel, ids.ricardo), 'padre');
  assert.equal(label(ids.daniel, ids.jorge), 'abuelo');
  assert.equal(label(ids.daniel, ids.manuel), 'bisabuelo');
  assert.equal(label(ids.manuel, ids.daniel), 'bisnieto');
  assert.equal(label(ids.ricardo, ids.lucho), 'tío');
  assert.equal(label(ids.daniel, ids.lucho), 'tío abuelo');
  assert.equal(label(ids.ricardo, ids.primo), 'primo hermano');
  assert.equal(label(ids.daniel, ids.primo), 'primo hermano (1 generación de diferencia)');
  assert.equal(label(ids.lucho, ids.ricardo), 'sobrino');
  assert.equal(label(ids.ricardo, ids.lucia), 'esposa / pareja');
  assert.equal(label(ids.ricardo, ids.pepe), 'suegro');
  assert.equal(label(ids.pepe, ids.ricardo), 'yerno');
  const r = relationship(t, ids.daniel, ids.primo);
  assert.equal(r.path[0], ids.daniel);
  assert.equal(r.path.at(-1), ids.primo);
  assert.equal(r.commonAncestor === ids.manuel || r.commonAncestor === ids.rosa, true);
});

const SAMPLE_GED = `0 HEAD
1 SOUR MYHERITAGE
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME José Omar /Pérez León/
2 GIVN José Omar
2 SURN Pérez León
1 SEX M
1 BIRT
2 DATE 15 JUN 1985
2 PLAC Chiclayo, Lambayeque, Perú
1 OBJE
2 FILE https://example.com/foto.jpg
1 NOTE Primera línea
2 CONT Segunda línea muy
2 CONC  larga
1 FAMC @F1@
0 @I2@ INDI
1 NAME Pedro /Pérez/
1 SEX M
1 DEAT Y
1 FAMS @F1@
0 @I3@ INDI
1 NAME María /León/
1 SEX F
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I1@
1 MARR
2 DATE 1980
0 TRLR
`;

test('GEDCOM: importación estilo MyHeritage', () => {
  const data = importGedcom(SAMPLE_GED);
  const t = new FamilyTree(data);
  assert.equal(t.size, 3);
  const jose = t.all().find((p) => p.givenName === 'José Omar');
  assert.equal(jose.surname, 'Pérez León');
  assert.equal(jose.birth.place, 'Chiclayo, Lambayeque, Perú');
  assert.equal(jose.photo, 'https://example.com/foto.jpg');
  assert.equal(jose.notes, 'Primera línea\nSegunda línea muy larga');
  const parents = t.orderedParents(jose.id).map((id) => t.get(id));
  assert.deepEqual(parents.map((p) => p.givenName), ['Pedro', 'María']);
  assert.equal(parents[0].deceased, true);
  assert.equal(Object.values(t.families)[0].marriage.date, '1980');
});

test('GEDCOM: exportar e importar conserva el árbol', () => {
  const { t } = sample();
  const ged = exportGedcom(t);
  assert.match(ged, /^0 HEAD/);
  assert.match(ged, /1 CHAR UTF-8/);
  assert.match(ged, /0 TRLR\n$/);
  const t2 = new FamilyTree(importGedcom(ged));
  assert.equal(t2.size, t.size);
  assert.equal(Object.keys(t2.families).length, Object.keys(t.families).length);
  const names = (tr) => tr.all().map(fullName).sort();
  assert.deepEqual(names(t2), names(t));
  // parentesco idéntico tras el viaje de ida y vuelta
  const find = (tr, n) => tr.all().find((p) => fullName(p) === n).id;
  assert.equal(relationship(t2, find(t2, 'Daniel Herrera Soler'), find(t2, 'Andrés Herrera Torres')).label, 'primo hermano (1 generación de diferencia)');
});

test('GEDCOM: rechaza archivos que no lo son', () => {
  assert.throws(() => importGedcom('hola mundo'), /GEDCOM/);
});

test('layout: sin solapes entre tarjetas', () => {
  const { t, ids } = sample();
  for (const focus of [ids.daniel, ids.jorge, ids.manuel, ids.ricardo]) {
    const { nodes } = computeLayout(t, focus, { up: 4, down: 4 });
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const overlap = a.x < b.x + CW && b.x < a.x + CW && a.y < b.y + CH && b.y < a.y + CH;
        assert.equal(overlap, false, `solape en foco ${t.get(focus).givenName}: ${a.id} / ${b.id}`);
      }
    }
    assert.equal(nodes.filter((n) => n.focus).length, 1);
  }
});

test('layout: huecos para añadir progenitores que faltan', () => {
  const t = new FamilyTree();
  const a = t.addPerson({ givenName: 'Solo' });
  const { nodes } = computeLayout(t, a);
  assert.deepEqual(nodes.filter((n) => n.ghost).map((n) => n.ghost), ['M', 'F']);
});
