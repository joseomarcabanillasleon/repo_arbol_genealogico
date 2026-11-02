// Cálculo de posiciones del árbol "reloj de arena": antepasados arriba,
// persona central con sus parejas, descendientes abajo. Sin DOM (testeable).

export const CW = 148; // ancho de tarjeta (vertical, foto arriba)
export const CH = 132; // alto de tarjeta
export const GW = 72; // lado de los huecos "+" para progenitores que faltan
export const GAP_X = 24; // separación horizontal entre ramas
export const GAP_SP = 14; // separación entre persona y pareja
export const GAP_Y = 70; // separación vertical entre generaciones (deja sitio al botón "+")

/**
 * @returns {{ nodes: Array<{id, x, y, focus?, ghost?, sex?, childOf?}>, links: Array<{d}> }}
 * Los nodos "ghost" son huecos para añadir progenitores que faltan.
 */
export function computeLayout(tree, focusId, { up = 3, down = 2, ghosts = true, ghostDepth = 2, siblings = true } = {}) {
  const nodes = [];
  const links = [];
  if (!tree.get(focusId)) return { nodes, links };

  // ---- descendientes ----
  const descMemo = new Map();
  function block(id) {
    const fams = tree.spouseFamilies(id);
    const partners = fams.map((f) => f.partners.find((p) => p !== id) || null);
    // la persona a la izquierda y sus parejas a la derecha (los hermanos irán a su izquierda)
    const order = [{ id, self: true }];
    fams.forEach((f, i) => partners[i] && order.push({ id: partners[i], fam: f }));
    return { fams, order, width: order.length * CW + (order.length - 1) * GAP_SP };
  }

  function famChildren(fams, depth) {
    if (depth >= down) return [];
    return fams.flatMap((f) => f.children.map((c) => ({ c, f })));
  }

  function measure(id, depth, guard) {
    const key = `${id}:${depth}`;
    if (descMemo.has(key)) return descMemo.get(key);
    const b = block(id);
    let childW = 0;
    const kids = guard.has(id) ? [] : famChildren(b.fams, depth);
    guard.add(id);
    kids.forEach(({ c }, i) => {
      childW += measure(c, depth + 1, guard) + (i ? GAP_X : 0);
    });
    guard.delete(id);
    const w = Math.max(b.width, childW);
    descMemo.set(key, w);
    return w;
  }

  let focusCenter = 0;
  function place(id, depth, left, y, guard) {
    const b = block(id);
    const width = measure(id, depth, guard);
    const kids = guard.has(id) ? [] : famChildren(b.fams, depth);
    let childW = 0;
    kids.forEach(({ c }, i) => (childW += descMemo.get(`${c}:${depth + 1}`) + (i ? GAP_X : 0)));

    const blockLeft = left + (width - b.width) / 2;
    const pos = {};
    b.order.forEach((o, i) => {
      const x = blockLeft + i * (CW + GAP_SP);
      pos[o.id] = x;
      nodes.push({ id: o.id, x, y, w: CW, h: CH, focus: depth === 0 && o.self, spouse: !o.self, depth });
      if (depth === 0 && o.self) focusCenter = x + CW / 2;
    });
    const selfX = pos[id];
    // líneas de pareja
    for (const o of b.order) {
      if (o.self) continue;
      const x1 = Math.min(selfX, pos[o.id]) + CW;
      const x2 = Math.max(selfX, pos[o.id]);
      links.push({ d: `M${x1},${y + CH / 2}H${x2}`, kind: 'couple' });
    }
    // hijos
    guard.add(id);
    let cx = left + (width - childW) / 2;
    const childY = y + CH + GAP_Y;
    const busY = y + CH + GAP_Y / 2;
    const groups = new Map();
    for (const { c, f } of kids) {
      const w = descMemo.get(`${c}:${depth + 1}`);
      const childCenter = place(c, depth + 1, cx, childY, guard);
      if (!groups.has(f.id)) groups.set(f.id, { f, xs: [] });
      groups.get(f.id).xs.push(childCenter);
      cx += w + GAP_X;
    }
    guard.delete(id);
    for (const { f, xs } of groups.values()) {
      const partner = f.partners.find((p) => p !== id);
      let ox;
      let oy;
      if (partner && pos[partner] !== undefined) {
        ox = (Math.min(selfX, pos[partner]) + CW + Math.max(selfX, pos[partner])) / 2;
        oy = y + CH / 2;
      } else {
        ox = selfX + CW / 2;
        oy = y + CH;
      }
      const minX = Math.min(ox, ...xs);
      const maxX = Math.max(ox, ...xs);
      let d = `M${ox},${oy}V${busY}`;
      if (maxX > minX) d += `M${minX},${busY}H${maxX}`;
      for (const x of xs) d += `M${x},${busY}V${childY}`;
      links.push({ d, kind: 'child' });
    }
    return selfX + CW / 2;
  }

  place(focusId, 0, 0, 0, new Set());

  // ---- hermanos de la persona central (a su izquierda, del mayor al menor) ----
  const sibIds = siblings ? tree.siblings(focusId) : [];
  sibIds.sort((a, b) => birthKey(tree.get(a)) - birthKey(tree.get(b)));
  const rowLeft = Math.min(...nodes.filter((n) => n.y === 0).map((n) => n.x));
  const sibCenters = [];
  sibIds.forEach((sid, i) => {
    const x = rowLeft - (sibIds.length - i) * (CW + GAP_X);
    nodes.push({ id: sid, x, y: 0, w: CW, h: CH, sibling: true });
    sibCenters.push(x + CW / 2);
  });

  // ---- antepasados ----
  // Huecos "+" para padres y abuelos que faltan (hasta ghostDepth generaciones)
  const upMemo = new Map();
  function parentsOf(id, g) {
    const real = tree.orderedParents(id).map((pid) => ({ id: pid }));
    if (!ghosts || g >= ghostDepth || real.length >= 2) return real;
    if (real.length === 0) return [{ ghost: 'M', childOf: id }, { ghost: 'F', childOf: id }];
    const sex = tree.get(real[0].id).sex;
    if (sex === 'M') return [...real, { ghost: 'F', childOf: id }];
    if (sex === 'F') return [{ ghost: 'M', childOf: id }, ...real];
    return [{ ghost: 'U', childOf: id }, ...real];
  }

  function measureUp(p, g) {
    if (p.ghost) return GW;
    if (g >= up) return CW;
    const key = `${p.id}:${g}`;
    if (upMemo.has(key)) return upMemo.get(key);
    const ps = parentsOf(p.id, g);
    const w = ps.length ? Math.max(CW, ps.reduce((s, q, i) => s + measureUp(q, g + 1) + (i ? GAP_X : 0), 0)) : CW;
    upMemo.set(key, w);
    return w;
  }

  function placeUp(id, cx, y, g, extraXs = []) {
    if (g >= up) return;
    const ps = parentsOf(id, g);
    if (!ps.length) return;
    const widths = ps.map((p) => measureUp(p, g + 1));
    const total = widths.reduce((a, b) => a + b, 0) + GAP_X * (ps.length - 1);
    let left = cx - total / 2;
    const py = y - CH - GAP_Y;
    const centers = [];
    const halfW = [];
    ps.forEach((p, i) => {
      const pcx = left + widths[i] / 2;
      centers.push(pcx);
      if (p.ghost) {
        halfW.push(GW / 2);
        nodes.push({ id: `ghost-${p.ghost}-${id}`, x: pcx - GW / 2, y: py + (CH - GW) / 2, w: GW, h: GW, ghost: p.ghost, childOf: p.childOf });
      } else {
        halfW.push(CW / 2);
        nodes.push({ id: p.id, x: pcx - CW / 2, y: py, w: CW, h: CH, ancestor: true });
        placeUp(p.id, pcx, py, g + 1);
      }
      left += widths[i] + GAP_X;
    });
    const allGhost = ps.every((p) => p.ghost);
    const kind = allGhost ? 'ghost' : 'parent';
    const busY = py + CH + GAP_Y / 2;
    const targets = [cx, ...extraXs];
    let d;
    if (centers.length === 2) {
      links.push({ d: `M${centers[0] + halfW[0]},${py + CH / 2}H${centers[1] - halfW[1]}`, kind: ps.some((p) => p.ghost) ? 'ghost' : 'couple' });
      const mid = (centers[0] + centers[1]) / 2;
      d = `M${mid},${py + CH / 2}V${busY}`;
      targets.push(mid);
    } else {
      d = `M${centers[0]},${py + CH}V${busY}`;
      targets.push(centers[0]);
    }
    d += `M${Math.min(...targets)},${busY}H${Math.max(...targets)}`;
    for (const x of [cx, ...extraXs]) d += `M${x},${busY}V${y}`;
    links.push({ d, kind });
  }

  placeUp(focusId, focusCenter, 0, 0, sibCenters);
  if (!up && sibCenters.length) {
    const busY = -GAP_Y / 2;
    let d = `M${Math.min(...sibCenters)},${busY}H${focusCenter}`;
    for (const x of [...sibCenters, focusCenter]) d += `M${x},${busY}V0`;
    links.push({ d, kind: 'parent' });
  }

  return { nodes, links, bounds: bounds(nodes) };
}

function birthKey(p) {
  const m = (p?.birth.date || '').match(/\b(\d{3,4})\b/);
  return m ? +m[1] : 9999;
}

function bounds(nodes) {
  if (!nodes.length) return { x: 0, y: 0, w: CW, h: CH };
  const x = Math.min(...nodes.map((n) => n.x));
  const y = Math.min(...nodes.map((n) => n.y));
  return { x, y, w: Math.max(...nodes.map((n) => n.x + n.w)) - x, h: Math.max(...nodes.map((n) => n.y + n.h)) + 24 - y };
}
