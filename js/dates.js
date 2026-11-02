// Fechas genealógicas: se guardan en formato GEDCOM ("12 MAR 1950", "ABT 1900")
// y se muestran en español ("12 mar 1950", "c. 1900").

export const MONTHS_GED = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const ES_FULL = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

function monthIndex(word) {
  const w = word.toLowerCase().replace(/\.$/, '');
  if (ES_FULL[w]) return ES_FULL[w];
  const p = w.slice(0, 3);
  let i = MONTHS_ES.indexOf(p);
  if (i >= 0) return i + 1;
  i = MONTHS_GED.indexOf(p.toUpperCase());
  return i >= 0 ? i + 1 : 0;
}

function ged(d, m, y) {
  const parts = [];
  if (d) parts.push(String(d));
  if (m) parts.push(MONTHS_GED[m - 1]);
  parts.push(String(y));
  return parts.join(' ');
}

function parseCore(s) {
  s = s.trim();
  let m;
  const valid = (d, mo) => (!d || (d >= 1 && d <= 31)) && (!mo || (mo >= 1 && mo <= 12));
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    return valid(d, mo) ? ged(d, mo, y) : null;
  }
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) {
    const [d, mo, y] = [+m[1], +m[2], +m[3]];
    return valid(d, mo) ? ged(d, mo, y) : null;
  }
  if ((m = s.match(/^(\d{1,2})[/.-](\d{4})$/))) {
    return valid(0, +m[1]) ? ged(0, +m[1], +m[2]) : null;
  }
  if ((m = s.match(/^(\d{3,4})$/))) return m[1];
  if ((m = s.match(/^(\d{1,2})\s+(?:de\s+)?([a-záéíóú]+)\.?\s+(?:de\s+|del\s+)?(\d{3,4})$/i))) {
    const mo = monthIndex(m[2]);
    return mo && valid(+m[1], mo) ? ged(+m[1], mo, +m[3]) : null;
  }
  if ((m = s.match(/^([a-záéíóú]+)\.?\s+(?:de\s+|del\s+)?(\d{3,4})$/i))) {
    const mo = monthIndex(m[1]);
    return mo ? ged(0, mo, +m[2]) : null;
  }
  return null;
}

/** Convierte lo que escribe el usuario a una fecha GEDCOM. Si no la entiende, la deja tal cual. */
export function normalizeDate(input) {
  const s = (input || '').trim();
  if (!s) return '';
  let m;
  if ((m = s.match(/^(?:entre|bet\.?)\s+(.+?)\s+(?:y|and)\s+(.+)$/i))) {
    const a = parseCore(m[1]);
    const b = parseCore(m[2]);
    if (a && b) return `BET ${a} AND ${b}`;
    return s;
  }
  const prefixes = [
    [/^(?:calc\.?|cal\.?|calculado)\s*/i, 'CAL '],
    [/^(?:c\.|ca\.?|circa|hacia|aprox\.?|aproximadamente|abt\.?|about|~)\s*/i, 'ABT '],
    [/^(?:antes\s+de|ant\.|bef\.?|before)\s*/i, 'BEF '],
    [/^(?:despu[eé]s\s+de|desp\.|aft\.?|after)\s*/i, 'AFT '],
    [/^(?:est\.?|estimado)\s*/i, 'EST '],
  ];
  for (const [re, pre] of prefixes) {
    if (re.test(s)) {
      const core = parseCore(s.replace(re, ''));
      return core ? pre + core : s;
    }
  }
  return parseCore(s) || s;
}

const KEYWORDS = {
  ABT: 'c.', EST: 'est.', CAL: 'calc.', BEF: 'antes de', AFT: 'después de',
  BET: 'entre', AND: 'y', FROM: 'de', TO: 'a', INT: '',
};

/** Fecha GEDCOM → texto en español para mostrar. */
export function formatDate(gedDate) {
  if (!gedDate) return '';
  return gedDate
    .split(/\s+/)
    .map((t) => {
      const u = t.toUpperCase();
      const mi = MONTHS_GED.indexOf(u);
      if (mi >= 0) return MONTHS_ES[mi];
      if (u in KEYWORDS) return KEYWORDS[u];
      return t;
    })
    .filter(Boolean)
    .join(' ');
}

/** Primer año (3-4 dígitos) que aparece en la fecha, o null. */
export function yearOf(date) {
  const m = (date || '').match(/\b(\d{3,4})\b/);
  return m ? +m[1] : null;
}

/** GEDCOM de hoy, para la cabecera de exportación. */
export function todayGed(d = new Date()) {
  return ged(d.getDate(), d.getMonth() + 1, d.getFullYear());
}
