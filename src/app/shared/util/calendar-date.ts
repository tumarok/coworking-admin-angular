const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A calendar date (`"2026-10-14"`, as the API and the URL hold it) as the `Date` a date picker
 * works with: midnight on that day in the browser's zone, which is how the picker reads a day.
 * Anything that is not a real date is `null`.
 */
export function isoDateToDate(value: string): Date | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  // `2026-02-31` rolls over into March: a date that reads back differently is not a date.
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

/** The `YYYY-MM-DD` of the day a picker's date falls on; `''` when there is no usable date. */
export function dateToIsoDate(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
