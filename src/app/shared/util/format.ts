/** Every number and date in the UI reads the same way, whatever the browser's own locale is. */
export const LOCALE = 'en-GB';

/** Shown where a value is missing or cannot be read. */
export const PLACEHOLDER = '—';

const moneyFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

/** `meeting_room` -> `Meeting room`: the label of an enum value. */
export function humanize(value: string): string {
  const spaced = value.replaceAll('_', ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Integer cents as money: `1250` -> `€12.50`. Anything that is not a finite number is a placeholder. */
export function formatMoney(cents: number, currency = 'EUR'): string {
  if (!Number.isFinite(cents)) return PLACEHOLDER;
  let format = moneyFormats.get(currency);
  if (!format) {
    format = new Intl.NumberFormat(LOCALE, { style: 'currency', currency });
    moneyFormats.set(currency, format);
  }
  return format.format(cents / 100);
}

/** Integer cents as the euros a form field shows: `1250` -> `12.5`. */
export const centsToEuros = (cents: number): number => cents / 100;

/** Euros from a form field as integer cents, rounded to the nearest cent: `12.5` -> `1250`. */
export const eurosToCents = (euros: number): number => Math.round(euros * 100);

type DatePart = 'date' | 'time';

/**
 * A formatter per time zone and part, made once. The zone is always explicit: a booking happens at
 * a location, so it reads in that location's clock, not in the browser's.
 */
function dateFormat(part: DatePart, timeZone: string): Intl.DateTimeFormat {
  const key = `${part}|${timeZone}`;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(
      LOCALE,
      part === 'date'
        ? { timeZone, day: '2-digit', month: 'short', year: 'numeric' }
        : { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
    );
    dateFormats.set(key, format);
  }
  return format;
}

function toDate(iso: string): Date | undefined {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * The calendar date of an instant in a time zone: `12 Oct 2026`. UTC is the default because
 * date-only values such as a join date have no clock: read in the browser's zone, a date near
 * midnight could land on the neighbouring day.
 */
export function formatDate(iso: string, timeZone = 'UTC'): string {
  const date = toDate(iso);
  return date ? dateFormat('date', timeZone).format(date) : PLACEHOLDER;
}

/** The clock time of an instant in a time zone: `09:00`. */
export function formatTime(iso: string, timeZone = 'UTC'): string {
  const date = toDate(iso);
  return date ? dateFormat('time', timeZone).format(date) : PLACEHOLDER;
}

/** `12 Oct 2026, 09:00`. */
export function formatDateTime(iso: string, timeZone = 'UTC'): string {
  const date = toDate(iso);
  return date
    ? `${dateFormat('date', timeZone).format(date)}, ${dateFormat('time', timeZone).format(date)}`
    : PLACEHOLDER;
}

/**
 * A span of time: `12 Oct 2026, 09:00–11:30`, or with both dates when it crosses midnight in the
 * zone: `12 Oct 2026, 20:00 – 13 Oct 2026, 02:00`.
 */
export function formatTimeRange(startIso: string, endIso: string, timeZone = 'UTC'): string {
  const start = toDate(startIso);
  const end = toDate(endIso);
  if (!start || !end) return PLACEHOLDER;

  const startDay = dateFormat('date', timeZone).format(start);
  const endDay = dateFormat('date', timeZone).format(end);
  const startTime = dateFormat('time', timeZone).format(start);
  const endTime = dateFormat('time', timeZone).format(end);
  return startDay === endDay
    ? `${startDay}, ${startTime}–${endTime}`
    : `${startDay}, ${startTime} – ${endDay}, ${endTime}`;
}

/** The length of a span in hours, as it is: `1.5` for an hour and a half. `undefined` when an end is not a date. */
export function durationHours(startIso: string, endIso: string): number | undefined {
  const start = toDate(startIso);
  const end = toDate(endIso);
  return start && end ? (end.getTime() - start.getTime()) / 3_600_000 : undefined;
}
