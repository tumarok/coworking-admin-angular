import { dateToIsoDate, isoDateToDate } from './calendar-date';

describe('isoDateToDate', () => {
  it('reads the day into a date at local midnight', () => {
    const date = isoDateToDate('2026-10-14');

    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(9);
    expect(date?.getDate()).toBe(14);
    expect(date?.getHours()).toBe(0);
  });

  it('gives the same instant for the same day, so a bound picker sees no change', () => {
    expect(isoDateToDate('2026-10-14')?.getTime()).toBe(isoDateToDate('2026-10-14')?.getTime());
  });

  it.each(['', '14/10/2026', '2026-10-1', '2026-02-31', '2026-13-01', '2026-10-14T00:00', 'today'])(
    'rejects %j',
    (value) => {
      expect(isoDateToDate(value)).toBeNull();
    },
  );
});

describe('dateToIsoDate', () => {
  it('writes the local day with padding', () => {
    expect(dateToIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(dateToIsoDate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('is the inverse of isoDateToDate', () => {
    expect(dateToIsoDate(isoDateToDate('2026-03-29'))).toBe('2026-03-29');
  });

  it('writes nothing for no date or an invalid one', () => {
    expect(dateToIsoDate(null)).toBe('');
    expect(dateToIsoDate(undefined)).toBe('');
    expect(dateToIsoDate(new Date(Number.NaN))).toBe('');
  });
});
