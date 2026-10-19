/**
 * Wall-clock time in an IANA time zone and the instant it stands for. A booking is typed as the
 * clock of its location and stored as UTC, so the browser's own zone must never take part: both
 * directions go through `Intl` with an explicit zone.
 */

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{2}):(\d{2})$/;
const MINUTE_MS = 60_000;

export interface ZonedDateTime {
  /** `YYYY-MM-DD`. */
  date: string;
  /** `HH:mm`, on a 24-hour clock. */
  time: string;
}

const formats = new Map<string, Intl.DateTimeFormat>();

function formatOf(timeZone: string): Intl.DateTimeFormat {
  let format = formats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    formats.set(timeZone, format);
  }
  return format;
}

/** The clock of an instant in a zone, by the part's name (`year`, `month`, `day`, `hour`, `minute`). */
function wallClock(ms: number, timeZone: string): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const part of formatOf(timeZone).formatToParts(ms)) parts[part.type] = part.value;
  return parts;
}

/** How far the zone's clock is ahead of UTC at an instant, in milliseconds (whole minutes). */
function offsetAt(ms: number, timeZone: string): number {
  const clock = wallClock(ms, timeZone);
  const asIfUtc = Date.UTC(
    Number(clock['year']),
    Number(clock['month']) - 1,
    Number(clock['day']),
    Number(clock['hour']),
    Number(clock['minute']),
  );
  return asIfUtc - Math.floor(ms / MINUTE_MS) * MINUTE_MS;
}

/**
 * The instant (ISO 8601, UTC) at which a zone's clock reads `time` on `date`: 09:00 on 1 July in
 * `Europe/Kyiv` is `2026-07-01T06:00:00.000Z`. `undefined` when the date or the time is not
 * a real `YYYY-MM-DD` / `HH:mm`.
 *
 * The offset is looked up twice, the second time at the instant the first lookup found, so a time
 * next to a clock change gets the offset that applies there rather than the one from the day
 * before. Of the two times the clock shows twice when it is put back, the later one is taken; a time
 * the clock skips when it is put forward lands that much later. This is tested for the zones the API
 * knows (Kyiv, Warsaw, Berlin, Lisbon, London), whose changes are one hour at whole-hour offsets.
 */
export function zonedToUtcIso(date: string, time: string, timeZone: string): string | undefined {
  const day = DATE.exec(date);
  const clock = TIME.exec(time);
  if (!day || !clock) return undefined;

  const asIfUtc = Date.UTC(
    Number(day[1]),
    Number(day[2]) - 1,
    Number(day[3]),
    Number(clock[1]),
    Number(clock[2]),
  );
  // `2026-02-31` or `24:30` roll over into a neighbouring day, so a value that does not read back
  // as it was given is not a date and time.
  if (new Date(asIfUtc).toISOString().slice(0, 16) !== `${date}T${time}`) return undefined;
  const first = asIfUtc - offsetAt(asIfUtc, timeZone);
  return new Date(asIfUtc - offsetAt(first, timeZone)).toISOString();
}

/** The date and the time an instant has on a zone's clock; `undefined` for text that is not a date. */
export function utcToZoned(iso: string, timeZone: string): ZonedDateTime | undefined {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return undefined;
  const clock = wallClock(ms, timeZone);
  return {
    date: `${clock['year']}-${clock['month']}-${clock['day']}`,
    time: `${clock['hour']}:${clock['minute']}`,
  };
}
