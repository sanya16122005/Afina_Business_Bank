const LOCALE = 'ru-RU';

const DATE_OPTIONS = { day: '2-digit', month: '2-digit', year: 'numeric' };
const DATE_LONG_OPTIONS = { day: 'numeric', month: 'long', year: 'numeric' };
const DATETIME_OPTIONS = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };
const TIME_OPTIONS = { hour: '2-digit', minute: '2-digit' };
const DAY_MONTH_OPTIONS = { day: '2-digit', month: '2-digit' };

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value, fallback = '—') {
  const d = toDate(value);
  return d ? d.toLocaleDateString(LOCALE, DATE_OPTIONS) : fallback;
}

export function formatDateLong(value, fallback = '—') {
  const d = toDate(value);
  return d ? d.toLocaleDateString(LOCALE, DATE_LONG_OPTIONS) : fallback;
}

export function formatDateTime(value, fallback = '—') {
  const d = toDate(value);
  return d ? d.toLocaleString(LOCALE, DATETIME_OPTIONS) : fallback;
}

export function formatTime(value, fallback = '—') {
  const d = toDate(value);
  return d ? d.toLocaleTimeString(LOCALE, TIME_OPTIONS) : fallback;
}

export function formatDayMonth(value, fallback = '—') {
  const d = toDate(value);
  return d ? d.toLocaleDateString(LOCALE, DAY_MONTH_OPTIONS) : fallback;
}

export function formatMoney(value, currency = 'RUB', { signed = false, maximumFractionDigits = 2 } = {}) {
  const number = Number(value ?? 0);
  const sign = signed && number > 0 ? '+' : '';
  const body = Math.abs(number).toLocaleString(LOCALE, { maximumFractionDigits });
  return `${sign}${number < 0 ? '−' : ''}${body} ${currency}`;
}

export function formatNumber(value, { maximumFractionDigits = 0 } = {}) {
  return Number(value ?? 0).toLocaleString(LOCALE, { maximumFractionDigits });
}

export function formatPercent(value, { maximumFractionDigits = 1 } = {}) {
  //   — non-breaking space между числом и %.
  return `${Number(value ?? 0).toLocaleString(LOCALE, { maximumFractionDigits })} %`;
}

export function formatPhone(value) {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  }
  return value;
}
