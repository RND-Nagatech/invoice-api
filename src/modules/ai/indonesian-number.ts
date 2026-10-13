const SMALL: Record<string, number> = {
  nol: 0,
  satu: 1,
  dua: 2,
  tiga: 3,
  empat: 4,
  lima: 5,
  enam: 6,
  tujuh: 7,
  delapan: 8,
  sembilan: 9,
  sepuluh: 10,
  sebelas: 11,
  seratus: 100,
  seribu: 1000,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const WORDS = [
  ...Object.keys(SMALL),
  'belas',
  'puluh',
  'ratus',
  'ribu',
  'juta',
  'miliar',
  'koma',
  'setengah',
  'hundred',
  'thousand',
  'million',
];
export const NUMBER_PATTERN = `(?:\\d+(?:[.,]\\d+)*|(?:${WORDS.join('|')})(?:\\s+(?:${WORDS.join('|')}))*)`;
export const AMOUNT_PATTERN = `(?:rp\\.?\\s*)?${NUMBER_PATTERN}(?:\\s*(?:ribu|juta|miliar|rb|jt|k|thousand|million))?`;

function numericToken(value: string): number | null {
  // A grouping like 1.000.000 is different from the decimal in 1.5 juta.
  const grouped = /^\d{1,3}(?:[.,]\d{3})+$/.test(value);
  const normalized = grouped
    ? value.replace(/[.,]/g, '')
    : value.replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Parses a whole expression; never extracts a stray digit from an item name. */
export function parseIndonesianNumber(input: string): number | null {
  const text = input
    .toLowerCase()
    .replace(/^rp\.?\s*/, '')
    .trim();
  if (!text) return null;
  const numeric = numericToken(text);
  if (numeric !== null) return numeric;
  const decimalScaled =
    /^(\d+(?:[.,]\d+)?)\s*(ribu|rb|k|juta|jt|miliar|thousand|million)$/.exec(
      text,
    );
  if (decimalScaled) {
    const base = numericToken(decimalScaled[1]);
    return base === null
      ? null
      : base *
          {
            ribu: 1000,
            rb: 1000,
            k: 1000,
            juta: 1_000_000,
            jt: 1_000_000,
            miliar: 1_000_000_000,
            thousand: 1000,
            million: 1_000_000,
          }[decimalScaled[2]]!;
  }
  const tokens = text.split(/\s+/);
  let total = 0;
  let current = 0;
  let last = 0;
  let groupStarted = false;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === 'setengah') {
      groupStarted = true;
      current += 0.5;
      last = 0.5;
    } else if (token in SMALL) {
      groupStarted = true;
      current += SMALL[token];
      last = SMALL[token] < 10 ? SMALL[token] : 0;
    } else if (/^\d/.test(token)) {
      groupStarted = true;
      const value = numericToken(token);
      if (value === null) return null;
      current += value;
      last = value;
    } else if (token === 'belas') {
      current += 10;
      last = 0;
    } else if (token === 'puluh') {
      current = current - last + (last || 1) * 10;
      last = 0;
    } else if (token === 'ratus' || token === 'hundred') {
      current = current - last + (last || 1) * 100;
      last = 0;
    } else if (token === 'koma') {
      const fraction: number[] = [];
      while (
        index + 1 < tokens.length &&
        tokens[index + 1] in SMALL &&
        SMALL[tokens[index + 1]] < 10
      ) {
        fraction.push(SMALL[tokens[++index]]);
      }
      if (!fraction.length) return null;
      current += Number(`0.${fraction.join('')}`);
    } else if (
      [
        'ribu',
        'rb',
        'k',
        'juta',
        'jt',
        'miliar',
        'thousand',
        'million',
      ].includes(token)
    ) {
      const scale = ['ribu', 'rb', 'k', 'thousand'].includes(token)
        ? 1000
        : ['juta', 'jt', 'million'].includes(token)
          ? 1_000_000
          : 1_000_000_000;
      total += (groupStarted ? current : 1) * scale;
      current = 0;
      last = 0;
      groupStarted = false;
    } else return null;
  }
  const result = total + current;
  return Number.isFinite(result) ? result : null;
}
