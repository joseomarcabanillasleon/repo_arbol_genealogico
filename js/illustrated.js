// Árbol ilustrado (inspirado en el póster hecho a mano en casa):
// la persona de la base y sus hermanos en el tronco, los padres en la bifurcación,
// abuelos y bisabuelos en la copa. Todo con colores en línea (sin CSS ni filtros)
// para que se vea igual en pantalla y al exportarlo como póster.

export const ART = {
  paper: '#fbf7ee',
  sheetEdge: '#e6dcc6',
  ink: '#3b3a36',
  inkSoft: '#7d776b',
  trunk: '#8f5d3d',
  trunkDark: '#6a4229',
  trunkLight: '#b07d55',
  leafDeep: '#5e8a4c',
  leaf: '#8db86f',
  leafLight: '#b5d692',
  leafPale: '#e3f0d3',
  grass: '#a6cc84',
  grassDark: '#7fae62',
  tagLine: '#d5ccb8',
  focus: '#e2a33b',
  male: '#5b8fc9',
  female: '#d4789a',
  unknown: '#9a9a92',
};
export const FONT = "'Patrick Hand', 'Segoe Print', 'Comic Sans MS', cursive";

const PHOTO = [112, 102, 88, 74]; // tamaño de foto por generación
const ROW_Y = [0, -250, -470, -660]; // centro de la foto por generación
const BRANCH_W = [0, 40, 24, 14];
const FORK_Y = -150;
const GROUND_Y = 150;

/** Etiqueta infantil de parentesco respecto a la persona de la base. */
export function kinLabel(g, sex) {
  const t = [
    null,
    ['Papá', 'Mamá', 'Papá o mamá'],
    ['Abuelito', 'Abuelita', 'Abuelito/a'],
    ['Bisabuelo', 'Bisabuela', 'Bisabuelo/a'],
  ][g];
  return sex === 'M' ? t[0] : sex === 'F' ? t[1] : t[2];
}

function byBirth(tree) {
  const y = (id) => +((tree.get(id).birth.date.match(/\b(\d{3,4})\b/) || [])[1] || 9999);
  return (a, b) => y(a) - y(b);
}

/**
 * Posiciones del árbol ilustrado. Sin DOM, testeable.
 * slots[g][i]: el padre de slots[g-1][k] está en 2k y la madre en 2k+1.
 */
export function illustratedLayout(tree, baseId, { maxGen = 3 } = {}) {
  if (!tree.get(baseId)) return null;
  const slots = [[{ id: baseId }]];
  let realMax = 0;
  for (let g = 1; g <= maxGen; g++) {
    slots[g] = [];
    slots[g - 1].forEach((child) => {
      let father = null;
      let mother = null;
      if (child.id) {
        const ps = tree.orderedParents(child.id).map((id) => tree.get(id));
        for (const p of ps) {
          if (p.sex === 'F' && !mother) mother = p.id;
          else if (!father) father = p.id;
          else if (!mother) mother = p.id;
        }
      }
      slots[g].push({ id: father, sex: 'M', childId: child.id }, { id: mother, sex: 'F', childId: child.id });
      if (father || mother) realMax = g;
    });
  }
  const shown = Math.min(maxGen, Math.max(2, realMax + 1));
  slots.length = shown + 1;

  const width = Math.max(620, 2 ** shown * (PHOTO[shown] + 38));
  const nodes = [];
  for (let g = 1; g <= shown; g++) {
    const n = 2 ** g;
    slots[g].forEach((s, i) => {
      const x = (i + 0.5 - n / 2) * (width / n);
      s.x = x;
      // la generación de arriba se curva en cúpula; las intermedias, un poco
      const lift = g === shown ? 90 : g >= 2 ? 34 : 0;
      s.y = ROW_Y[g] - lift * (1 - (x / (width / 2)) ** 2);
      s.g = g;
      s.i = i;
      if (s.id) nodes.push({ ...s, kind: 'person' });
      else if (s.childId) nodes.push({ ...s, kind: 'ghost' });
    });
  }
  // fila de la base: la persona y sus hermanos (por orden de nacimiento)
  const base = [baseId, ...tree.siblings(baseId)].sort(byBirth(tree));
  const step = PHOTO[0] + 40;
  base.forEach((id, i) => {
    nodes.push({ id, kind: 'person', g: 0, i, x: (i - (base.length - 1) / 2) * step, y: 0, base: true, isBase: id === baseId });
  });
  return { slots, shown, width, nodes, baseRowWidth: base.length * step };
}

// ---------- utilidades de dibujo ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n) => Math.round(n * 10) / 10;

/** Mancha orgánica cerrada (curva suave por puntos con radio irregular). */
function blobPath(cx, cy, r, rand, jitter = 0.16, n = 11) {
  const off = rand() * Math.PI * 2;
  const pts = Array.from({ length: n }, (_, k) => {
    const a = off + (k / n) * Math.PI * 2;
    const rr = r * (1 + jitter * (rand() - 0.5) * 2);
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  });
  let d = `M${r1(pts[0][0])},${r1(pts[0][1])}`;
  for (let k = 0; k < n; k++) {
    const p0 = pts[(k - 1 + n) % n];
    const p1 = pts[k];
    const p2 = pts[(k + 1) % n];
    const p3 = pts[(k + 2) % n];
    d += `C${r1(p1[0] + (p2[0] - p0[0]) / 6)},${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)},${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])},${r1(p2[1])}`;
  }
  return d + 'Z';
}

const LEAF = 'M0,0C5,-7 15,-8 22,0C15,8 5,7 0,0Z';

function clipText(s, max) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/**
 * Dibuja el árbol ilustrado dentro de `root` (un <g>).
 * deps: { el(tag, attrs, parent), tree, silhouette(sex) -> string SVG interno, title, selectedId }
 * Devuelve { bounds } (la hoja de papel completa).
 */
export function renderIllustrated(root, layout, deps) {
  const { el, tree, silhouette, title, selectedId } = deps;
  const rand = rng(1234 + layout.shown * 7 + layout.nodes.length);
  const W = layout.width;

  // ---- defs ----
  const defs = el('defs', {}, root);
  const hatch = el('pattern', { id: 'il-hatch', width: 7, height: 7, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(38)' }, defs);
  el('line', { x1: 0, y1: 0, x2: 0, y2: 7, stroke: ART.leafDeep, 'stroke-width': 1.3 }, hatch);
  const bark = el('pattern', { id: 'il-bark', width: 9, height: 26, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(4)' }, defs);
  el('path', { d: 'M2,0q2,13 0,26M6,4q1.5,8 0,15', stroke: ART.trunkDark, 'stroke-width': 1.1, fill: 'none' }, bark);
  const grad = el('linearGradient', { id: 'il-trunk', x1: 0, x2: 1, y1: 0, y2: 0 }, defs);
  el('stop', { offset: '0', 'stop-color': ART.trunkLight }, grad);
  el('stop', { offset: '0.55', 'stop-color': ART.trunk }, grad);
  el('stop', { offset: '1', 'stop-color': ART.trunkDark }, grad);

  // ---- copa: cúpula redondeada de lóbulos irregulares (no sigue las filas) ----
  let cMinX = 0;
  let cMaxX = 0;
  let cMinY = 0;
  for (let g = 1; g <= layout.shown; g++) {
    for (const sl of layout.slots[g]) {
      const half = PHOTO[g] / 2 + 34;
      cMinX = Math.min(cMinX, sl.x - half);
      cMaxX = Math.max(cMaxX, sl.x + half);
      cMinY = Math.min(cMinY, sl.y - PHOTO[g] / 2 - 16);
    }
  }
  const crown = {
    cx: 0,
    rx: Math.max(-cMinX, cMaxX) + 62,
    top: cMinY - 78,
    bottom: ROW_Y[1] + 92,
  };
  crown.cy = (crown.top + crown.bottom) / 2;
  crown.ry = (crown.bottom - crown.top) / 2;
  const base = Math.min(crown.rx, crown.ry);

  // lóbulos del borde (con forma de coliflor) y del interior
  const edge = [];
  const nEdge = Math.max(16, Math.round((Math.PI * (crown.rx + crown.ry)) / (base * 0.42)));
  for (let k = 0; k < nEdge; k++) {
    const a = (k / nEdge) * Math.PI * 2 + (rand() - 0.5) * 0.18;
    const below = Math.sin(a) > 0.55; // parte baja, junto al tronco: lóbulos más pequeños
    const r = base * (below ? 0.17 : 0.24) * (0.8 + rand() * 0.45);
    edge.push({ x: crown.cx + Math.cos(a) * crown.rx * 0.86, y: crown.cy + Math.sin(a) * crown.ry * 0.86, r, a });
  }
  const inner = [];
  const nInner = Math.round(nEdge * 0.75);
  for (let k = 0; k < nInner; k++) {
    const a = rand() * Math.PI * 2;
    const d = 0.25 + rand() * 0.45;
    inner.push({ x: crown.cx + Math.cos(a) * crown.rx * d, y: crown.cy + Math.sin(a) * crown.ry * d, r: base * (0.16 + rand() * 0.1), a });
  }
  inner.sort((p, q) => p.y - q.y); // de arriba abajo: los de abajo tapan a los de arriba
  const blobs = [...edge, ...inner];

  // degradados de volumen: luz arriba a la izquierda, sombra abajo
  const lightG = el('radialGradient', { id: 'il-crown-light', cx: 0.36, cy: 0.2, r: 0.55 }, defs);
  el('stop', { offset: '0', 'stop-color': '#f4fbe6', 'stop-opacity': 0.32 }, lightG);
  el('stop', { offset: '1', 'stop-color': '#f4fbe6', 'stop-opacity': 0 }, lightG);
  const shadeG = el('linearGradient', { id: 'il-crown-shade', x1: 0, x2: 0, y1: 0, y2: 1 }, defs);
  el('stop', { offset: '0.45', 'stop-color': '#2f5426', 'stop-opacity': 0 }, shadeG);
  el('stop', { offset: '1', 'stop-color': '#2f5426', 'stop-opacity': 0.38 }, shadeG);

  const coreD = blobPath(0, 0, 1, rand, 0.06, 14);
  const coreT = `translate(${r1(crown.cx)},${r1(crown.cy)}) scale(${r1(crown.rx * 0.88)},${r1(crown.ry * 0.88)})`;
  const clip = el('clipPath', { id: 'il-crown-clip' }, defs);
  el('path', { d: coreD, transform: coreT }, clip);
  const clipLobes = [];

  const canopy = el('g', {}, root);
  // sombra exterior de toda la copa
  const back = el('g', { fill: ART.leafDeep }, canopy);
  el('path', { d: coreD, transform: `translate(${r1(crown.cx + 6)},${r1(crown.cy + 12)}) scale(${r1(crown.rx * 0.9)},${r1(crown.ry * 0.9)})` }, back);
  for (const b of edge) el('path', { d: blobPath(b.x + 5, b.y + 9, b.r * 1.06, rand) }, back);
  // masa principal
  const main = el('g', { fill: ART.leaf }, canopy);
  el('path', { d: coreD, transform: coreT }, main);
  for (const b of edge) {
    const d = blobPath(b.x, b.y, b.r, rand);
    clipLobes.push(d);
    el('path', { d }, main);
    el('path', { d, fill: 'url(#il-hatch)', opacity: 0.22 }, main);
    if (Math.sin(b.a) < 0.25) el('path', { d: blobPath(b.x - b.r * 0.2, b.y - b.r * 0.28, b.r * 0.55, rand, 0.22), fill: ART.leafLight, opacity: 0.8 }, main);
  }
  // lóbulos interiores con su sombra propia, para dar relieve
  for (const b of inner) {
    el('path', { d: blobPath(b.x + 3, b.y + b.r * 0.22, b.r * 1.02, rand), fill: ART.leafDeep, opacity: 0.55 }, main);
    const d = blobPath(b.x, b.y, b.r, rand);
    el('path', { d, fill: ART.leaf }, main);
    el('path', { d, fill: 'url(#il-hatch)', opacity: 0.2 }, main);
    el('path', { d: blobPath(b.x - b.r * 0.2, b.y - b.r * 0.26, b.r * 0.5, rand, 0.22), fill: ART.leafLight, opacity: 0.7 }, main);
  }
  for (const d of clipLobes) el('path', { d }, clip);
  // volumen global
  const bx = crown.cx - crown.rx * 1.1;
  const by = crown.top - 40;
  const bw = crown.rx * 2.2;
  const bh = crown.bottom - crown.top + 80;
  el('rect', { x: r1(bx), y: r1(by), width: r1(bw), height: r1(bh), fill: 'url(#il-crown-shade)', 'clip-path': 'url(#il-crown-clip)' }, canopy);
  el('rect', { x: r1(bx), y: r1(by), width: r1(bw), height: r1(bh), fill: 'url(#il-crown-light)', 'clip-path': 'url(#il-crown-clip)' }, canopy);
  // hojitas que asoman por el borde, apuntando hacia fuera
  const leaves = el('g', {}, canopy);
  for (const b of edge) {
    const n = 2 + Math.round(rand() * 2);
    for (let k = 0; k < n; k++) {
      const a = b.a + (rand() - 0.5) * 1.6;
      const x = b.x + Math.cos(a) * b.r * 0.98;
      const y = b.y + Math.sin(a) * b.r * 0.98;
      const deg = (a * 180) / Math.PI + (rand() - 0.5) * 30;
      const upper = Math.sin(a) < 0.3;
      el('path', { d: LEAF, transform: `translate(${r1(x)},${r1(y)}) rotate(${r1(deg)}) scale(${r1(0.75 + rand() * 0.55)})`, fill: upper && rand() > 0.4 ? ART.leafLight : ART.leafDeep }, leaves);
    }
  }

  // ---- suelo, raíces y tronco ----
  const groundRx = Math.max(330, layout.baseRowWidth / 2 + 110);
  const ground = el('g', {}, root);
  el('path', { d: blobPath(0, 0, 1, rand, 0.05, 14), transform: `translate(0,${GROUND_Y + 14}) scale(${groundRx},34)`, fill: ART.grass }, ground);
  for (let k = 0; k < 26; k++) {
    const x = (rand() - 0.5) * groundRx * 1.8;
    const y = GROUND_Y + 4 + rand() * 30 * Math.sqrt(Math.max(0, 1 - (x / groundRx) ** 2));
    el('path', { d: `M${r1(x)},${r1(y)}l-3,-9M${r1(x)},${r1(y)}l0,-11M${r1(x)},${r1(y)}l4,-8`, stroke: ART.grassDark, 'stroke-width': 1.6, 'stroke-linecap': 'round', fill: 'none' }, ground);
  }
  const flowers = ['#f2b8c6', '#f6d36b', '#ffffff', '#c9b6ef'];
  for (let k = 0; k < 9; k++) {
    const x = (rand() > 0.5 ? 1 : -1) * (150 + rand() * (groundRx - 170));
    const y = GROUND_Y + 8 + rand() * 18;
    const f = el('g', { transform: `translate(${r1(x)},${r1(y)})` }, ground);
    for (let p = 0; p < 5; p++) el('circle', { cx: r1(Math.cos(p * 1.256) * 4), cy: r1(Math.sin(p * 1.256) * 4), r: 3.2, fill: flowers[k % 4] }, f);
    el('circle', { r: 2.2, fill: '#e9a23b' }, f);
  }

  // ---- ramas ----
  const branches = el('g', { fill: 'none', 'stroke-linecap': 'round' }, root);
  const branch = (x0, y0, x1, y1, w, faint) => {
    const my = (y0 + y1) / 2;
    const d = `M${r1(x0)},${r1(y0)}C${r1(x0)},${r1(my)} ${r1(x1)},${r1(my + 20)} ${r1(x1)},${r1(y1)}`;
    if (faint) {
      el('path', { d, stroke: ART.trunk, 'stroke-width': Math.max(4, w * 0.35), opacity: 0.45, 'stroke-dasharray': '2 9' }, branches);
      return;
    }
    el('path', { d, stroke: ART.trunkDark, 'stroke-width': w + 5 }, branches);
    el('path', { d, stroke: ART.trunk, 'stroke-width': w }, branches);
    el('path', { d, stroke: ART.trunkLight, 'stroke-width': Math.max(2, w * 0.18), transform: `translate(${-w * 0.18},0)`, opacity: 0.7 }, branches);
  };
  for (let g = 1; g <= layout.shown; g++) {
    layout.slots[g].forEach((s, i) => {
      if (!s.id && !s.childId) return;
      // las ramas principales nacen dentro del tronco, que se dibuja encima y oculta la unión
      const child = g === 1 ? { x: (i ? 1 : -1) * 16, y: FORK_Y + 70 } : layout.slots[g - 1][i >> 1];
      branch(child.x, g === 1 ? child.y : child.y - 30, s.x, s.y + 10, BRANCH_W[g], !s.id);
    });
  }

  const trunk = el('g', {}, root);
  for (const [sx, len] of [[-1, 70], [1, 76], [-1, 40], [1, 46]]) {
    const x0 = sx * (len === 70 || len === 76 ? 70 : 30);
    el('path', { d: `M${x0},${GROUND_Y - 6}q${sx * len * 0.5},6 ${sx * len},${18 + (len % 7)}`, stroke: ART.trunkDark, 'stroke-width': 9, 'stroke-linecap': 'round', fill: 'none' }, trunk);
  }
  const left = `M-122,${GROUND_Y}C-72,${GROUND_Y - 26} -62,40 -56,-40C-53,-90 -52,${FORK_Y + 30} -50,${FORK_Y + 12}`;
  const right = `M50,${FORK_Y + 12}C52,${FORK_Y + 30} 53,-90 56,-40C62,40 72,${GROUND_Y - 26} 122,${GROUND_Y}`;
  const trunkD = `${left}Q-30,${FORK_Y + 20} 0,${FORK_Y + 44}Q30,${FORK_Y + 20} 50,${FORK_Y + 12}C52,${FORK_Y + 30} 53,-90 56,-40C62,40 72,${GROUND_Y - 26} 122,${GROUND_Y}Z`;
  el('path', { d: trunkD, fill: 'url(#il-trunk)' }, trunk);
  el('path', { d: trunkD, fill: 'url(#il-bark)', opacity: 0.35 }, trunk);
  el('path', { d: `${left}${right}`, fill: 'none', stroke: ART.trunkDark, 'stroke-width': 2.5 }, trunk);
  el('path', { d: `M-18,${GROUND_Y - 30}q-6,-40 2,-80M22,${GROUND_Y - 50}q5,-30 -2,-62M-6,-60q-4,-30 3,-58`, stroke: ART.trunkDark, 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round', opacity: 0.6 }, trunk);

  // ---- tarjetas ----
  const cards = el('g', {}, root);
  for (const n of layout.nodes) {
    const pw = PHOTO[n.g];
    const rot = (((n.g * 7 + n.i * 13) % 5) - 2) * 1.1;
    if (n.kind === 'ghost') {
      const label = `¿${kinLabel(n.g, n.sex)}?`;
      const gg = el('g', { transform: `translate(${r1(n.x)},${r1(n.y)})`, 'data-ghost': n.sex, 'data-child': n.childId, role: 'button', tabindex: 0, 'aria-label': `Añadir ${label}`, style: 'cursor:pointer' }, cards);
      el('title', {}, gg).textContent = `Añadir ${kinLabel(n.g, n.sex).toLowerCase()}`;
      el('circle', { r: pw * 0.42, fill: ART.leafPale, stroke: ART.leafDeep, 'stroke-width': 2, 'stroke-dasharray': '6 6' }, gg);
      el('path', { d: 'M-11,0H11M0,-11V11', stroke: ART.leafDeep, 'stroke-width': 3.5, 'stroke-linecap': 'round' }, gg);
      const t = el('text', { y: pw * 0.42 + 24, 'text-anchor': 'middle', 'font-family': FONT, 'font-size': 19, fill: ART.ink, stroke: ART.paper, 'stroke-width': 4, 'paint-order': 'stroke' }, gg);
      t.textContent = label;
      continue;
    }
    const p = tree.get(n.id);
    const sexColor = p.sex === 'M' ? ART.male : p.sex === 'F' ? ART.female : ART.unknown;
    const selected = n.id === selectedId;
    const card = el('g', { transform: `translate(${r1(n.x)},${r1(n.y)}) rotate(${r1(rot)})`, 'data-id': p.id, role: 'button', tabindex: 0, 'aria-label': p.givenName, style: 'cursor:pointer' }, cards);
    el('title', {}, card).textContent = `${p.givenName} ${p.surname}`.trim();
    const half = pw / 2 + 6;
    el('rect', { x: -half + 3, y: -half + 5, width: half * 2, height: half * 2, rx: 7, fill: 'rgba(60,40,20,0.18)' }, card);
    el('rect', { x: -half, y: -half, width: half * 2, height: half * 2, rx: 7, fill: '#fff', stroke: selected ? ART.focus : '#e7e0d2', 'stroke-width': selected ? 4 : 1 }, card);
    const clipId = `il-c-${n.g}-${n.i}`;
    const cp = el('clipPath', { id: clipId }, card);
    el('rect', { x: -pw / 2, y: -pw / 2, width: pw, height: pw, rx: 4 }, cp);
    const ph = el('g', { 'clip-path': `url(#${clipId})` }, card);
    if (p.photo) {
      el('rect', { x: -pw / 2, y: -pw / 2, width: pw, height: pw, fill: '#eee' }, ph);
      el('image', { href: p.photo, x: -pw / 2, y: -pw / 2, width: pw, height: pw, preserveAspectRatio: 'xMidYMid slice' }, ph);
    } else {
      const s = el('svg', { x: -pw / 2, y: -pw / 2, width: pw, height: pw, viewBox: '0 0 100 100' }, ph);
      s.innerHTML = silhouette(p.sex);
    }
    // cinta de color (como el celo del póster)
    el('rect', { x: -16, y: -half - 7, width: 32, height: 13, rx: 2, fill: sexColor, opacity: 0.55, transform: `rotate(${-rot * 2})` }, card);

    // etiqueta
    const big = n.g === 0 ? p.givenName.split(/\s+/)[0] || 'Sin nombre' : kinLabel(n.g, p.sex);
    const small = n.g === 0 ? '' : p.givenName.split(/\s+/)[0];
    const tw = Math.max(pw + 18, 9 * Math.max(big.length, small.length) + 26);
    const th = small ? 46 : 34;
    const tag = el('g', { transform: `translate(0,${half + 8}) rotate(${r1(-rot * 0.6)})` }, card);
    el('rect', { x: -tw / 2 + 2, y: 3, width: tw, height: th, rx: 6, fill: 'rgba(60,40,20,0.12)' }, tag);
    el('rect', { x: -tw / 2, y: 0, width: tw, height: th, rx: 6, fill: '#fff', stroke: ART.tagLine, 'stroke-width': 1.2 }, tag);
    const t1 = el('text', { y: n.g === 0 ? 25 : 21, 'text-anchor': 'middle', 'font-family': FONT, 'font-size': n.g === 0 ? 24 : 21, fill: ART.ink, 'letter-spacing': n.g === 0 ? 1 : 0 }, tag);
    t1.textContent = clipText(n.g === 0 ? big.toUpperCase() : big, 14);
    if (small) {
      const t2 = el('text', { y: 40, 'text-anchor': 'middle', 'font-family': FONT, 'font-size': 16, fill: ART.inkSoft }, tag);
      t2.textContent = clipText(small, 16);
    }
  }

  // ---- hoja de papel y título ----
  const xs = blobs.map((b) => [b.x - b.r * 1.3, b.x + b.r * 1.3]).flat().concat([-groundRx, groundRx]);
  const ys = blobs.map((b) => b.y - b.r * 1.3);
  const minX = Math.min(...xs) - 50;
  const maxX = Math.max(...xs) + 50;
  const top = Math.min(...ys) - 110;
  const bottom = GROUND_Y + 90;
  const sheet = el('g', {}, root);
  el('rect', { x: minX + 8, y: top + 10, width: maxX - minX, height: bottom - top, rx: 6, fill: 'rgba(60,40,20,0.10)' }, sheet);
  el('rect', { x: minX, y: top, width: maxX - minX, height: bottom - top, rx: 6, fill: ART.paper, stroke: ART.sheetEdge, 'stroke-width': 2 }, sheet);
  const tt = el('text', { x: 0, y: top + 64, 'text-anchor': 'middle', 'font-family': FONT, 'font-size': 46, fill: ART.ink }, sheet);
  tt.textContent = title;
  el('path', { d: `M${-Math.min(220, title.length * 9)},${top + 80}q${Math.min(220, title.length * 9)},10 ${Math.min(440, title.length * 18)},0`, stroke: ART.leaf, 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round' }, sheet);
  root.insertBefore(sheet, root.firstChild.nextSibling); // detrás de todo (después de <defs>)

  return { bounds: { x: minX - 10, y: top - 10, w: maxX - minX + 30, h: bottom - top + 30 } };
}
