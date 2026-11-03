import { FamilyTree, fullName, lifeYears, normalize } from './store.js';
import { computeLayout, CW, CH, GW } from './layout.js';
import { importGedcom, exportGedcom } from './gedcom.js';
import { relationship } from './relationship.js';
import { formatDate, normalizeDate, yearOf } from './dates.js';
import { buildSample } from './sample.js';
import { silhouetteSVG, silhouetteInner, silhouetteInline } from './avatars.js';
import { illustratedLayout, renderIllustrated } from './illustrated.js';
import { createOnboarding } from './onboarding.js';
import { questions, completeness, upcoming, consistency, familySearchURL } from './insights.js';

const STORAGE_KEY = 'raices.tree.v1';
const PREFS_KEY = 'raices.prefs.v1';
const SVG_NS = 'http://www.w3.org/2000/svg';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------------- estado ----------------
const tree = new FamilyTree(loadJSON(STORAGE_KEY));
const prefs = Object.assign({ up: 3, down: 2, focus: null, view: 'tree', mode: 'art', artBase: null }, loadJSON(PREFS_KEY) || {});
const state = {
  focus: tree.get(prefs.focus) ? prefs.focus : tree.rootId,
  artBase: tree.get(prefs.artBase) ? prefs.artBase : tree.rootId,
  view: 'tree',
  panelOpen: false,
  qSkip: new Set(), // preguntas saltadas en esta sesión ("Ahora no")
  t: { k: 1, x: 0, y: 0 },
};

function loadJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

let saveTimer;
tree.onChange(() => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 250);
  if (!tree.get(state.focus)) state.focus = tree.rootId;
  if (!tree.get(state.artBase)) state.artBase = tree.rootId;
  renderAll();
});

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tree.toJSON()));
  } catch (e) {
    toast('No se pudo guardar: el almacenamiento del navegador está lleno. Exporta una copia de seguridad y usa fotos más pequeñas.', 6000);
  }
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ up: prefs.up, down: prefs.down, focus: state.focus, mode: prefs.mode, artBase: state.artBase }));
  } catch { /* sin almacenamiento */ }
}

// ---------------- utilidades de UI ----------------
let toastTimer;
function toast(msg, ms = 3000) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), ms);
}


function avatarHTML(p, cls = 'dot') {
  if (p.photo) return `<img class="${cls} sex-${p.sex}" src="${esc(p.photo)}" alt="" loading="lazy" />`;
  return silhouetteSVG(p.sex, cls);
}

function chipHTML(p, sub = '') {
  const info = sub || lifeYears(p);
  return `<button class="chip" data-goto="${p.id}">${avatarHTML(p)}<span><strong>${esc(fullName(p))}</strong>${info ? `<small>${esc(info)}</small>` : ''}</span></button>`;
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const today = () => new Date().toISOString().slice(0, 10);

// ---------------- navegación ----------------
function setView(view) {
  const from = state.view;
  state.view = view;
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  $('#panel').hidden = !(view === 'tree' && state.panelOpen && tree.get(state.focus));
  renderView();
  if (view === 'tree' && from !== 'tree') centerOnFocus(false); // al volver al árbol, encuadrarlo
}

function focusPerson(id, { openPanel = true, animate = true } = {}) {
  if (!tree.get(id)) return;
  state.focus = id;
  if (openPanel) state.panelOpen = true;
  let center = true;
  if (prefs.mode === 'art') {
    // en el árbol ilustrado solo cambia la base si la persona no aparece en él
    const visible = lastLayout?.art && lastLayout.nodes.some((n) => n.id === id && n.kind === 'person');
    if (!visible) state.artBase = id;
    center = !visible;
  }
  savePrefs();
  if (state.view !== 'tree') setView('tree');
  renderPanel(); // primero el panel: su tamaño cuenta para centrar
  renderTree({ center, animate });
}

function renderAll() {
  renderView();
  renderPanel();
}

function renderView() {
  syncChrome();
  if (state.view === 'tree') renderTree({ center: false });
  if (state.view === 'people') renderPeople();
  if (state.view === 'relation') renderRelation();
  if (state.view === 'stats') renderStats();
  if (state.view === 'home') renderHome();
}

// ---------------- inicio ----------------
function personAvatar(p, cls) {
  return p.photo ? `<img class="${cls}" src="${esc(p.photo)}" alt="" />` : silhouetteSVG(p.sex, cls);
}

function renderHome() {
  const me = tree.get(tree.rootId);
  if (!me) return;
  $('#home-hello').textContent = `Hola, ${me.givenName.split(/\s+/)[0] || 'de nuevo'}`;
  $('#home-sub').textContent = `${tree.displayName()} · ${tree.size} ${tree.size === 1 ? 'persona' : 'personas'}`;

  // anillo de completitud
  const c = completeness(tree, tree.rootId);
  const R = 30;
  const L = 2 * Math.PI * R;
  $('#home-ring').innerHTML = `
    <svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="${R}" class="ring-bg"/><circle cx="40" cy="40" r="${R}" class="ring-fg" stroke-dasharray="${(L * c.pct) / 100} ${L}" transform="rotate(-90 40 40)"/><text x="40" y="46" text-anchor="middle">${c.pct}%</text></svg>
    <span><strong>${c.known} de ${c.total}</strong> antepasados directos hasta tus bisabuelos</span>`;
  $('#home-ring').title = c.byGen.map((g) => `${['Tú', 'Padres', 'Abuelos', 'Bisabuelos'][g.gen]}: ${g.known}/${g.total}`).join(' · ');

  // pregunta
  const qs = questions(tree, tree.rootId, tree.dismissed).filter((q) => !state.qSkip.has(q.id));
  const box = $('#home-question');
  if (!qs.length) {
    box.innerHTML = `<div class="q-done"><strong>¡Buen trabajo!</strong><span class="muted">No hay más preguntas por ahora. Puedes seguir añadiendo familia desde el árbol.</span></div>`;
  } else {
    const q = qs[0];
    const subj = tree.get(q.subjectId);
    box.innerHTML = `
      <div class="q-top">${personAvatar(subj, 'q-av')}<span class="muted">${qs.length === 1 ? 'Última pregunta' : `Quedan ${qs.length} preguntas`}</span></div>
      <p class="q-text">${esc(q.text)}</p>
      <div class="q-actions">
        <button class="btn q-no" data-q="no">No</button>
        <button class="btn primary q-yes" data-q="yes">Sí</button>
      </div>
      <button class="ob-link" data-q="skip">Ahora no</button>`;
    box.dataset.qid = q.id;
  }

  // próximas fechas
  const ups = upcoming(tree, new Date(), 45).slice(0, 6);
  const when = (n) => (n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`);
  const fmt = (d) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
  $('#home-dates').innerHTML = ups.length
    ? ups.map((u) => {
      const ps = u.personIds.map((id) => tree.get(id));
      const names = ps.map((p) => p.givenName.split(/\s+/)[0]).join(' y ');
      const text = {
        birthday: `Cumpleaños de ${names} · cumple ${u.years}`,
        'birth-memory': `${u.years} años del nacimiento de ${names}`,
        death: `${u.years} años del fallecimiento de ${names}`,
        wedding: `Aniversario de ${names} · ${u.years} años`,
      }[u.kind];
      const icon = { birthday: '🎂', 'birth-memory': '🌱', death: '🕯️', wedding: '💍' }[u.kind];
      return `<button class="hl-row${u.inDays === 0 ? ' today' : ''}" data-goto="${ps[0].id}"><span class="hl-ico">${icon}</span><span><strong>${esc(text)}</strong><small>${fmt(u.date)} · ${when(u.inDays)}</small></span></button>`;
    }).join('')
    : '<p class="muted hl-empty">No hay fechas en los próximos 45 días. Añade fechas completas (día, mes y año) para ver aquí cumpleaños y aniversarios.</p>';

  // revisión de datos
  const issues = consistency(tree);
  $('#home-issues-wrap').hidden = !issues.length;
  $('#home-issues').innerHTML = issues.slice(0, 8).map((i) => `<button class="hl-row" data-goto="${i.personId}"><span class="hl-ico">⚠️</span><span>${esc(i.text)}</span></button>`).join('');
}

$('#home-question').addEventListener('click', (e) => {
  const b = e.target.closest('[data-q]');
  if (!b) return;
  const qid = $('#home-question').dataset.qid;
  const q = questions(tree, tree.rootId, tree.dismissed).find((x) => x.id === qid);
  if (!q) return;
  if (b.dataset.q === 'no') return tree.dismiss(q.id);
  if (b.dataset.q === 'skip') {
    state.qSkip.add(q.id);
    return renderHome();
  }
  openPersonForm({ mode: q.yes.mode, anchor: q.yes.anchor, sex: q.yes.sex });
});

$('#view-home').addEventListener('click', (e) => {
  const go = e.target.closest('#home-dates [data-goto], #home-issues [data-goto]');
  if (go) return focusPerson(go.dataset.goto);
  if (e.target.closest('#home-ring')) return setView('tree');
  const quick = e.target.closest('[data-quick]');
  if (!quick) return;
  switch (quick.dataset.quick) {
    case 'add': return openAddMenu(tree.rootId);
    case 'photo': {
      const close = [tree.rootId, ...tree.parents(tree.rootId), ...tree.spouses(tree.rootId), ...tree.children(tree.rootId), ...tree.siblings(tree.rootId)];
      const target = close.find((id) => !tree.get(id).photo) || tree.all().find((p) => !p.photo)?.id;
      if (!target) return toast('¡Todos tienen foto!');
      toast(`Añade la foto de ${fullName(tree.get(target))}`);
      return openPersonForm({ mode: 'edit', anchor: target });
    }
    case 'search':
      if (window.innerWidth <= 820) document.body.classList.add('search-open');
      return $('#search').focus();
    case 'tree': return setView('tree');
    case 'poster': return exportPoster();
    case 'relation': return setView('relation');
  }
});

$('#home-records').addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const y = String(fd.get('y') || '').trim();
  const url = familySearchURL({ givenName: String(fd.get('g') || '').trim(), surname: String(fd.get('s') || '').trim(), birth: { date: /^\d{3,4}$/.test(y) ? y : '', place: '' } });
  window.open(url, '_blank', 'noopener');
});

// ---------------- árbol (SVG) ----------------
const svg = $('#tree-svg');
const viewport = $('#viewport');
let lastLayout = null;

function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

function clip(text, max) {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function renderTree({ center = false, animate = false } = {}) {
  viewport.replaceChildren();
  syncModeUI();
  if (!tree.size) return;
  if (prefs.mode === 'art') return renderArt({ center, animate });
  if (!tree.get(state.focus)) state.focus = tree.rootId;
  const layout = computeLayout(tree, state.focus, { up: prefs.up, down: prefs.down });
  lastLayout = layout;

  const linksG = el('g', {}, viewport);
  for (const l of layout.links) el('path', { d: l.d, class: `link ${l.kind}` }, linksG);

  const nodesG = el('g', {}, viewport);
  for (const n of layout.nodes) {
    if (n.ghost) {
      const label = n.ghost === 'M' ? 'Añadir padre' : n.ghost === 'F' ? 'Añadir madre' : 'Añadir progenitor';
      const g = el('g', { class: 'ghost-card', transform: `translate(${n.x},${n.y})`, 'data-ghost': n.ghost, 'data-child': n.childOf, role: 'button', tabindex: 0, 'aria-label': label }, nodesG);
      el('title', {}, g).textContent = label;
      el('rect', { width: GW, height: GW, rx: 12 }, g);
      const t = el('text', { x: GW / 2, y: GW / 2 + 11, 'text-anchor': 'middle' }, g);
      t.textContent = '+';
      continue;
    }
    const p = tree.get(n.id);
    const g = el('g', {
      class: `card sex-${p.sex}${n.focus ? ' focus' : ''}${p.deceased ? ' deceased' : ''}`,
      transform: `translate(${n.x},${n.y})`,
      'data-id': p.id,
      role: 'button',
      tabindex: 0,
      'aria-label': `${fullName(p)} ${lifeYears(p)}`,
    }, nodesG);
    el('title', {}, g).textContent = `${fullName(p)}${lifeYears(p) ? ' · ' + lifeYears(p) : ''}`;
    // pestaña "+" bajo la tarjeta para añadir familiares de esta persona
    const tab = el('g', { class: 'plus-tab', 'data-plus': p.id, role: 'button', 'aria-label': `Añadir familiar de ${fullName(p)}` }, g);
    el('path', { d: `M${CW / 2 - 30},${CH - 4}h60l-10,18q-4,6-10,6h-20q-6,0-10-6z` }, tab);
    el('path', { class: 'plus-sign', d: `M${CW / 2 - 5},${CH + 9}h10M${CW / 2},${CH + 4}v10` }, tab);
    el('rect', { class: 'shadow', width: CW, height: CH, rx: 14, y: 2 }, g);
    const inner = el('g', { 'clip-path': 'url(#card-clip)' }, g);
    el('rect', { class: 'bg', width: CW, height: CH, rx: 14 }, inner);
    el('rect', { class: 'accent', width: CW, height: 5 }, inner);
    el('rect', { class: 'frame', width: CW, height: CH, rx: 14 }, g);
    const av = el('g', { 'clip-path': 'url(#avatar-clip)', class: 'avatar' }, g);
    if (p.photo) {
      el('circle', { class: 'avatar-bg', cx: CW / 2, cy: 44, r: 30 }, av);
      el('image', { href: p.photo, x: CW / 2 - 30, y: 14, width: 60, height: 60, preserveAspectRatio: 'xMidYMid slice' }, av);
    } else {
      const sil = el('svg', { x: CW / 2 - 30, y: 14, width: 60, height: 60, viewBox: '0 0 100 100' }, av);
      sil.innerHTML = silhouetteInner(p.sex);
    }
    el('circle', { class: 'avatar-ring', cx: CW / 2, cy: 44, r: 30 }, g);
    const nm = el('text', { class: 'name', x: CW / 2, y: 94, 'text-anchor': 'middle' }, g);
    nm.textContent = clip(p.givenName || 'Sin nombre', 17);
    const sn = el('text', { class: 'surname', x: CW / 2, y: 110, 'text-anchor': 'middle' }, g);
    sn.textContent = clip(p.surname, 19);
    const yr = el('text', { class: 'years', x: CW / 2, y: 125, 'text-anchor': 'middle' }, g);
    yr.textContent = lifeYears(p);
  }

  if (center) centerOnFocus(animate);
  else applyTransform();
}

function renderArt({ center, animate }) {
  if (!tree.get(state.artBase)) state.artBase = tree.rootId;
  const layout = illustratedLayout(tree, state.artBase);
  const res = renderIllustrated(viewport, layout, {
    el,
    tree,
    silhouette: silhouetteInline,
    title: tree.displayName(),
    selectedId: state.panelOpen ? state.focus : null,
  });
  lastLayout = { art: true, nodes: layout.nodes, bounds: res.bounds };
  if (center) fitAll(animate);
  else applyTransform();
}

function syncModeUI() {
  const art = prefs.mode === 'art';
  $$('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === prefs.mode)));
  $$('.diagram-only').forEach((n) => (n.hidden = art));
  $$('.art-only').forEach((n) => (n.hidden = !art));
  $('#tree-svg').classList.toggle('art', art);
}

function setMode(mode) {
  prefs.mode = mode;
  savePrefs();
  renderTree({ center: true, animate: false });
  renderPanel();
}

function applyTransform(animate = false) {
  viewport.classList.toggle('animate', animate);
  viewport.style.transform = `translate(${state.t.x}px, ${state.t.y}px) scale(${state.t.k})`;
  if (animate) setTimeout(() => viewport.classList.remove('animate'), 400);
}

function visibleArea() {
  const r = svg.getBoundingClientRect();
  let w = r.width;
  let h = r.height;
  const panel = $('#panel');
  if (!panel.hidden) {
    const pr = panel.getBoundingClientRect();
    if (window.innerWidth > 820) w -= pr.width + 24;
    else h -= pr.height;
  }
  return { w: Math.max(w, 200), h: Math.max(h, 200) };
}

function centerOnFocus(animate = false) {
  if (!lastLayout) return;
  if (lastLayout.art) return fitAll(animate);
  const n = lastLayout.nodes.find((x) => x.id === state.focus && x.focus);
  if (!n) return;
  const { w, h } = visibleArea();
  const k = state.t.k;
  state.t.x = w / 2 - (n.x + CW / 2) * k;
  state.t.y = h / 2 - (n.y + CH / 2) * k;
  applyTransform(animate);
}

function fitAll(animate = true) {
  if (!lastLayout) return;
  const b = lastLayout.bounds;
  const { w, h } = visibleArea();
  const pad = lastLayout.art ? 24 : 40;
  const k = Math.min(1, Math.max(0.15, Math.min((w - pad) / b.w, (h - (lastLayout.art ? 70 : 120)) / b.h)));
  state.t = { k, x: (w - b.w * k) / 2 - b.x * k, y: (h - b.h * k) / 2 - b.y * k + (lastLayout.art ? 26 : 20) };
  applyTransform(animate !== false);
}

function zoomAt(factor, cx, cy) {
  const k = Math.min(2.5, Math.max(0.15, state.t.k * factor));
  const f = k / state.t.k;
  state.t.x = cx - (cx - state.t.x) * f;
  state.t.y = cy - (cy - state.t.y) * f;
  state.t.k = k;
  applyTransform();
}

// pan / zoom con ratón, rueda y gestos táctiles
(function setupPanZoom() {
  const pointers = new Map();
  let moved = false;
  let start = null;
  let pinch = null;

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    // Pellizco en trackpad (ctrlKey) o rueda de ratón => zoom; desplazamiento con dos dedos => mover
    const mouseWheel = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50);
    if (e.ctrlKey || mouseWheel) {
      zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top);
    } else {
      state.t.x -= e.deltaX;
      state.t.y -= e.deltaY;
      applyTransform();
    }
  }, { passive: false });

  svg.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      moved = false;
      start = { x: e.clientX, y: e.clientY, tx: state.t.x, ty: state.t.y };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: state.t.k };
      moved = true;
    }
  });

  svg.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = svg.getBoundingClientRect();
      zoomAt((pinch.k * (d / pinch.d)) / state.t.k, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
    } else if (pointers.size === 1 && start) {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) > 6) {
        moved = true;
        svg.classList.add('dragging');
        svg.setPointerCapture(e.pointerId);
      }
      if (moved) {
        state.t.x = start.tx + dx;
        state.t.y = start.ty + dy;
        applyTransform();
      }
    }
  });

  const end = (e) => {
    const wasTap = pointers.size === 1 && !moved;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) svg.classList.remove('dragging');
    if (wasTap && e.type === 'pointerup') handleTreeTap(e.target);
    if (pointers.size === 1) {
      const [p] = [...pointers.values()];
      start = { x: p.x, y: p.y, tx: state.t.x, ty: state.t.y };
    }
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  svg.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleTreeTap(e.target);
    }
  });
})();

function handleTreeTap(target) {
  const plus = target.closest?.('[data-plus]');
  if (plus) return openAddMenu(plus.dataset.plus);
  const ghost = target.closest?.('[data-ghost]');
  if (ghost) {
    const sex = ghost.dataset.ghost;
    openPersonForm({ mode: 'parent', anchor: ghost.dataset.child, sex: sex === 'U' ? undefined : sex });
    return;
  }
  const card = target.closest?.('[data-id]');
  if (!card) return;
  const id = card.dataset.id;
  if (prefs.mode === 'art') {
    state.focus = id;
    state.panelOpen = true;
    savePrefs();
    renderPanel();
    renderTree();
    return;
  }
  if (id === state.focus) {
    state.panelOpen = true;
    renderPanel();
  } else {
    focusPerson(id);
  }
}

$('#zoom-in').addEventListener('click', () => { const { w, h } = visibleArea(); zoomAt(1.25, w / 2, h / 2); });
$('#zoom-out').addEventListener('click', () => { const { w, h } = visibleArea(); zoomAt(0.8, w / 2, h / 2); });
$('#zoom-fit').addEventListener('click', () => fitAll());
$('#zoom-home').addEventListener('click', () => {
  if (!tree.rootId) return;
  state.artBase = tree.rootId;
  focusPerson(tree.rootId, { openPanel: false });
});
$$('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
$('#poster-btn').addEventListener('click', () => exportPoster());
$('#brand').addEventListener('click', (e) => {
  e.preventDefault();
  if (tree.rootId) focusPerson(tree.rootId, { openPanel: false });
});

$('#depth-up').value = String(prefs.up);
$('#depth-down').value = String(prefs.down);
$('#depth-up').addEventListener('change', (e) => { prefs.up = +e.target.value; savePrefs(); renderTree({ center: true }); });
$('#depth-down').addEventListener('change', (e) => { prefs.down = +e.target.value; savePrefs(); renderTree({ center: true }); });
window.addEventListener('resize', () => state.view === 'tree' && centerOnFocus());

// ---------------- panel de persona ----------------
function renderPanel() {
  const panel = $('#panel');
  const p = tree.get(state.focus);
  panel.hidden = !(p && state.panelOpen && state.view === 'tree');
  if (!p) return;
  const fact = (label, ev) => {
    const parts = [formatDate(ev.date), ev.place].filter(Boolean);
    return parts.length ? `<div><dt>${label}</dt><dd>${esc(parts.join(' · '))}</dd></div>` : '';
  };
  const parents = tree.orderedParents(p.id).map((id) => tree.get(id));
  const fams = tree.spouseFamilies(p.id);
  const siblings = tree.siblings(p.id).map((id) => tree.get(id)).sort(byBirth);
  const isRoot = tree.rootId === p.id;
  const rel = !isRoot && tree.rootId ? relationship(tree, tree.rootId, p.id) : null;

  const famHTML = fams.map((f) => {
    const sp = tree.get(f.partners.find((x) => x !== p.id));
    const kids = f.children.map((id) => tree.get(id)).sort(byBirth);
    const union = [formatDate(f.marriage.date), f.marriage.place].filter(Boolean).join(' · ');
    return `
      ${sp ? chipHTML(sp) : '<div class="empty-rel">Otro progenitor desconocido</div>'}
      ${sp ? `<div class="union">${union ? `Unión: ${esc(union)}` : 'Sin fecha de unión'} <button data-edit-union="${f.id}">editar</button></div>` : ''}
      ${kids.length ? `<div style="padding-left:24px">${kids.map((k) => chipHTML(k)).join('')}</div>` : ''}`;
  }).join('');

  $('#panel-body').innerHTML = `
    <div class="p-head">
      ${p.photo ? `<img class="p-avatar" src="${esc(p.photo)}" alt="" />` : silhouetteSVG(p.sex, 'p-avatar')}
      <div>
        <h3>${esc(fullName(p))}</h3>
        <div class="years">${esc(lifeYears(p))}${isRoot ? ' · Persona de inicio' : ''}</div>
        ${rel && rel.kind !== 'none' ? `<div class="years">${esc(capitalize(rel.label))} de ${esc(tree.get(tree.rootId).givenName)}</div>` : ''}
      </div>
    </div>
    <dl class="p-facts">
      ${fact('Nacimiento', p.birth)}
      ${p.deceased ? fact('Defunción', p.death) || '<div><dt>Defunción</dt><dd>Fallecido/a</dd></div>' : ''}
      ${p.occupation ? `<div><dt>Ocupación</dt><dd>${esc(p.occupation)}</dd></div>` : ''}
    </dl>
    ${p.notes ? `<p class="p-notes">${esc(p.notes)}</p>` : ''}
    <div class="p-actions">
      <button class="btn small primary" data-action="edit"><svg><use href="#i-edit"/></svg>Editar</button>
      <button class="btn small" data-action="add-menu"><svg><use href="#i-plus"/></svg>Añadir familiar</button>
      <a class="btn small ghost" href="${esc(familySearchURL(p))}" target="_blank" rel="noopener"><svg><use href="#i-search"/></svg>Buscar registros</a>
      ${prefs.mode === 'art' && p.id !== state.artBase ? '<button class="btn small ghost" data-action="art-base"><svg><use href="#i-tree"/></svg>Ver su árbol</button>' : ''}
      ${isRoot ? '' : '<button class="btn small ghost" data-action="set-root"><svg><use href="#i-home"/></svg>Hacer inicio</button>'}
    </div>
    <div class="p-section">
      <h4>Padres ${parents.length < 2 ? '<button data-add="parent">+ añadir</button>' : ''}</h4>
      ${parents.map((x) => chipHTML(x)).join('') || '<div class="empty-rel">Sin padres registrados</div>'}
      <h4>Parejas e hijos <button data-add="partner">+ pareja</button></h4>
      ${famHTML || '<div class="empty-rel">Sin pareja ni hijos registrados</div>'}
      <div style="margin-top:4px"><button class="btn small ghost" data-add="child">+ Añadir hijo/a</button></div>
      <h4>Hermanos <button data-add="sibling">+ añadir</button></h4>
      ${siblings.map((x) => chipHTML(x)).join('') || '<div class="empty-rel">Sin hermanos registrados</div>'}
    </div>
    <div style="margin-top:20px; display:flex; gap:8px; flex-wrap:wrap">
      ${parents.length ? '<button class="btn small ghost" data-action="unlink-parents">Desvincular de sus padres</button>' : ''}
      <button class="btn small danger" data-action="delete">Eliminar persona</button>
    </div>`;
}

function byBirth(a, b) {
  return (yearOf(a.birth.date) || 9999) - (yearOf(b.birth.date) || 9999);
}

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

$('#panel').addEventListener('click', (e) => {
  const go = e.target.closest('[data-goto]');
  if (go) return focusPerson(go.dataset.goto);
  const add = e.target.closest('[data-add]');
  if (add) return openPersonForm({ mode: add.dataset.add, anchor: state.focus });
  const union = e.target.closest('[data-edit-union]');
  if (union) return openUnionForm(union.dataset.editUnion);
  const act = e.target.closest('[data-action]');
  if (!act) return;
  const p = tree.get(state.focus);
  switch (act.dataset.action) {
    case 'edit': return openPersonForm({ mode: 'edit', anchor: p.id });
    case 'add-menu': return openAddMenu(p.id);
    case 'art-base':
      state.artBase = p.id;
      savePrefs();
      renderPanel();
      return renderTree({ center: true, animate: true });
    case 'set-root': tree.setRoot(p.id); toast(`${fullName(p)} es ahora la persona de inicio`); return;
    case 'unlink-parents':
      return confirmDialog('Desvincular de sus padres', `Se quitará el vínculo entre ${fullName(p)} y sus padres. No se borra a nadie.`, 'Desvincular', () => tree.unlinkParents(p.id));
    case 'delete':
      return confirmDialog('Eliminar persona', `¿Eliminar a ${fullName(p)}? Sus vínculos familiares se perderán. Esta acción no se puede deshacer.`, 'Eliminar', () => {
        tree.deletePerson(p.id);
        state.panelOpen = false;
        toast('Persona eliminada');
      }, true);
  }
});
$('#panel-close').addEventListener('click', () => {
  state.panelOpen = false;
  renderPanel();
  if (prefs.mode === 'art') renderTree(); // quita el resaltado
});
$('#panel-handle').addEventListener('click', () => $('#panel').classList.toggle('expanded'));

// ---------------- modales ----------------
const modal = $('#modal');
const form = $('#modal-form');
let onSubmit = null;

function openModal(html, submit) {
  form.innerHTML = html;
  onSubmit = submit;
  modal.showModal();
  const first = form.querySelector('input[type=text]:not([disabled]), select, textarea');
  if (first && window.innerWidth > 820) first.focus();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.submitter?.value === 'cancel') return modal.close();
  if (!onSubmit) return modal.close();
  try {
    const keepOpen = onSubmit(new FormData(form), e.submitter?.value);
    if (keepOpen !== true) modal.close();
  } catch (err) {
    const box = form.querySelector('.form-error');
    if (box) box.textContent = err.message;
    else toast(err.message);
  }
});
modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

function confirmDialog(title, text, okLabel, fn, danger = false) {
  openModal(`
    <div class="m-head"><h2>${esc(title)}</h2></div>
    <div class="m-body"><p style="margin:0">${esc(text)}</p></div>
    <div class="m-foot">
      <button class="btn" value="cancel" formnovalidate>Cancelar</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" value="ok">${esc(okLabel)}</button>
    </div>`, () => fn());
}

function openAddMenu(id) {
  const p = tree.get(id);
  const parents = tree.parents(id);
  const opts = [
    ['parent-M', 'Padre', parents.length < 2 && !parents.some((x) => tree.get(x).sex === 'M')],
    ['parent-F', 'Madre', parents.length < 2 && !parents.some((x) => tree.get(x).sex === 'F')],
    ['partner', 'Pareja / cónyuge', true],
    ['child', 'Hijo o hija', true],
    ['sibling', 'Hermano o hermana', true],
  ].filter((o) => o[2]);
  openModal(`
    <div class="m-head"><h2>Añadir familiar</h2><p>¿Qué relación tiene con ${esc(fullName(p))}?</p></div>
    <div class="m-body"><div class="add-grid">
      ${opts.map(([v, l]) => `<button class="btn" value="${v}">${l}</button>`).join('')}
    </div></div>
    <div class="m-foot"><button class="btn" value="cancel">Cancelar</button></div>`, (_fd, value) => {
    if (!value) return;
    const [mode, sex] = value.split('-');
    setTimeout(() => openPersonForm({ mode, anchor: id, sex }), 0);
  });
}

const TITLES = {
  first: 'Añade la primera persona',
  unlinked: 'Nueva persona',
  edit: 'Editar persona',
  parent: 'Añadir progenitor',
  partner: 'Añadir pareja',
  child: 'Añadir hijo o hija',
  sibling: 'Añadir hermano o hermana',
};

function firstSurname(p) {
  return p ? p.surname.split(/\s+/)[0] || '' : '';
}

function suggestSurname(mode, anchor, sex, otherParent) {
  const a = tree.get(anchor);
  if (!a) return '';
  if (mode === 'sibling') return a.surname;
  if (mode === 'parent' && sex === 'M') return firstSurname(a);
  if (mode === 'parent' && sex === 'F') return a.surname.split(/\s+/)[1] || '';
  if (mode === 'child') {
    const o = tree.get(otherParent);
    const father = [a, o].find((x) => x?.sex === 'M') || a;
    const mother = [a, o].find((x) => x && x !== father);
    return [firstSurname(father), firstSurname(mother)].filter(Boolean).join(' ');
  }
  return '';
}

function openPersonForm({ mode, anchor, sex }) {
  const editing = mode === 'edit';
  const a = tree.get(anchor);
  const p = editing ? a : null;
  const relSex = mode === 'parent' && sex ? sex : undefined;
  const spouses = mode === 'child' ? tree.spouses(anchor).map((id) => tree.get(id)) : [];
  const defaultOther = spouses.length === 1 ? spouses[0].id : spouses[0]?.id || '';
  const parentTitle = relSex === 'M' ? 'Añadir padre' : relSex === 'F' ? 'Añadir madre' : TITLES.parent;
  const title = mode === 'parent' ? parentTitle : TITLES[mode];
  const sexVal = p?.sex || relSex || '';
  const existingAllowed = !['edit', 'first', 'unlinked'].includes(mode) && tree.size > 1;
  const candidates = existingAllowed
    ? tree.all().filter((x) => x.id !== anchor).sort((x, y) => fullName(x).localeCompare(fullName(y), 'es'))
    : [];
  const v = (x) => esc(x ?? '');
  const fmt = (d) => v(formatDate(d));
  let photoData = p?.photo || '';

  openModal(`
    <div class="m-head"><h2>${esc(title)}</h2>${a && !editing ? `<p>de ${esc(fullName(a))}</p>` : ''}</div>
    <div class="m-body">
      ${existingAllowed ? `
      <div class="seg" role="radiogroup" aria-label="Origen">
        <label><input type="radio" name="src" value="new" checked />Persona nueva</label>
        <label><input type="radio" name="src" value="existing" />Ya está en el árbol</label>
      </div>
      <label class="field" data-src="existing" hidden><span>Selecciona la persona</span>
        <select name="existing"><option value="">— Elegir —</option>${candidates.map((c) => `<option value="${c.id}">${esc(fullName(c))}${lifeYears(c) ? ` (${esc(lifeYears(c))})` : ''}</option>`).join('')}</select>
      </label>` : ''}
      ${mode === 'child' && spouses.length ? `
      <label class="field"><span>Otro progenitor</span>
        <select name="otherParent">
          ${spouses.map((s) => `<option value="${s.id}" ${s.id === defaultOther ? 'selected' : ''}>${esc(fullName(s))}</option>`).join('')}
          <option value="">Desconocido / no registrado</option>
        </select>
      </label>` : ''}
      <div data-src="new" style="display:grid; gap:12px">
        <div class="row2">
          <label class="field"><span>Nombre(s)</span><input type="text" name="givenName" value="${v(p?.givenName)}" autocomplete="off" /></label>
          <label class="field"><span>Apellidos</span><input type="text" name="surname" value="${v(p ? p.surname : suggestSurname(mode, anchor, relSex, defaultOther))}" autocomplete="off" /></label>
        </div>
        <div class="field"><span>Sexo</span>
          <div class="seg">
            <label><input type="radio" name="sex" value="M" ${sexVal === 'M' ? 'checked' : ''} />Hombre</label>
            <label><input type="radio" name="sex" value="F" ${sexVal === 'F' ? 'checked' : ''} />Mujer</label>
            <label><input type="radio" name="sex" value="U" ${!['M', 'F'].includes(sexVal) ? 'checked' : ''} />No consta</label>
          </div>
        </div>
        <fieldset><legend>Nacimiento</legend>
          <div class="row2">
            <label class="field"><span>Fecha</span><input type="text" name="birthDate" value="${fmt(p?.birth.date)}" placeholder="12/03/1950, 1950, c. 1900…" /></label>
            <label class="field"><span>Lugar</span><input type="text" name="birthPlace" value="${v(p?.birth.place)}" placeholder="Ciudad, provincia, país" /></label>
          </div>
        </fieldset>
        <label class="check"><input type="checkbox" name="living" ${p?.deceased ? '' : 'checked'} /> Vive</label>
        <fieldset data-deceased ${p?.deceased ? '' : 'hidden'}><legend>Defunción</legend>
          <div class="row2">
            <label class="field"><span>Fecha</span><input type="text" name="deathDate" value="${fmt(p?.death.date)}" placeholder="dd/mm/aaaa o año" /></label>
            <label class="field"><span>Lugar</span><input type="text" name="deathPlace" value="${v(p?.death.place)}" /></label>
          </div>
        </fieldset>
        ${mode === 'partner' ? `
        <fieldset><legend>Unión / matrimonio (opcional)</legend>
          <div class="row2">
            <label class="field"><span>Fecha</span><input type="text" name="marDate" placeholder="dd/mm/aaaa o año" /></label>
            <label class="field"><span>Lugar</span><input type="text" name="marPlace" /></label>
          </div>
        </fieldset>` : ''}
        <label class="field"><span>Ocupación</span><input type="text" name="occupation" value="${v(p?.occupation)}" /></label>
        <div class="field"><span>Foto</span>
          <div class="photo-field">
            <span id="photo-preview">${photoData ? `<img src="${esc(photoData)}" alt="" />` : '<span class="ph"></span>'}</span>
            <label class="btn small">Elegir foto<input type="file" accept="image/*" name="photoFile" hidden /></label>
            <button class="btn small ghost" type="button" data-remove-photo ${photoData ? '' : 'hidden'}>Quitar</button>
          </div>
        </div>
        <label class="field"><span>Notas e historia</span><textarea name="notes" rows="3">${v(p?.notes)}</textarea></label>
      </div>
      <div class="form-error" role="alert"></div>
    </div>
    <div class="m-foot">
      <button class="btn" value="cancel" formnovalidate>Cancelar</button>
      <button class="btn primary" value="save">Guardar</button>
    </div>`, (fd) => {
    const src = fd.get('src') || 'new';
    const data = {
      givenName: fd.get('givenName')?.trim(),
      surname: fd.get('surname')?.trim(),
      sex: fd.get('sex'),
      birth: { date: normalizeDate(fd.get('birthDate')), place: fd.get('birthPlace')?.trim() },
      deceased: fd.get('living') !== 'on',
      death: { date: normalizeDate(fd.get('deathDate')), place: fd.get('deathPlace')?.trim() },
      occupation: fd.get('occupation')?.trim(),
      photo: photoData,
      notes: fd.get('notes')?.trim(),
    };
    if (!data.deceased) data.death = { date: '', place: '' };
    let who;
    if (src === 'existing') {
      who = fd.get('existing');
      if (!who) throw new Error('Elige una persona de la lista');
    } else {
      if (!data.givenName && !data.surname) throw new Error('Escribe al menos el nombre o los apellidos');
      who = data;
    }
    let newId;
    switch (mode) {
      case 'first':
      case 'unlinked':
        newId = tree.addPerson(data);
        if (mode === 'first') tree.setRoot(newId);
        break;
      case 'edit':
        tree.updatePerson(anchor, data);
        toast('Cambios guardados');
        return;
      case 'parent':
        newId = tree.addParent(anchor, who);
        break;
      case 'partner':
        newId = tree.addPartner(anchor, who, { date: normalizeDate(fd.get('marDate')), place: fd.get('marPlace')?.trim() });
        break;
      case 'child': {
        const other = fd.get('otherParent');
        newId = tree.addChild(anchor, who, spouses.length ? other || null : undefined);
        break;
      }
      case 'sibling':
        newId = tree.addSibling(anchor, who);
        break;
    }
    const added = tree.get(newId);
    toast(`${fullName(added)} añadido/a al árbol`);
    if (mode === 'first' || mode === 'unlinked') focusPerson(newId);
    else renderTree({ center: true });
  });

  // comportamiento dinámico del formulario
  const toggleSrc = () => {
    const src = form.querySelector('input[name=src]:checked')?.value || 'new';
    $$('[data-src]', form).forEach((n) => (n.hidden = n.dataset.src !== src));
    const ns = form.querySelector('[data-src=new]');
    if (ns) ns.style.display = src === 'new' ? 'grid' : 'none';
  };
  $$('input[name=src]', form).forEach((r) => r.addEventListener('change', toggleSrc));
  form.querySelector('input[name=living]').addEventListener('change', (e) => {
    form.querySelector('[data-deceased]').hidden = e.target.checked;
  });
  const other = form.querySelector('select[name=otherParent]');
  const surnameInput = form.querySelector('input[name=surname]');
  if (other) other.addEventListener('change', () => {
    if (!surnameInput.dataset.touched) surnameInput.value = suggestSurname('child', anchor, undefined, other.value);
  });
  surnameInput.addEventListener('input', () => (surnameInput.dataset.touched = '1'));
  const fileInput = form.querySelector('input[name=photoFile]');
  const removeBtn = form.querySelector('[data-remove-photo]');
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    if (!f) return;
    try {
      photoData = await resizeImage(f, 256);
      $('#photo-preview').innerHTML = `<img src="${photoData}" alt="" />`;
      removeBtn.hidden = false;
    } catch {
      toast('No se pudo leer la imagen');
    }
  });
  removeBtn.addEventListener('click', () => {
    photoData = '';
    $('#photo-preview').innerHTML = '<span class="ph"></span>';
    removeBtn.hidden = true;
  });
}

function openUnionForm(famId) {
  const f = tree.families[famId];
  if (!f) return;
  const names = f.partners.map((id) => fullName(tree.get(id))).join(' y ');
  openModal(`
    <div class="m-head"><h2>Unión</h2><p>${esc(names)}</p></div>
    <div class="m-body">
      <div class="row2">
        <label class="field"><span>Fecha</span><input type="text" name="date" value="${esc(formatDate(f.marriage.date))}" placeholder="dd/mm/aaaa o año" /></label>
        <label class="field"><span>Lugar</span><input type="text" name="place" value="${esc(f.marriage.place)}" /></label>
      </div>
    </div>
    <div class="m-foot">
      ${f.partners.length === 2 ? '<button class="btn danger" value="unlink" style="margin-right:auto">Deshacer pareja</button>' : ''}
      <button class="btn" value="cancel">Cancelar</button>
      <button class="btn primary" value="save">Guardar</button>
    </div>`, (fd, value) => {
    if (value === 'unlink') {
      tree.unlinkPartner(f.partners[0], f.partners[1]);
      return toast('Pareja desvinculada');
    }
    tree.updateFamily(famId, { date: normalizeDate(fd.get('date')), place: fd.get('place')?.trim() });
  });
}

function resizeImage(file, max) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      // recorte cuadrado centrado, reducido a max×max
      const side = Math.min(img.width, img.height);
      const c = document.createElement('canvas');
      c.width = c.height = Math.min(max, side);
      c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')); };
    img.src = url;
  });
}

// ---------------- búsqueda ----------------
const searchInput = $('#search');
const searchBox = $('#search-results');
searchInput.addEventListener('input', () => {
  const res = tree.search(searchInput.value, 12);
  if (!searchInput.value.trim()) return (searchBox.hidden = true);
  searchBox.innerHTML = res.length ? res.map((p) => chipHTML(p, [lifeYears(p), p.birth.place].filter(Boolean).join(' · '))).join('') : '<div class="empty-rel">Sin resultados</div>';
  searchBox.hidden = false;
});
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') searchBox.querySelector('[data-goto]')?.click();
  if (e.key === 'Escape') { searchInput.value = ''; searchBox.hidden = true; }
});
searchBox.addEventListener('click', (e) => {
  const go = e.target.closest('[data-goto]');
  if (!go) return;
  searchBox.hidden = true;
  searchInput.value = '';
  searchInput.blur();
  focusPerson(go.dataset.goto);
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search')) searchBox.hidden = true;
  if (!e.target.closest('.menu-wrap')) closeMenu();
});

// ---------------- lista de personas ----------------
$('#people-filter').addEventListener('input', renderPeople);
$('#people-sort').addEventListener('change', renderPeople);
function renderPeople() {
  const q = normalize($('#people-filter').value);
  const sort = $('#people-sort').value;
  let list = tree.all();
  if (q) list = list.filter((p) => normalize(`${p.givenName} ${p.surname} ${p.birth.place} ${p.death.place} ${p.occupation}`).includes(q));
  const cmp = {
    surname: (a, b) => `${a.surname} ${a.givenName}`.localeCompare(`${b.surname} ${b.givenName}`, 'es'),
    given: (a, b) => fullName(a).localeCompare(fullName(b), 'es'),
    birth: byBirth,
  }[sort];
  list.sort(cmp);
  $('#people-count').textContent = `(${list.length}${q ? ` de ${tree.size}` : ''})`;
  $('#people-list').innerHTML = list.map((p) => `
    <button class="person-row" data-goto="${p.id}">
      ${avatarHTML(p)}
      <span><strong>${esc(fullName(p))}</strong><small>${esc([lifeYears(p), p.occupation].filter(Boolean).join(' · '))}</small></span>
      <span class="meta">${esc(p.birth.place)}</span>
    </button>`).join('') || '<p class="muted">No hay personas que coincidan.</p>';
}
$('#people-list').addEventListener('click', (e) => {
  const go = e.target.closest('[data-goto]');
  if (go) focusPerson(go.dataset.goto);
});

// ---------------- parentesco ----------------
function fillRelSelects() {
  const people = tree.all().sort((a, b) => fullName(a).localeCompare(fullName(b), 'es'));
  const opts = people.map((p) => `<option value="${p.id}">${esc(fullName(p))}${lifeYears(p) ? ` (${esc(lifeYears(p))})` : ''}</option>`).join('');
  for (const sel of [$('#rel-a'), $('#rel-b')]) {
    const cur = sel.value;
    sel.innerHTML = opts;
    if (tree.get(cur)) sel.value = cur;
  }
  if (!tree.get($('#rel-a').dataset.init)) {
    $('#rel-a').value = tree.rootId || '';
    $('#rel-a').dataset.init = tree.rootId || '';
    const other = state.focus !== tree.rootId ? state.focus : people.find((p) => p.id !== tree.rootId)?.id;
    if (other) $('#rel-b').value = other;
  }
}

function renderRelation() {
  fillRelSelects();
  const a = $('#rel-a').value;
  const b = $('#rel-b').value;
  const out = $('#rel-result');
  if (tree.size < 2) {
    out.innerHTML = '<p class="muted" style="margin:0">Necesitas al menos dos personas en el árbol.</p>';
    return;
  }
  const r = relationship(tree, a, b);
  const B = tree.get(b);
  out.innerHTML = `
    ${r.kind !== 'none' && r.label !== 'la misma persona' ? `<p class="big">${esc(fullName(B))} es <em>${esc(r.label)}</em></p>` : ''}
    <p style="margin:0">${esc(r.sentence)}</p>
    ${r.path.length > 1 ? `<div class="rel-path">${r.path.map((id) => chipHTML(tree.get(id), '')).join('<span class="arrow">→</span>')}</div>` : ''}
    ${r.commonAncestor && r.commonAncestor !== a && r.commonAncestor !== b ? `<p class="muted" style="margin:12px 0 0">Ancestro común más cercano: ${esc(fullName(tree.get(r.commonAncestor)))}</p>` : ''}`;
}
$('#rel-a').addEventListener('change', renderRelation);
$('#rel-b').addEventListener('change', renderRelation);
$('#rel-swap').addEventListener('click', () => {
  const a = $('#rel-a').value;
  $('#rel-a').value = $('#rel-b').value;
  $('#rel-b').value = a;
  renderRelation();
});
$('#rel-result').addEventListener('click', (e) => {
  const go = e.target.closest('[data-goto]');
  if (go) focusPerson(go.dataset.goto);
});

// ---------------- estadísticas ----------------
function renderStats() {
  const s = tree.stats();
  const bars = (title, rows) => {
    const max = Math.max(1, ...rows.map((r) => r[1]));
    return `<div class="card-box bars"><h3>${title}</h3>${rows.map(([k, n]) => `
      <div class="bar"><span class="label" title="${esc(k)}">${esc(k)}</span><span class="track"><span class="fill" style="width:${(n / max) * 100}%"></span></span><span class="n">${n}</span></div>`).join('') || '<p class="muted">Sin datos todavía</p>'}</div>`;
  };
  $('#stats').innerHTML = `
    <div class="tiles">
      <div class="tile"><div class="v">${s.people}</div><div class="l">Personas</div></div>
      <div class="tile"><div class="v">${s.families}</div><div class="l">Familias</div></div>
      <div class="tile"><div class="v">${s.generations}</div><div class="l">Generaciones</div></div>
      <div class="tile"><div class="v">${s.span ? `${s.span[0]}` : '—'}</div><div class="l">Nacimiento más antiguo</div></div>
      <div class="tile"><div class="v">${s.avgLifespan ?? '—'}</div><div class="l">Esperanza de vida media (años)</div></div>
      <div class="tile"><div class="v">${s.male} / ${s.female}</div><div class="l">Hombres / mujeres</div></div>
    </div>
    <div class="stat-cols">
      ${bars('Apellidos más frecuentes', s.surnames)}
      ${bars('Lugares de nacimiento', s.places)}
      ${bars('Nacimientos por siglo', s.centuries)}
    </div>
    ${s.oldest ? `<p class="muted" style="margin-top:16px">Antepasado/a más antiguo/a registrado/a: <a href="#" data-goto="${s.oldest.id}">${esc(fullName(s.oldest))}</a> (${esc(lifeYears(s.oldest))}).</p>` : ''}`;
}
$('#stats').addEventListener('click', (e) => {
  const go = e.target.closest('[data-goto]');
  if (go) { e.preventDefault(); focusPerson(go.dataset.goto); }
});

// ---------------- menú y acciones globales ----------------
const menuBtn = $('#menu-btn');
const menu = $('#menu');
function closeMenu() { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); }
menuBtn.addEventListener('click', () => {
  menu.hidden = !menu.hidden;
  menuBtn.setAttribute('aria-expanded', String(!menu.hidden));
});

document.addEventListener('click', (e) => {
  const act = e.target.closest('[data-action]');
  if (!act || act.closest('#panel') || act.closest('#modal')) return;
  closeMenu();
  runAction(act.dataset.action);
});

function runAction(action) {
  switch (action) {
    case 'first-person': return openPersonForm({ mode: 'first' });
    case 'add-unlinked': return openPersonForm({ mode: 'unlinked' });
    case 'import-ged': return $('#file-ged').click();
    case 'import-json': return $('#file-json').click();
    case 'export-ged':
      if (!tree.size) return toast('El árbol está vacío');
      download(`arbol-${today()}.ged`, exportGedcom(tree), 'text/plain;charset=utf-8');
      return toast('GEDCOM exportado. Las fotos locales no se incluyen; usa la copia de seguridad para conservarlas.', 5000);
    case 'export-ged-private':
      if (!tree.size) return toast('El árbol está vacío');
      download(`arbol-compartir-${today()}.ged`, exportGedcom(tree, { privateLiving: true }), 'text/plain;charset=utf-8');
      return toast('GEDCOM para compartir exportado: las personas vivas aparecen como «Privado», sin fechas ni lugares.', 5000);
    case 'rename':
      return openRename();
    case 'export-json':
      if (!tree.size) return toast('El árbol está vacío');
      download(`raices-copia-${today()}.json`, JSON.stringify(tree.toJSON()), 'application/json');
      return toast('Copia de seguridad descargada');
    case 'sample':
      return replaceTree('Cargar árbol de ejemplo', () => {
        const s = buildSample();
        tree.load(s.data);
        state.focus = s.rootId;
        state.artBase = s.rootId;
        tree.setRoot(s.rootId); // notifica el cambio: guarda y repinta
        state.panelOpen = false;
        setView('tree');
        renderTree({ center: true });
        setTimeout(fitAll, 50);
      });
    case 'poster':
      return exportPoster();
    case 'print':
      setView('tree');
      fitAll();
      return setTimeout(() => window.print(), 450);
    case 'clear':
      return confirmDialog('Borrar todo el árbol', 'Se eliminarán todas las personas de este dispositivo. Te recomendamos exportar una copia antes.', 'Borrar todo', () => {
        tree.clear();
        state.panelOpen = false;
        save();
      }, true);
  }
}

function replaceTree(title, fn) {
  if (!tree.size) return fn();
  confirmDialog(title, `Esto sustituirá tu árbol actual (${tree.size} personas). Si quieres conservarlo, cancela y exporta antes una copia de seguridad.`, 'Sustituir', fn, true);
}

async function readText(file) {
  const buf = await file.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(buf);
  if (/^1 CHAR (ANSI|WINDOWS|IBMPC|ASCII)/m.test(text) || text.includes('�')) {
    text = new TextDecoder('windows-1252').decode(buf);
  }
  return text;
}

$('#file-ged').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const result = importGedcom(await readText(file));
    const n = Object.keys(result.people).length;
    if (!n) throw new Error('No se encontraron personas en el archivo');
    replaceTree('Importar GEDCOM', () => {
      tree.load(result);
      state.focus = tree.rootId;
      state.artBase = tree.rootId;
      tree.changed();
      state.panelOpen = false;
      setView('tree');
      renderTree({ center: true });
      toast(`Importadas ${n} personas y ${Object.keys(result.families).length} familias${result.warnings.length ? ` (${result.warnings.length} avisos)` : ''}. Usa «Hacer inicio» para elegir tu persona central.`, 6000);
    });
  } catch (err) {
    toast(`Error al importar: ${err.message}`, 5000);
  }
});

$('#file-json').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data.people) throw new Error('No es una copia de Raíces');
    replaceTree('Restaurar copia', () => {
      tree.load(data);
      state.focus = tree.rootId;
      state.artBase = tree.rootId;
      tree.changed();
      setView('tree');
      renderTree({ center: true });
      toast(`Copia restaurada: ${tree.size} personas`);
    });
  } catch (err) {
    toast(`Error al restaurar: ${err.message}`, 5000);
  }
});

$$('.tab').forEach((t) => t.addEventListener('click', () => setView(t.dataset.view)));

// ---------------- póster (PNG) del árbol ilustrado ----------------
async function fontDataURL() {
  try {
    const buf = new Uint8Array(await (await fetch('fonts/patrick-hand-latin.woff2')).arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return `data:font/woff2;base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

async function exportPoster() {
  if (!tree.size) return toast('El árbol está vacío');
  if (prefs.mode !== 'art') setMode('art');
  if (state.view !== 'tree') setView('tree');
  toast('Preparando el póster…');
  const b = lastLayout.bounds;
  const font = await fontDataURL();
  const clone = viewport.cloneNode(true);
  clone.removeAttribute('style');
  clone.removeAttribute('id');
  clone.removeAttribute('class');
  const scale = Math.min(3, 4800 / Math.max(b.w, b.h));
  const svgText = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" width="${Math.round(b.w * scale)}" height="${Math.round(b.h * scale)}">`
    + (font ? `<style>@font-face{font-family:'Patrick Hand';src:url(${font}) format('woff2');}</style>` : '')
    + new XMLSerializer().serializeToString(clone) + '</svg>';
  const name = `arbol-${normalize(tree.displayName()).replace(/[^a-z0-9]+/g, '-')}-${today()}`;
  const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });
  try {
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.src = url;
    await img.decode();
    await new Promise((r) => setTimeout(r, 120)); // da tiempo a la fuente incrustada
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(b.w * scale);
    canvas.height = Math.round(b.h * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const png = await new Promise((res, rej) => canvas.toBlob((x) => (x ? res(x) : rej(new Error('png'))), 'image/png'));
    const file = new File([png], `${name}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
      await navigator.share({ files: [file], title: tree.displayName() });
    } else {
      download(file.name, png, 'image/png');
    }
    toast('Póster listo para imprimir o compartir');
  } catch (err) {
    if (err?.name === 'AbortError') return;
    download(`${name}.svg`, svgText, 'image/svg+xml');
    toast('Se ha descargado el póster en formato SVG (algunas fotos de internet impiden crear el PNG).', 5000);
  }
}

// ---------------- cabecera, bienvenida y primeros pasos ----------------
const onboarding = createOnboarding({
  root: $('#onboarding'),
  tree,
  onImport: () => $('#file-ged').click(),
  onSample: () => runAction('sample'),
  onFinish: ({ rootId, name, count }) => {
    state.focus = rootId;
    state.artBase = rootId;
    state.panelOpen = false;
    setView('tree');
    renderTree({ center: true });
    setTimeout(fitAll, 30);
    showWelcome(name, count);
  },
});

function syncChrome() {
  const empty = tree.size === 0;
  if (empty) onboarding.show();
  else onboarding.hide();
  $('#tree-name').textContent = tree.displayName();
  $('#tree-count').textContent = empty ? '' : `${tree.size} ${tree.size === 1 ? 'persona' : 'personas'}`;
}

function showWelcome(name, count) {
  $('#welcome-title').textContent = `¡Hola, ${name}!`;
  $('#welcome-text').textContent = `Tu árbol ya tiene ${count} ${count === 1 ? 'persona' : 'personas'}. Toca el botón + bajo cualquier tarjeta para seguir añadiendo familiares, y abre una ficha para poner fotos, fechas e historias.`;
  $('#welcome-illus').innerHTML = ['M', 'F', 'U', 'F', 'M'].map((sx) => silhouetteSVG(sx)).join('');
  $('#welcome').hidden = false;
}
$('#welcome-close').addEventListener('click', () => ($('#welcome').hidden = true));
svg.addEventListener('pointerdown', () => ($('#welcome').hidden = true));

function openRename() {
  openModal(`
    <div class="m-head"><h2>Nombre del árbol</h2><p>Déjalo vacío para usar «Familia + apellidos» de la persona de inicio.</p></div>
    <div class="m-body"><label class="field"><span>Nombre</span><input type="text" name="name" value="${esc(tree.name)}" placeholder="${esc(tree.displayName())}" /></label></div>
    <div class="m-foot"><button class="btn" value="cancel">Cancelar</button><button class="btn primary" value="save">Guardar</button></div>`,
  (fd) => tree.rename(fd.get('name')));
}
$('#tree-title').addEventListener('click', () => tree.size && openRename());

$('#search-toggle').addEventListener('click', () => {
  document.body.classList.toggle('search-open');
  if (document.body.classList.contains('search-open')) $('#search').focus();
});
$('#search').addEventListener('blur', () => setTimeout(() => !$('#search').value && document.body.classList.remove('search-open'), 200));

// ---------------- arranque ----------------
setView(tree.size ? 'home' : 'tree');
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Exponer para depuración desde la consola
window.raices = { tree, state };
