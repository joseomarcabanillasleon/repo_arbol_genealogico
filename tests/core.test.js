import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FamilyTree, fullName } from '../js/store.js';
import { normalizeDate, formatDate, yearOf } from '../js/dates.js';
import { importGedcom, exportGedcom } from '../js/gedcom.js';
import { relationship } from '../js/relationship.js';
import { computeLayout } from '../js/layout.js';
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
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
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
  // con padres reales, aparecen huecos para los 4 abuelos
  t.addParent(a, { givenName: 'P', sex: 'M' });
  t.addParent(a, { givenName: 'M', sex: 'F' });
  const l2 = computeLayout(t, a);
  assert.equal(l2.nodes.filter((n) => n.ghost).length, 4);
  // pero no más allá de ghostDepth
  assert.equal(computeLayout(t, a, { ghostDepth: 1 }).nodes.filter((n) => n.ghost).length, 0);
});

test('GEDCOM: exportación privada oculta a las personas vivas', () => {
  const { t, ids } = sample();
  const ged = exportGedcom(t, { privateLiving: true });
  assert.ok(!ged.includes('Daniel'), 'Daniel (vivo) no debe aparecer');
  assert.ok(ged.includes('Jorge'), 'Jorge (fallecido) sí aparece');
  assert.ok(!ged.includes('Analista de datos'));
  const t2 = new FamilyTree(importGedcom(ged));
  assert.equal(t2.size, t.size); // la estructura se conserva
  assert.equal(t.isLiving(ids.daniel), true);
  assert.equal(t.isLiving(ids.manuel), false);
});

test('store: nombre del árbol', () => {
  const { t } = sample();
  assert.equal(t.displayName(), 'Familia Herrera Soler');
  t.rename('Los Herrera');
  assert.equal(new FamilyTree(t.toJSON()).displayName(), 'Los Herrera');
});

test('asistente: apellidos sugeridos, pasos visibles y creación', async () => {
  const { suggestParentSurname, activeSteps, commitWizard } = await import('../js/onboarding.js');
  assert.equal(suggestParentSurname('Herrera Soler', 'M'), 'Herrera');
  assert.equal(suggestParentSurname('Herrera Soler', 'F'), 'Soler');
  assert.equal(suggestParentSurname('Herrera', 'F'), '');
  // sin padres: solo tú, madre y padre
  assert.deepEqual(activeSteps({}).map((s) => s.key), ['me', 'mother', 'father']);
  // con madre: aparecen sus padres
  assert.deepEqual(activeSteps({ mother: { givenName: 'Lucía' } }).map((s) => s.key), ['me', 'mother', 'father', 'mgm', 'mgf']);
  const t = new FamilyTree();
  const me = commitWizard(t, {
    me: { givenName: 'Daniel', surname: 'Herrera Soler', sex: 'M', birth: '1992', place: 'Valencia' },
    mother: { givenName: 'Lucía', surname: 'Soler', birth: '22/09/1966', living: true },
    father: null,
    mgm: { givenName: 'Pilar', surname: 'Navarro', living: false },
  });
  assert.equal(t.rootId, me);
  assert.equal(t.size, 3);
  const [mom] = t.parents(me).map((id) => t.get(id));
  assert.equal(mom.sex, 'F');
  assert.equal(mom.birth.date, '22 SEP 1966');
  const [grandma] = t.parents(mom.id).map((id) => t.get(id));
  assert.equal(grandma.deceased, true);
  assert.equal(relationship(t, me, grandma.id).label, 'abuela');
});

test('árbol ilustrado: base con hermanos, padres en la bifurcación y huecos', async () => {
  const { illustratedLayout, kinLabel } = await import('../js/illustrated.js');
  const { t, ids } = sample();
  const L = illustratedLayout(t, ids.daniel);
  const base = L.nodes.filter((n) => n.g === 0).map((n) => t.get(n.id).givenName);
  assert.deepEqual(base, ['Daniel', 'Sara']); // hermanos en el tronco, por edad
  const parents = L.nodes.filter((n) => n.g === 1);
  assert.deepEqual(parents.map((n) => t.get(n.id).givenName), ['Ricardo', 'Lucía']);
  assert.ok(parents[0].x < 0 && parents[1].x > 0, 'padre a la izquierda, madre a la derecha');
  assert.equal(L.shown, 3);
  assert.equal(L.nodes.filter((n) => n.kind === 'ghost' && n.g === 3).length, 4); // bisabuelos que faltan
  assert.equal(kinLabel(2, 'F'), 'Abuelita');
  // una persona sola muestra huecos para padre y madre
  const t2 = new FamilyTree();
  const solo = t2.addPerson({ givenName: 'Aarón', sex: 'M' });
  assert.deepEqual(illustratedLayout(t2, solo).nodes.filter((n) => n.kind === 'ghost').map((n) => n.sex), ['M', 'F']);
});

test('inicio: preguntas según los huecos reales, y el "No" se recuerda', async () => {
  const { questions } = await import('../js/insights.js');
  const t = new FamilyTree();
  const me = t.addPerson({ givenName: 'Daniel', surname: 'Herrera Soler', sex: 'M' });
  let qs = questions(t, me, t.dismissed);
  assert.equal(qs[0].text, '¿Tienes esposa o pareja?');
  assert.deepEqual(qs.slice(0, 5).map((q) => q.yes.mode), ['partner', 'child', 'parent', 'parent', 'sibling']);
  t.dismiss(qs[0].id);
  qs = questions(t, me, new FamilyTree(t.toJSON()).dismissed);
  assert.ok(!qs.some((q) => q.yes.mode === 'partner'), 'el "No" sobrevive al guardar');
  // al añadir la madre aparece la pregunta por sus padres, con parentesco
  const mom = t.addParent(me, { givenName: 'Lucía', surname: 'Soler', sex: 'F' });
  qs = questions(t, me, t.dismissed);
  assert.ok(qs.some((q) => q.text === '¿Sabes cómo se llamaba la madre de Lucía (tu madre)?'));
  assert.ok(qs.some((q) => q.id === `birth:${mom}` && q.yes.mode === 'edit'));
});

test('inicio: completitud hasta bisabuelos', async () => {
  const { completeness } = await import('../js/insights.js');
  const { t, ids } = sample();
  const c = completeness(t, ids.daniel);
  // Daniel + 2 padres + 4 abuelos + 4 bisabuelos conocidos = 11 de 15
  assert.equal(c.known, 11);
  assert.equal(c.pct, 73);
});

test('inicio: próximos aniversarios', async () => {
  const { upcoming } = await import('../js/insights.js');
  const t = new FamilyTree();
  const a = t.addPerson({ givenName: 'Ana', sex: 'F', birth: { date: '5 NOV 1990' } });
  t.addPerson({ givenName: 'Abuelo', sex: 'M', birth: { date: '1 JAN 1920' }, deceased: true, death: { date: '10 NOV 2000' } });
  t.addPartner(a, { givenName: 'Luis', sex: 'M' }, { date: '3 NOV 2015' });
  const u = upcoming(t, new Date(2026, 10, 3), 30);
  assert.deepEqual(u.map((x) => [x.kind, x.inDays, x.years]), [['wedding', 0, 11], ['birthday', 2, 36], ['death', 7, 26]]);
});

test('inicio: revisión de datos incoherentes', async () => {
  const { consistency } = await import('../js/insights.js');
  const t = new FamilyTree();
  const kid = t.addPerson({ givenName: 'Hijo', birth: { date: '1950' } });
  t.addParent(kid, { givenName: 'Madre', sex: 'F', birth: { date: '1945' } });
  t.addPerson({ givenName: 'Viejo', birth: { date: '1890' } });
  t.addPerson({ givenName: 'Raro', birth: { date: '1960' }, death: { date: '1950' } });
  const texts = consistency(t, new Date(2026, 0, 1)).map((i) => i.text);
  assert.ok(texts.some((x) => x.includes('tendría 5 años')));
  assert.ok(texts.some((x) => x.includes('¿Ha fallecido?')));
  assert.ok(texts.some((x) => x.includes('anterior al nacimiento')));
  assert.equal(consistency(sample().t, new Date(2026, 0, 1)).length, 0, 'el árbol de ejemplo es coherente');
});

test('inicio: enlace de búsqueda en FamilySearch', async () => {
  const { familySearchURL } = await import('../js/insights.js');
  const url = new URL(familySearchURL({ givenName: 'Manuel', surname: 'Herrera Quispe', birth: { date: '1902', place: 'Chiclayo' } }));
  assert.equal(url.hostname, 'www.familysearch.org');
  assert.equal(url.searchParams.get('q.surname'), 'Herrera Quispe');
  assert.equal(url.searchParams.get('q.birthLikeDate.from'), '1900');
});

test('familia: enlace de invitación ida y vuelta, comprimido y sin fotos', async () => {
  const { buildInvite, encodePayload, decodePayload, linkFor, parseHash, extractHash } = await import('../js/share.js');
  const { t, ids } = sample();
  t.updatePerson(ids.lucia, { photo: 'data:image/jpeg;base64,AAAA' });
  const inv = buildInvite(t, ids.ricardo, 'Daniel');
  assert.equal(inv.a.g, 'Ricardo');
  assert.equal(inv.k.f.g, 'Jorge');
  assert.equal(inv.k.ff.g, 'Manuel');
  assert.ok(!JSON.stringify(inv).includes('base64'), 'las fotos no viajan en la invitación');
  const enc = await encodePayload(inv);
  const url = linkFor('https://x.github.io/app/?a=1#viejo', 'ayuda', enc);
  assert.ok(url.startsWith('https://x.github.io/app/?a=1#ayuda=z'));
  const parsed = parseHash(new URL(url).hash);
  assert.deepEqual(await decodePayload(parsed.data), inv);
  assert.equal(extractHash(`Mira: ${url} gracias`), new URL(url).hash);
});

test('familia: la respuesta rellena huecos y añade personas, sin sobrescribir', async () => {
  const { applyReply } = await import('../js/share.js');
  const { t, ids } = sample();
  const before = t.size;
  const reply = {
    v: 1, t: 'reply', by: 'Rosa',
    a: { id: ids.lucia, b: '1970', bp: 'Valencia, España', n: 'Le encantaba cantar.' },
    p: {
      f: { g: 'José', s: 'Soler Roig', b: '1939', bp: 'Valencia, España', dec: 1 },
      m: { g: 'Pilar', s: 'Navarro Gil', b: '1942', bp: 'Petrés, Valencia, España', dec: 0 },
      mf: { g: 'Joaquín', s: 'Navarro Sanz', b: 'hacia 1910', bp: 'Petrés', dec: 1 },
      mm: { g: 'Teresa', s: 'Gil Peris', b: '', bp: '', dec: 1 },
    },
  };
  const dry = applyReply(t, reply, { dryRun: true });
  assert.equal(t.size, before, 'el modo prueba no cambia el árbol');
  const res = applyReply(t, reply);
  assert.deepEqual(res.changes, dry.changes);
  assert.equal(t.size, before + 2, 'se añaden los dos bisabuelos maternos que faltaban');
  assert.ok(res.changes.includes('Nueva persona: Joaquín Navarro Sanz (abuelo materno de Lucía)'), res.changes.join(' | '));
  const lucia = t.get(ids.lucia);
  assert.equal(lucia.birth.date, '22 SEP 1966', 'no se sobrescribe la fecha que ya existía');
  assert.ok(res.conflicts.some((c) => c.includes('1966') && c.includes('1970')));
  assert.match(lucia.notes, /Recuerdo de Rosa: Le encantaba cantar\./);
  const pilar = t.get(t.orderedParents(ids.lucia).find((id) => t.get(id).sex === 'F'));
  const [joaquin, teresa] = t.orderedParents(pilar.id).map((id) => t.get(id));
  assert.equal(joaquin.givenName, 'Joaquín');
  assert.equal(joaquin.birth.date, 'ABT 1910');
  assert.equal(teresa.deceased, true);
  assert.equal(pilar.birth.place, 'Petrés, Valencia, España');
  assert.throws(() => applyReply(new FamilyTree(), reply), /no está en tu árbol/);
});
