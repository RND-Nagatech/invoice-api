import { NUMBER_PATTERN, parseIndonesianNumber } from './indonesian-number.js';

export function businessToday(now = new Date()): Date {
  const values = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (key: string) =>
    Number(values.find((part) => part.type === key)?.value);
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
}

function plusDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function validDate(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

export function parseInvoiceDate(text: string, today: Date): Date | null {
  const lower = text.toLowerCase();
  const iso = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/.exec(lower);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const slash = /\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/.exec(lower);
  if (slash)
    return validDate(Number(slash[3]), Number(slash[2]), Number(slash[1]));
  const months = [
    'januari',
    'februari',
    'maret',
    'april',
    'mei',
    'juni',
    'juli',
    'agustus',
    'september',
    'oktober',
    'november',
    'desember',
  ];
  const named = new RegExp(
    `\\b(\\d{1,2})\\s+(${months.join('|')})(?:\\s+(20\\d{2}))?\\b`,
    'i',
  ).exec(lower);
  if (named)
    return validDate(
      named[3] ? Number(named[3]) : today.getUTCFullYear(),
      months.indexOf(named[2]) + 1,
      Number(named[1]),
    );
  const days = new RegExp(
    `(?:dalam\\s+|in\\s+)?(${NUMBER_PATTERN})\\s*(?:hari|days?)\\b`,
    'i',
  ).exec(lower);
  if (days) {
    const count = parseIndonesianNumber(days[1]);
    return count !== null &&
      Number.isInteger(count) &&
      count >= 0 &&
      count <= 365
      ? plusDays(today, count)
      : null;
  }
  if (/\blusa\b/.test(lower)) return plusDays(today, 2);
  if (/\b(?:besok|tomorrow)\b/.test(lower)) return plusDays(today, 1);
  if (/\b(?:hari ini|today)\b/.test(lower)) return today;
  if (/\b(?:minggu depan|pekan depan|next week)\b/.test(lower))
    return plusDays(today, 7);
  const daysOfWeek = [
    'minggu',
    'senin',
    'selasa',
    'rabu',
    'kamis',
    'jumat',
    'sabtu',
  ];
  const englishDays = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];
  const weekday = new RegExp(
    `\\b(${[...daysOfWeek, ...englishDays].join('|')})\\b`,
    'i',
  ).exec(lower);
  if (weekday) {
    const day = daysOfWeek.includes(weekday[1])
      ? daysOfWeek.indexOf(weekday[1])
      : englishDays.indexOf(weekday[1]);
    let distance = (day - today.getUTCDay() + 7) % 7;
    if (/depan|next/.test(lower) && distance === 0) distance = 7;
    return plusDays(today, distance);
  }
  return null;
}
