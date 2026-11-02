// Primeros pasos: elegir cómo empezar → 2 pantallas de introducción →
// asistente guiado (tú, tus padres y tus abuelos). Nada se guarda hasta el final.

import { silhouetteSVG } from './avatars.js';
import { normalizeDate } from './dates.js';

const STEPS = [
  { key: 'me', title: 'Tú', sex: null },
  { key: 'mother', title: 'Tu madre', sex: 'F', parentOf: 'me' },
  { key: 'father', title: 'Tu padre', sex: 'M', parentOf: 'me' },
  { key: 'mgm', title: 'Tu abuela materna', sex: 'F', parentOf: 'mother' },
  { key: 'mgf', title: 'Tu abuelo materno', sex: 'M', parentOf: 'mother' },
  { key: 'pgm', title: 'Tu abuela paterna', sex: 'F', parentOf: 'father' },
  { key: 'pgf', title: 'Tu abuelo paterno', sex: 'M', parentOf: 'father' },
];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const filled = (d) => Boolean(d && (d.givenName || d.surname));

/** Apellido sugerido: el padre aporta el 1.º apellido y la madre el 2.º (costumbre hispana). */
export function suggestParentSurname(childSurname, parentSex) {
  const parts = (childSurname || '').trim().split(/\s+/).filter(Boolean);
  if (parentSex === 'M') return parts[0] || '';
  if (parentSex === 'F') return parts[1] || '';
  return '';
}

/** Pasos visibles según lo ya rellenado (los abuelos solo si existe ese progenitor). */
export function activeSteps(data) {
  return STEPS.filter((s) => !s.parentOf || s.parentOf === 'me' || filled(data[s.parentOf]));
}

/** Crea las personas del asistente en el árbol. Devuelve el id de "tú". */
export function commitWizard(tree, data) {
  const toPerson = (d, sex) => ({
    givenName: d.givenName,
    surname: d.surname,
    sex: sex || d.sex || 'U',
    birth: { date: normalizeDate(d.birth), place: (d.place || '').trim() },
    deceased: d.living === false,
  });
  const ids = { me: tree.addPerson(toPerson(data.me)) };
  tree.setRoot(ids.me);
  for (const s of STEPS.slice(1)) {
    const d = data[s.key];
    if (!filled(d) || !ids[s.parentOf]) continue;
    ids[s.key] = tree.addParent(ids[s.parentOf], toPerson(d, s.sex));
  }
  return ids.me;
}

function miniTree() {
  const a = (sex, x, y, r = 22) => `<g transform="translate(${x - r},${y - r})"><svg width="${r * 2}" height="${r * 2}" viewBox="0 0 100 100" class="sil sex-${sex}"><clipPath id="c${x}${y}"><circle cx="50" cy="50" r="50"/></clipPath><g clip-path="url(#c${x}${y})">${silhouetteSVG(sex).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g></svg></g>`;
  return `<svg viewBox="0 0 300 190" class="ob-illus" aria-hidden="true">
    <path class="ob-line" d="M45 40H95M70 40V70H110V125M205 40H255M230 40V70H190V125M110 100H190M150 100V130" fill="none"/>
    ${a('F', 45, 32)}${a('M', 95, 32)}${a('F', 205, 32)}${a('M', 255, 32)}
    ${a('F', 110, 100, 25)}${a('M', 190, 100, 25)}
    <circle cx="150" cy="158" r="26" class="ob-you"/>
    <text x="150" y="163" text-anchor="middle" class="ob-you-t">Tú</text>
  </svg>`;
}

function cardIllus() {
  return `<svg viewBox="0 0 300 190" class="ob-illus" aria-hidden="true">
    <circle cx="150" cy="100" r="80" class="ob-blob"/>
    <rect x="95" y="20" width="110" height="150" rx="12" class="ob-card"/>
    <g transform="translate(126,34)"><svg width="48" height="48" viewBox="0 0 100 100" class="sil sex-F"><clipPath id="cc"><circle cx="50" cy="50" r="50"/></clipPath><g clip-path="url(#cc)">${silhouetteSVG('F').replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g></svg></g>
    <rect x="113" y="96" width="60" height="8" rx="4" class="ob-bar"/>
    <rect x="113" y="112" width="74" height="8" rx="4" class="ob-bar"/>
    <rect x="113" y="128" width="50" height="8" rx="4" class="ob-bar"/>
    <rect x="113" y="144" width="66" height="8" rx="4" class="ob-bar ob-bar-empty"/>
  </svg>`;
}

export function createOnboarding({ root, tree, onFinish, onImport, onSample }) {
  let st;
  const reset = () => (st = { screen: 'choose', choice: 'create', slide: 0, step: 0, data: {} });
  reset();

  function show() {
    if (!root.hidden) return;
    reset();
    root.hidden = false;
    render();
  }

  function hide() {
    root.hidden = true;
  }

  function render() {
    if (st.screen === 'choose') return renderChoose();
    if (st.screen === 'intro') return renderIntro();
    return renderStep();
  }

  function renderChoose() {
    const opt = (v, icon, title, text) => `
      <label class="ob-opt ${st.choice === v ? 'selected' : ''}">
        <input type="radio" name="ob-choice" value="${v}" ${st.choice === v ? 'checked' : ''} />
        <span class="ob-ico ob-ico-${v}"><svg><use href="#${icon}"/></svg></span>
        <span><strong>${title}</strong><small>${text}</small></span>
      </label>`;
    root.innerHTML = `
      <div class="ob-screen">
        <div class="ob-top"><svg class="ob-logo" viewBox="0 0 48 48"><use href="#logo"/></svg></div>
        <h1>¿Cómo quieres empezar?</h1>
        <p class="ob-lead">Elige una opción; podrás cambiar o ampliar todo después.</p>
        <div class="ob-opts" role="radiogroup">
          ${opt('create', 'i-tree', 'Crear mi árbol', 'Empieza por ti y añade a tus padres y abuelos en un par de minutos.')}
          ${opt('import', 'i-upload', 'Importar un archivo GEDCOM', 'Trae tu árbol desde MyHeritage, Ancestry, FamilySearch u otra aplicación.')}
          ${opt('sample', 'i-people', 'Ver un árbol de ejemplo', 'Explora cómo funciona con una familia ficticia.')}
        </div>
        <p class="ob-note"><svg><use href="#i-lock"/></svg>Tus datos se guardan solo en este dispositivo.</p>
        <button class="btn primary ob-cta" data-ob="continue">Continuar</button>
      </div>`;
  }

  function renderIntro() {
    const slides = [
      {
        illus: miniTree(),
        title: 'Empieza por ti, tus padres y tus abuelos',
        body: `<div class="ob-private"><svg><use href="#i-lock"/></svg><span>Tu árbol es <strong>privado</strong>: se guarda en este dispositivo y nadie más puede verlo, salvo que tú exportes y compartas el archivo.</span></div>`,
      },
      {
        illus: cardIllus(),
        title: 'Escribe lo que sepas y deja en blanco lo que no',
        body: '<p class="ob-lead">Podrás <strong>añadir, corregir o borrar</strong> datos de cualquier familiar cuando quieras.</p>',
      },
    ];
    const s = slides[st.slide];
    root.innerHTML = `
      <div class="ob-screen">
        <div class="ob-top"><button class="ob-link" data-ob="back">‹ Atrás</button><button class="ob-link" data-ob="skip-intro">Saltar</button></div>
        <div class="ob-illus-wrap">${s.illus}</div>
        <h1>${s.title}</h1>
        ${s.body}
        <div class="ob-dots">${slides.map((_, i) => `<span class="${i === st.slide ? 'on' : ''}"></span>`).join('')}</div>
        <button class="btn primary ob-cta" data-ob="next-slide">Continuar</button>
      </div>`;
  }

  function stepDefaults(step) {
    if (step.key === 'me') return { givenName: '', surname: '', sex: 'U', birth: '', place: '', living: true };
    const child = st.data[step.parentOf];
    const isGrand = step.parentOf !== 'me';
    return { givenName: '', surname: suggestParentSurname(child?.surname, step.sex), birth: '', place: '', living: !isGrand };
  }

  function renderStep() {
    const steps = activeSteps(st.data);
    const step = steps[st.step];
    const d = st.data[step.key] || stepDefaults(step);
    const isMe = step.key === 'me';
    const last = st.step === steps.length - 1;
    const sex = isMe ? d.sex : step.sex;
    const vive = sex === 'F' ? 'Está viva' : sex === 'M' ? 'Está vivo' : 'Vive';
    root.innerHTML = `
      <form class="ob-screen ob-form" novalidate>
        <div class="ob-top">
          <button type="button" class="ob-link" data-ob="back">‹ Atrás</button>
          <div class="ob-progress" aria-label="Paso ${st.step + 1} de ${steps.length}">
            ${steps.map((s, i) => `<span class="${i < st.step ? 'done' : i === st.step ? 'on' : ''}"></span>`).join('')}
          </div>
          <span style="width:56px"></span>
        </div>
        <div class="ob-who">${silhouetteSVG(sex, 'ob-avatar')}<h2>${step.title}</h2></div>
        <p class="ob-lead">${isMe ? 'Empecemos por ti. Escribe al menos tu nombre.' : 'Escribe todo lo que sepas. Si no lo sabes, puedes omitirlo.'}</p>
        <label class="ob-field"><input name="givenName" value="${esc(d.givenName)}" placeholder="Nombre(s)" autocomplete="${isMe ? 'given-name' : 'off'}" /></label>
        <label class="ob-field"><input name="surname" value="${esc(d.surname)}" placeholder="Apellidos" autocomplete="${isMe ? 'family-name' : 'off'}" /></label>
        ${isMe ? `
        <div class="seg ob-seg" role="radiogroup" aria-label="Sexo">
          <label><input type="radio" name="sex" value="M" ${d.sex === 'M' ? 'checked' : ''}/>Hombre</label>
          <label><input type="radio" name="sex" value="F" ${d.sex === 'F' ? 'checked' : ''}/>Mujer</label>
          <label><input type="radio" name="sex" value="U" ${!['M', 'F'].includes(d.sex) ? 'checked' : ''}/>Prefiero no decirlo</label>
        </div>` : ''}
        <label class="ob-field"><input name="birth" value="${esc(d.birth)}" placeholder="Año de nacimiento" inputmode="text" /><small>O la fecha completa, si la sabes (12/03/1950, c. 1900…)</small></label>
        <label class="ob-field"><input name="place" value="${esc(d.place)}" placeholder="Lugar de nacimiento" /><small>Ciudad, país</small></label>
        ${isMe ? '' : `<label class="ob-check"><input type="checkbox" name="living" ${d.living ? 'checked' : ''}/><span>${vive}</span></label>`}
        <div class="ob-error" role="alert"></div>
        <button class="btn primary ob-cta" data-ob="next-step">${last ? 'Crear mi árbol' : 'Siguiente'}</button>
        ${isMe ? '' : `<button type="button" class="btn ghost" data-ob="skip-step">No lo sé, omitir</button>`}
      </form>`;
    const first = root.querySelector('input[name=givenName]');
    if (window.innerWidth > 820) first.focus();
    root.querySelectorAll('input[name=sex]').forEach((r) => r.addEventListener('change', () => {
      const svg = root.querySelector('.ob-avatar');
      svg.outerHTML = silhouetteSVG(r.value, 'ob-avatar');
    }));
  }

  function readStep() {
    const f = root.querySelector('form');
    const fd = new FormData(f);
    return {
      givenName: (fd.get('givenName') || '').trim(),
      surname: (fd.get('surname') || '').trim(),
      sex: fd.get('sex') || 'U',
      birth: (fd.get('birth') || '').trim(),
      place: (fd.get('place') || '').trim(),
      living: f.querySelector('input[name=living]') ? fd.get('living') === 'on' : true,
    };
  }

  function advance(skip) {
    const steps = activeSteps(st.data);
    const step = steps[st.step];
    if (skip) st.data[step.key] = null;
    else {
      const d = readStep();
      if (step.key === 'me' && !d.givenName) {
        root.querySelector('.ob-error').textContent = 'Escribe al menos tu nombre para empezar.';
        return;
      }
      st.data[step.key] = filled(d) ? d : null;
    }
    const next = activeSteps(st.data);
    if (st.step + 1 < next.length) {
      st.step += 1;
      renderStep();
      root.scrollTop = 0;
    } else {
      finish();
    }
  }

  function finish() {
    const me = st.data.me;
    const rootId = commitWizard(tree, st.data);
    hide();
    onFinish({ rootId, name: me.givenName, count: tree.size });
  }

  root.addEventListener('change', (e) => {
    if (e.target.name === 'ob-choice') {
      st.choice = e.target.value;
      root.querySelectorAll('.ob-opt').forEach((o) => o.classList.toggle('selected', o.querySelector('input').checked));
    }
  });

  root.addEventListener('submit', (e) => {
    e.preventDefault();
    advance(false);
  });

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ob]');
    if (!b) return;
    e.preventDefault();
    switch (b.dataset.ob) {
      case 'continue':
        if (st.choice === 'import') return onImport();
        if (st.choice === 'sample') return onSample();
        st.screen = 'intro';
        st.slide = 0;
        return render();
      case 'next-slide':
        if (st.slide < 1) st.slide += 1;
        else st.screen = 'wizard';
        return render();
      case 'skip-intro':
        st.screen = 'wizard';
        return render();
      case 'back':
        if (st.screen === 'intro') {
          if (st.slide > 0) st.slide -= 1;
          else st.screen = 'choose';
        } else if (st.screen === 'wizard') {
          // guarda lo escrito antes de retroceder
          const steps = activeSteps(st.data);
          const d = readStep();
          if (filled(d)) st.data[steps[st.step].key] = d;
          if (st.step > 0) st.step -= 1;
          else { st.screen = 'intro'; st.slide = 1; }
        }
        return render();
      case 'next-step':
        return advance(false);
      case 'skip-step':
        return advance(true);
    }
  });

  return { show, hide, get active() { return !root.hidden; } };
}
