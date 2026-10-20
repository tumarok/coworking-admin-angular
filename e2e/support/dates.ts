/** A calendar day in UTC, `YYYY-MM-DD`, `days` from today (negative for the past). */
export function daysFromToday(days: number): string {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/** `2026-12-14` as the text a person types into a date box: `14/12/2026`. */
export function dayFirst(isoDay: string): string {
  const [year, month, day] = isoDay.split('-');
  return `${day}/${month}/${year}`;
}
