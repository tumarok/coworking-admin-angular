import { timeSpan } from './time-span';

const SPAN = { startsAt: '2026-07-01T06:00:00.000Z', endsAt: '2026-07-01T08:30:00.000Z' };

describe('timeSpan', () => {
  it('reads the span on the clock of the zone', () => {
    expect(timeSpan(SPAN, 'Europe/Kyiv')).toBe('01 Jul 2026, 09:00–11:30');
    expect(timeSpan(SPAN, 'Europe/Lisbon')).toBe('01 Jul 2026, 07:00–09:30');
  });

  it('reads it in UTC, and says so, when the zone is not known', () => {
    expect(timeSpan(SPAN)).toBe('01 Jul 2026, 06:00–08:30 UTC');
  });
});
