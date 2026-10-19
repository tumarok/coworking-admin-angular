import { utcToZoned, zonedToUtcIso } from './timezone';

describe('zonedToUtcIso', () => {
  it.each([
    // Summer time: Kyiv is three hours ahead of UTC, Lisbon one, Berlin two.
    ['2026-07-01', '09:00', 'Europe/Kyiv', '2026-07-01T06:00:00.000Z'],
    ['2026-07-01', '09:00', 'Europe/Lisbon', '2026-07-01T08:00:00.000Z'],
    ['2026-07-01', '09:00', 'Europe/Berlin', '2026-07-01T07:00:00.000Z'],
    // Winter time: one hour less in each.
    ['2026-01-15', '09:00', 'Europe/Kyiv', '2026-01-15T07:00:00.000Z'],
    ['2026-01-15', '09:00', 'Europe/Lisbon', '2026-01-15T09:00:00.000Z'],
    ['2026-01-15', '09:00', 'Europe/London', '2026-01-15T09:00:00.000Z'],
    ['2026-07-01', '09:00', 'Europe/London', '2026-07-01T08:00:00.000Z'],
  ])('reads %s %s in %s as %s', (date, time, zone, expected) => {
    expect(zonedToUtcIso(date, time, zone)).toBe(expected);
  });

  it('gives UTC itself for the UTC zone, whatever the browser zone is', () => {
    expect(zonedToUtcIso('2026-07-01', '09:00', 'UTC')).toBe('2026-07-01T09:00:00.000Z');
  });

  it('crosses midnight into the neighbouring UTC day when the zone is ahead', () => {
    expect(zonedToUtcIso('2026-07-01', '01:30', 'Europe/Kyiv')).toBe('2026-06-30T22:30:00.000Z');
  });

  describe('around a clock change', () => {
    // Berlin puts the clock forward at 02:00 on 2026-03-29 (01:00 UTC) and back at 03:00 on
    // 2026-10-25 (01:00 UTC).
    it('uses the winter offset before the clock goes forward and the summer one after', () => {
      expect(zonedToUtcIso('2026-03-29', '01:59', 'Europe/Berlin')).toBe(
        '2026-03-29T00:59:00.000Z',
      );
      expect(zonedToUtcIso('2026-03-29', '03:00', 'Europe/Berlin')).toBe(
        '2026-03-29T01:00:00.000Z',
      );
      expect(zonedToUtcIso('2026-03-29', '10:00', 'Europe/Berlin')).toBe(
        '2026-03-29T08:00:00.000Z',
      );
    });

    it('moves a time the clock skips forward by the gap', () => {
      expect(zonedToUtcIso('2026-03-29', '02:30', 'Europe/Berlin')).toBe(
        '2026-03-29T01:30:00.000Z',
      );
    });

    it('uses the summer offset before the clock goes back and the winter one after', () => {
      expect(zonedToUtcIso('2026-10-25', '01:59', 'Europe/Berlin')).toBe(
        '2026-10-24T23:59:00.000Z',
      );
      expect(zonedToUtcIso('2026-10-25', '03:30', 'Europe/Berlin')).toBe(
        '2026-10-25T02:30:00.000Z',
      );
      expect(zonedToUtcIso('2026-10-25', '10:00', 'Europe/Berlin')).toBe(
        '2026-10-25T09:00:00.000Z',
      );
    });

    it('takes the later of the two times the clock shows when it goes back', () => {
      expect(zonedToUtcIso('2026-10-25', '02:30', 'Europe/Berlin')).toBe(
        '2026-10-25T01:30:00.000Z',
      );
    });

    it('makes the day of the change 25 hours long in autumn and 23 in spring', () => {
      const hours = (date: string) =>
        (Date.parse(zonedToUtcIso(date, '23:59', 'Europe/Berlin') ?? '') -
          Date.parse(zonedToUtcIso(date, '00:00', 'Europe/Berlin') ?? '')) /
          3_600_000 +
        1 / 60;
      expect(hours('2026-10-25')).toBeCloseTo(25);
      expect(hours('2026-03-29')).toBeCloseTo(23);
      expect(hours('2026-06-15')).toBeCloseTo(24);
    });

    it('follows Kyiv, which changes at the same instant as Berlin', () => {
      expect(zonedToUtcIso('2026-03-29', '10:00', 'Europe/Kyiv')).toBe('2026-03-29T07:00:00.000Z');
      expect(zonedToUtcIso('2026-10-25', '10:00', 'Europe/Kyiv')).toBe('2026-10-25T08:00:00.000Z');
    });
  });

  it.each([
    ['', '09:00'],
    ['2026-07-01', ''],
    ['01/07/2026', '09:00'],
    ['2026-07-01', '9:00'],
    ['2026-02-31', '09:00'],
    ['2026-13-01', '09:00'],
    ['2026-07-01', '24:00'],
    ['2026-07-01', '12:60'],
  ])('answers nothing for %j at %j, which are not a date and a time', (date, time) => {
    expect(zonedToUtcIso(date, time, 'Europe/Kyiv')).toBeUndefined();
  });
});

describe('utcToZoned', () => {
  it('reads an instant on the clock of a zone', () => {
    expect(utcToZoned('2026-07-01T06:00:00.000Z', 'Europe/Kyiv')).toEqual({
      date: '2026-07-01',
      time: '09:00',
    });
    expect(utcToZoned('2026-01-15T07:00:00.000Z', 'Europe/Kyiv')).toEqual({
      date: '2026-01-15',
      time: '09:00',
    });
  });

  it('moves to the next or the previous day when the zone is on the other side of midnight', () => {
    expect(utcToZoned('2026-06-30T22:30:00.000Z', 'Europe/Kyiv')).toEqual({
      date: '2026-07-01',
      time: '01:30',
    });
    expect(utcToZoned('2026-07-01T01:30:00.000Z', 'Europe/Lisbon')?.date).toBe('2026-07-01');
    expect(utcToZoned('2026-07-01T00:30:00.000Z', 'Europe/Lisbon')).toEqual({
      date: '2026-07-01',
      time: '01:30',
    });
  });

  it('writes midnight as 00:00, not 24:00', () => {
    expect(utcToZoned('2026-07-01T00:00:00.000Z', 'UTC')?.time).toBe('00:00');
  });

  it('is the inverse of zonedToUtcIso, including at a clock change', () => {
    for (const [date, time, zone] of [
      ['2026-07-01', '09:15', 'Europe/Kyiv'],
      ['2026-03-29', '03:00', 'Europe/Berlin'],
      ['2026-10-25', '03:30', 'Europe/Berlin'],
      ['2026-12-31', '23:45', 'Europe/Lisbon'],
    ]) {
      const iso = zonedToUtcIso(date, time, zone) ?? '';
      expect(utcToZoned(iso, zone)).toEqual({ date, time });
    }
  });

  it('answers nothing for text that is not a date', () => {
    expect(utcToZoned('soon', 'Europe/Kyiv')).toBeUndefined();
  });
});
