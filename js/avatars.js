// Siluetas de avatar propias (viewBox 0 0 100 100) para personas sin foto.

const HEAD = '<circle class="sil-fg" cx="50" cy="42" r="16"/>';
const BODY = '<path class="sil-fg" d="M18 100c1-20 14-32 32-32s31 12 32 32z"/>';
const HAIR_F = '<path class="sil-hair" d="M31 50c-2-20 6-31 19-31s21 11 19 31c-1 9 2 15 6 19-9 2-17-1-21-6h-8c-4 5-12 8-21 6 4-4 7-10 6-19z"/>';
const HAIR_M = '<path class="sil-hair" d="M34 40c0-12 7-19 16-19s17 7 16 19c-3-6-9-9-16-9s-13 3-16 9z"/>';

/** Contenido SVG (sin la etiqueta <svg>) de la silueta según sexo. */
export function silhouetteInner(sex) {
  const hair = sex === 'F' ? HAIR_F : sex === 'M' ? HAIR_M : '';
  // el pelo largo va detrás de la cabeza; el corto, encima
  return `<rect class="sil-bg" width="100" height="100"/>${sex === 'F' ? hair : ''}${BODY}${HEAD}${sex === 'M' ? hair : ''}`;
}

/** Silueta completa como <svg> para usar en HTML. */
export function silhouetteSVG(sex, cls = '') {
  return `<svg class="sil sex-${sex} ${cls}" viewBox="0 0 100 100" aria-hidden="true">${silhouetteInner(sex)}</svg>`;
}

// Colores fijos (sin CSS) para el árbol ilustrado y el póster exportado
const INLINE = {
  M: { bg: '#e3edf8', fg: '#9dbbe0', hair: '#4f6f96' },
  F: { bg: '#f9e6ed', fg: '#e7a9bf', hair: '#8a4a62' },
  U: { bg: '#eeeeea', fg: '#c3c3bc', hair: '#77776f' },
};

export function silhouetteInline(sex) {
  const c = INLINE[sex] || INLINE.U;
  return silhouetteInner(sex)
    .replace('class="sil-bg"', `fill="${c.bg}"`)
    .replaceAll('class="sil-fg"', `fill="${c.fg}"`)
    .replace('class="sil-hair"', `fill="${c.hair}"`);
}
