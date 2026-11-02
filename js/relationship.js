// Calculadora de parentesco: "B es el/la ___ de A".

import { fullName } from './store.js';

function ancestorsWithDistance(tree, id) {
  const map = new Map([[id, { dist: 0, via: null }]]);
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift();
    const d = map.get(cur).dist;
    for (const p of tree.parents(cur)) {
      if (!map.has(p)) {
        map.set(p, { dist: d + 1, via: cur });
        queue.push(p);
      }
    }
  }
  return map;
}

const g = (sex, m, f, u) => (sex === 'M' ? m : sex === 'F' ? f : u ?? `${m}/a`);

function ancestorLabel(n, s) {
  const names = [null, ['padre', 'madre', 'progenitor/a'], ['abuelo', 'abuela'], ['bisabuelo', 'bisabuela'], ['tatarabuelo', 'tatarabuela'], ['trastatarabuelo', 'trastatarabuela']];
  if (names[n]) return g(s, ...names[n]);
  return `${g(s, 'antepasado', 'antepasada')} directo/a (${n} generaciones)`;
}

function descendantLabel(n, s) {
  const names = [null, ['hijo', 'hija'], ['nieto', 'nieta'], ['bisnieto', 'bisnieta'], ['tataranieto', 'tataranieta'], ['trastataranieto', 'trastataranieta']];
  if (names[n]) return g(s, ...names[n]);
  return `descendiente directo/a (${n} generaciones)`;
}

const ORD_M = ['hermano', 'segundo', 'tercero', 'cuarto', 'quinto', 'sexto', 'séptimo', 'octavo'];
const ORD_F = ['hermana', 'segunda', 'tercera', 'cuarta', 'quinta', 'sexta', 'séptima', 'octava'];

/** dA: generaciones de A al ancestro común; dB: de B al ancestro común. */
export function bloodLabel(dA, dB, sexB, half = false) {
  if (dA === 0 && dB === 0) return 'la misma persona';
  if (dA === 0) return descendantLabel(dB, sexB);
  if (dB === 0) return ancestorLabel(dA, sexB);
  const medio = half ? g(sexB, 'medio ', 'media ', 'medio/a ') : '';
  if (dA === 1 && dB === 1) return medio + g(sexB, 'hermano', 'hermana');
  if (dB === 1) {
    const base = g(sexB, 'tío', 'tía');
    const extra = ['', '', '', g(sexB, ' abuelo', ' abuela'), g(sexB, ' bisabuelo', ' bisabuela'), g(sexB, ' tatarabuelo', ' tatarabuela')][dA];
    return medio + (extra !== undefined ? base + extra : `${base} (${dA - 1} generaciones arriba)`);
  }
  if (dA === 1) {
    const base = g(sexB, 'sobrino', 'sobrina');
    const extra = ['', '', '', g(sexB, ' nieto', ' nieta'), g(sexB, ' bisnieto', ' bisnieta'), g(sexB, ' tataranieto', ' tataranieta')][dB];
    return medio + (extra !== undefined ? base + extra : `${base} (${dB - 1} generaciones abajo)`);
  }
  const degree = Math.min(dA, dB) - 1;
  const removed = Math.abs(dA - dB);
  const ord = sexB === 'F' ? ORD_F[degree - 1] : ORD_M[degree - 1];
  let label = `${g(sexB, 'primo', 'prima')} ${ord || `de grado ${degree}`}`;
  if (half) label = `${label} (por un solo ancestro)`;
  if (removed) label += ` (${removed} generación${removed > 1 ? 'es' : ''} de diferencia)`;
  return label;
}

function affinity(tree, a, b) {
  const sb = tree.get(b).sex;
  const spousesA = tree.spouses(a);
  if (spousesA.includes(b)) return g(sb, 'esposo / pareja', 'esposa / pareja', 'pareja');
  if (spousesA.some((s) => tree.parents(s).includes(b))) return g(sb, 'suegro', 'suegra');
  if (tree.children(a).some((c) => tree.spouses(c).includes(b))) return g(sb, 'yerno', 'nuera', 'yerno / nuera');
  if (spousesA.some((s) => tree.siblings(s).includes(b))) return g(sb, 'cuñado', 'cuñada');
  if (tree.siblings(a).some((s) => tree.spouses(s).includes(b))) return g(sb, 'cuñado', 'cuñada');
  if (tree.parents(a).some((p) => tree.spouses(p).includes(b))) return g(sb, 'padrastro', 'madrastra');
  if (spousesA.some((s) => tree.children(s).includes(b))) return g(sb, 'hijastro', 'hijastra');
  return null;
}

/** Devuelve { label, sentence, path: [ids], kind: 'blood'|'affinity'|'none' } */
export function relationship(tree, a, b) {
  const A = tree.get(a);
  const B = tree.get(b);
  if (!A || !B) return { kind: 'none', label: '', sentence: 'Selecciona dos personas', path: [] };
  if (a === b) return { kind: 'blood', label: 'la misma persona', sentence: 'Es la misma persona.', path: [a] };

  const spouseLabel = tree.spouses(a).includes(b) ? affinity(tree, a, b) : null;
  const mapA = ancestorsWithDistance(tree, a);
  const mapB = ancestorsWithDistance(tree, b);
  let best = null;
  for (const [id, { dist }] of mapA) {
    if (!mapB.has(id)) continue;
    const score = dist + mapB.get(id).dist;
    if (!best || score < best.score) best = { id, score, dA: dist, dB: mapB.get(id).dist };
  }

  if (best && !spouseLabel) {
    // ¿Comparten un solo ancestro en ese nivel? => medio hermano, etc.
    let half = false;
    if (best.dA > 0 && best.dB > 0) {
      const childA = pathUp(mapA, best.id, a)[1];
      const childB = pathUp(mapB, best.id, b)[1];
      const pA = tree.parents(childA);
      const pB = tree.parents(childB);
      const shared = pA.filter((p) => pB.includes(p));
      half = shared.length === 1 && pA.length === 2 && pB.length === 2;
    }
    const label = bloodLabel(best.dA, best.dB, B.sex, half);
    const path = [...pathUp(mapA, best.id, a).reverse(), ...pathUp(mapB, best.id, b).slice(1)];
    return { kind: 'blood', label, sentence: `${fullName(B)} es ${article(B.sex)} ${label} de ${fullName(A)}.`, path, commonAncestor: best.id };
  }

  const aff = spouseLabel || affinity(tree, a, b);
  if (aff) return { kind: 'affinity', label: aff, sentence: `${fullName(B)} es ${article(B.sex)} ${aff} de ${fullName(A)} (parentesco político).`, path: [a, b] };
  return { kind: 'none', label: '', sentence: `No se ha encontrado parentesco entre ${fullName(A)} y ${fullName(B)} con los datos actuales.`, path: [] };
}

/** Camino desde el ancestro hasta la persona: [ancestor, ..., person] */
function pathUp(map, ancestorId, personId) {
  const out = [];
  let x = ancestorId;
  out.push(x);
  // seguimos "via" desde el ancestro hacia abajo hasta la persona
  while (x !== personId) {
    x = map.get(x).via;
    out.push(x);
  }
  return out;
}

function article(sex) {
  return sex === 'F' ? 'la' : 'el';
}
