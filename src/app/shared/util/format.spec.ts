import {
  centsToEuros,
  eurosToCents,
  formatDate,
  formatDateTime,
  formatMoney,
  formatTime,
  formatTimeRange,
  humanize,
} from './format';

describe('humanize', () => {
  it('turns an enum value into a label', () => {
    expect(humanize('meeting_room')).toBe('Meeting room');
    expect(humanize('no_show')).toBe('No show');
    expect(humanize('active')).toBe('Active');
  });

  it('copes with an empty value', () => {
    expect(humanize('')).toBe('');
  });
});

describe('formatMoney', () => {
  it('formats integer cents as euros', () => {
    expect(formatMoney(1250)).toBe('€12.50');
    expect(formatMoney(0)).toBe('€0.00');
    expect(formatMoney(100_000_00)).toBe('€100,000.00');
  });

  it('formats another currency when asked', () => {
    expect(formatMoney(1250, 'USD')).toBe('US$12.50');
  });

  it('shows a placeholder for a value that is not a number', () => {
    expect(formatMoney(Number.NaN)).toBe('—');
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('euros and cents', () => {
  it('turns cents into the euros of a form field and back', () => {
    expect(centsToEuros(3250)).toBe(32.5);
    expect(eurosToCents(32.5)).toBe(3250);
    expect(eurosToCents(centsToEuros(1999))).toBe(1999);
  });

  it('rounds to the nearest cent, absorbing the error of binary fractions', () => {
    expect(eurosToCents(19.99)).toBe(1999);
    expect(eurosToCents(12.345)).toBe(1235);
    expect(eurosToCents(12.344)).toBe(1234);
    expect(eurosToCents(0.1 + 0.2)).toBe(30);
  });
});

describe('date formatting', () => {
  // 06:00 UTC is 09:00 in Kyiv (UTC+3 until the end of October) and 07:00 in Lisbon (UTC+1).
  const instant = '2026-10-12T06:00:00.000Z';

  it('reads an instant in the clock of the given zone', () => {
    expect(formatTime(instant, 'Europe/Kyiv')).toBe('09:00');
    expect(formatTime(instant, 'Europe/Lisbon')).toBe('07:00');
    expect(formatDateTime(instant, 'Europe/Kyiv')).toBe('12 Oct 2026, 09:00');
  });

  it('lets the zone move the calendar date', () => {
    const lateEvening = '2026-10-12T22:30:00.000Z';

    expect(formatDate(lateEvening, 'UTC')).toBe('12 Oct 2026');
    expect(formatDate(lateEvening, 'Europe/Kyiv')).toBe('13 Oct 2026');
  });

  it('uses UTC when no zone is given, so a date-only value never shifts', () => {
    expect(formatDate('2026-01-15')).toBe('15 Jan 2026');
    expect(formatTime(instant)).toBe('06:00');
    expect(formatDateTime(instant)).toBe('12 Oct 2026, 06:00');
  });

  it('shows a placeholder for a value that is not a date', () => {
    expect(formatDate('not a date')).toBe('—');
    expect(formatTime('')).toBe('—');
    expect(formatDateTime('x')).toBe('—');
    expect(formatTimeRange('x', instant)).toBe('—');
    expect(formatTimeRange(instant, 'x')).toBe('—');
  });
});

describe('formatTimeRange', () => {
  it('shows one date for a span inside a day of the zone', () => {
    expect(
      formatTimeRange('2026-10-12T06:00:00.000Z', '2026-10-12T08:30:00.000Z', 'Europe/Kyiv'),
    ).toBe('12 Oct 2026, 09:00–11:30');
  });

  it('shows both dates for a span across midnight of the zone', () => {
    expect(
      formatTimeRange('2026-10-12T17:00:00.000Z', '2026-10-12T23:00:00.000Z', 'Europe/Kyiv'),
    ).toBe('12 Oct 2026, 20:00 – 13 Oct 2026, 02:00');
  });

  it('compares the days in the zone, not in UTC', () => {
    // Both ends fall on 12 Oct in UTC but on 12 and 13 Oct in Kyiv.
    expect(
      formatTimeRange('2026-10-12T20:00:00.000Z', '2026-10-12T22:00:00.000Z', 'Europe/Kyiv'),
    ).toBe('12 Oct 2026, 23:00 – 13 Oct 2026, 01:00');
  });
});
