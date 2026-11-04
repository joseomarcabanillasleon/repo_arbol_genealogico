// Pantalla del familiar que recibe la invitación (p. ej. la abuela en su móvil).
// No toca el árbol local: solo recoge respuestas y crea un enlace de vuelta.

import { silhouetteSVG } from './avatars.js';
import { formatDate } from './dates.js';
import { SLOTS, slotLabel, encodePayload, linkFor } from './share.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const SLOT_SEX = { f: 'M', m: 'F', ff: 'M', fm: 'F', mf: 'M', mm: 'F' };
const PARENT_OF = { ff: 'f', fm: 'f', mf: 'm', mm: 'm' };
const MAX_URL = 60000; // por encima, WhatsApp y otros pueden cortar el enlace

export function startHelper({ root, invite, baseUrl, resizeImage, onClose }) {
  const a = invite.a;
  const aName = a.g.split(/\s+/)[0] || a.g;
  const st = { step: 0, by: '', anchor: { b: formatDate(a.b), bp: a.bp, n: '' }, p: {}, story: '' };
  // valores iniciales de cada hueco: lo que ya se sabe
  for (const s of SLOTS) {
    const k = invite.k?.[s];
    st.p[s] = k ? { known: true, g: k.g, s: k.s, b: formatDate(k.b), bp: k.bp, living: !k.dec, ph: '' } : { known: false, g: '', s: '', b: '', bp: '', living: s.length === 1, ph: '' };
  }

  const filled = (s) => st.p[s].known || st.p[s].g || st.p[s].s;
  const steps = () => ['hello', 'anchor', 'f', 'm', ...['ff', 'fm'].filter(() => filled('f')), ...['mf', 'mm'].filter(() => filled('m')), 'story', 'send'];

  root.hidden = false;
  render();

  function dots() {
    const list = steps();
    return `<div class="ob-progress">${list.slice(0, -1).map((_, i) => `<span class="${i < st.step ? 'done' : i === st.step ? 'on' : ''}"></span>`).join('')}</div>`;
  }

  function personFields(slot) {
    const d = st.p[slot];
    const sex = SLOT_SEX[slot];
    const vive = sex === 'F' ? 'Está viva' : 'Está vivo';
    return `
      <div class="ob-who">${d.ph ? `<img class="ob-avatar sil" src="${d.ph}" alt="">` : silhouetteSVG(sex, 'ob-avatar')}<h2>${esc(slotLabel(slot, aName))}</h2></div>
      <p class="ob-lead">${d.known ? 'Esto es lo que ya sabemos. Completa o corrige lo que puedas.' : 'Escribe lo que sepas. Si no lo sabes, pulsa «No lo sé».'}</p>
      <label class="ob-field"><input name="g" value="${esc(d.g)}" placeholder="Nombre(s)" ${d.known ? 'readonly' : ''}/></label>
      <label class="ob-field"><input name="s" value="${esc(d.s)}" placeholder="Apellidos" ${d.known ? 'readonly' : ''}/></label>
      <label class="ob-field"><input name="b" value="${esc(d.b)}" placeholder="Año o fecha de nacimiento"/><small>Por ejemplo: 1946, 12/03/1946 o «hacia 1940»</small></label>
      <label class="ob-field"><input name="bp" value="${esc(d.bp)}" placeholder="Lugar de nacimiento"/><small>Pueblo o ciudad, y país</small></label>
      <label class="ob-check"><input type="checkbox" name="living" ${d.living ? 'checked' : ''}/><span>${vive}</span></label>
      <div class="ob-photo"><label class="btn small">${d.ph ? 'Cambiar foto' : 'Añadir una foto (opcional)'}<input type="file" accept="image/*" name="ph" hidden></label></div>`;
  }

  function render() {
    const step = steps()[st.step];
    let body = '';
    if (step === 'hello') {
      body = `
        <div class="ob-top"><svg class="ob-logo" viewBox="0 0 48 48"><use href="#logo"/></svg></div>
        <h1>¡Hola! 👋</h1>
        <p class="ob-lead"><strong>${esc(invite.from || 'Un familiar')}</strong> está haciendo el árbol de la <strong>${esc(invite.fam)}</strong> y te pide ayuda con la familia de <strong>${esc(a.g)} ${esc(a.s)}</strong>.</p>
        <div class="ob-private"><svg><use href="#i-lock"/></svg><span>No necesitas cuenta ni instalar nada. Tus respuestas no se guardan en ningún servidor: al final se crea un enlace que tú misma/o envías a ${esc(invite.from || 'quien te lo pidió')}.</span></div>
        <label class="ob-field"><input name="by" value="${esc(st.by)}" placeholder="¿Cómo te llamas?" autocomplete="given-name"/></label>
        <div class="ob-error" role="alert"></div>
        <button class="btn primary ob-cta" data-h="next">Empezar</button>`;
    } else if (step === 'anchor') {
      body = `
        <div class="ob-top"><button type="button" class="ob-link" data-h="back">‹ Atrás</button>${dots()}<span style="width:56px"></span></div>
        <div class="ob-who">${silhouetteSVG(a.x, 'ob-avatar')}<h2>${esc(a.g)} ${esc(a.s)}</h2></div>
        <p class="ob-lead">Empecemos por ${esc(aName)}. ¿Sabes cuándo y dónde nació?</p>
        <label class="ob-field"><input name="b" value="${esc(st.anchor.b)}" placeholder="Año o fecha de nacimiento"/></label>
        <label class="ob-field"><input name="bp" value="${esc(st.anchor.bp)}" placeholder="Lugar de nacimiento"/></label>
        <button class="btn primary ob-cta" data-h="next">Siguiente</button>`;
    } else if (SLOTS.includes(step)) {
      body = `
        <div class="ob-top"><button type="button" class="ob-link" data-h="back">‹ Atrás</button>${dots()}<span style="width:56px"></span></div>
        ${personFields(step)}
        <button class="btn primary ob-cta" data-h="next">Siguiente</button>
        ${st.p[step].known ? '' : '<button type="button" class="btn ghost" data-h="skip">No lo sé</button>'}`;
    } else if (step === 'story') {
      body = `
        <div class="ob-top"><button type="button" class="ob-link" data-h="back">‹ Atrás</button>${dots()}<span style="width:56px"></span></div>
        <h1>¿Un recuerdo?</h1>
        <p class="ob-lead">Cuéntanos algo de la familia de ${esc(aName)}: de dónde venían, a qué se dedicaban, una anécdota… Se guardará en el árbol con tu nombre.</p>
        <label class="ob-field"><textarea name="story" rows="6" placeholder="Escribe aquí (opcional)">${esc(st.story)}</textarea></label>
        <button class="btn primary ob-cta" data-h="next">Terminar</button>`;
    } else {
      body = `
        <div class="ob-top"><svg class="ob-logo" viewBox="0 0 48 48"><use href="#logo"/></svg></div>
        <h1>¡Gracias${st.by ? ', ' + esc(st.by.split(/\s+/)[0]) : ''}! 💚</h1>
        <p class="ob-lead">Último paso: envía tus respuestas a <strong>${esc(invite.from || 'quien te lo pidió')}</strong>. Se mandan como un enlace.</p>
        <div id="h-status" class="muted">Preparando el enlace…</div>
        <button class="btn primary ob-cta" data-h="whatsapp" disabled>Enviar por WhatsApp</button>
        <button class="btn" data-h="share" disabled>Compartir de otra forma…</button>
        <button class="btn ghost" data-h="copy" disabled>Copiar enlace</button>`;
    }
    root.innerHTML = `<form class="ob-screen ob-form" novalidate>${body}</form>`;
    if (step === 'send') buildReply();
    const photo = root.querySelector('input[name=ph]');
    if (photo) photo.addEventListener('change', async () => {
      const f = photo.files[0];
      if (!f) return;
      read();
      try {
        st.p[step].ph = await resizeImage(f, 140, 0.7);
      } catch { /* imagen no válida */ }
      render();
    });
  }

  let replyUrl = '';
  async function buildReply() {
    const reply = { v: 1, t: 'reply', by: st.by, fam: invite.fam, a: { id: a.id, b: st.anchor.b, bp: st.anchor.bp }, p: {} };
    if (st.story.trim()) reply.a.n = st.story.trim();
    for (const s of SLOTS) {
      const d = st.p[s];
      if (!d.known && !d.g && !d.s) continue;
      reply.p[s] = { id: invite.k?.[s]?.id, g: d.g, s: d.s, b: d.b, bp: d.bp, dec: d.living ? 0 : 1, ph: d.ph || undefined };
    }
    replyUrl = linkFor(baseUrl, 'respuesta', await encodePayload(reply));
    let note = '';
    if (replyUrl.length > MAX_URL) {
      for (const s of Object.keys(reply.p)) delete reply.p[s].ph;
      replyUrl = linkFor(baseUrl, 'respuesta', await encodePayload(reply));
      note = ' Las fotos ocupan demasiado para un enlace: envíalas aparte por WhatsApp.';
    }
    root.querySelector('#h-status').textContent = `Enlace listo.${note}`;
    root.querySelectorAll('[data-h=whatsapp],[data-h=share],[data-h=copy]').forEach((b) => (b.disabled = false));
    if (!navigator.share) root.querySelector('[data-h=share]').hidden = true;
  }

  function read() {
    const f = root.querySelector('form');
    const v = (n) => (f.querySelector(`[name=${n}]`)?.value || '').trim();
    const step = steps()[st.step];
    if (step === 'hello') st.by = v('by');
    if (step === 'anchor') Object.assign(st.anchor, { b: v('b'), bp: v('bp') });
    if (step === 'story') st.story = f.querySelector('[name=story]').value;
    if (SLOTS.includes(step)) {
      const d = st.p[step];
      if (!d.known) Object.assign(d, { g: v('g'), s: v('s') });
      Object.assign(d, { b: v('b'), bp: v('bp'), living: f.querySelector('[name=living]').checked });
    }
  }

  const message = () => `${st.by ? st.by + ' te' : 'Te'} envía datos para el árbol de la ${invite.fam}. Ábrelo en Raíces: ${replyUrl}`;

  root.onsubmit = (e) => e.preventDefault();
  root.onclick = async (e) => {
    const b = e.target.closest('[data-h]');
    if (!b) return;
    e.preventDefault();
    const act = b.dataset.h;
    if (act === 'next') {
      read();
      if (steps()[st.step] === 'hello' && !st.by) {
        root.querySelector('.ob-error').textContent = 'Escribe tu nombre para que sepan quién ayuda.';
        return;
      }
      st.step = Math.min(st.step + 1, steps().length - 1);
      render();
      root.scrollTop = 0;
    } else if (act === 'skip') {
      const s = steps()[st.step];
      Object.assign(st.p[s], { g: '', s: '', b: '', bp: '', ph: '' });
      st.step += 1;
      render();
    } else if (act === 'back') {
      read();
      st.step = Math.max(0, st.step - 1);
      render();
    } else if (act === 'whatsapp') {
      window.location.href = `https://wa.me/?text=${encodeURIComponent(message())}`;
    } else if (act === 'share') {
      try { await navigator.share({ text: message() }); } catch { /* cancelado */ }
    } else if (act === 'copy') {
      try {
        await navigator.clipboard.writeText(replyUrl);
        b.textContent = '¡Copiado!';
      } catch {
        window.prompt('Copia este enlace:', replyUrl);
      }
    }
  };
  return { close: () => { root.hidden = true; onClose?.(); } };
}

export { PARENT_OF };
