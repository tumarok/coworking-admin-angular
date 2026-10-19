const TIME_OF_DAY = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * A wall-clock time of day (`"08:30"`, as the API sends it) as a `Date`, for controls that work
 * with dates such as `mat-timepicker`. Only the hours and minutes mean anything: the day is a
 * fixed one, so the same time always gives the same instant. Anything that is not `HH:mm` is `null`.
 */
export function timeOfDayToDate(value: string): Date | null {
  const match = TIME_OF_DAY.exec(value);
  return match ? new Date(2000, 0, 1, Number(match[1]), Number(match[2])) : null;
}

/** The `HH:mm` of a date's local hours and minutes; `''` when there is no usable date. */
export function dateToTimeOfDay(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
