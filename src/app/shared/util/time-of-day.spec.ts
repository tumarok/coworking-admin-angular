import { dateToTimeOfDay, timeOfDayToDate } from './time-of-day';

describe('timeOfDayToDate', () => {
  it('reads the hours and minutes into a date', () => {
    const date = timeOfDayToDate('08:30');

    expect(date?.getHours()).toBe(8);
    expect(date?.getMinutes()).toBe(30);
    expect(date?.getSeconds()).toBe(0);
  });

  it('gives the same instant for the same time, so a bound control sees no change', () => {
    expect(timeOfDayToDate('20:00')?.getTime()).toBe(timeOfDayToDate('20:00')?.getTime());
  });

  it.each(['', '8:30', '24:00', '12:60', '12:5', '12:30:00', 'noon', ' 12:30'])(
    'rejects %j',
    (value) => {
      expect(timeOfDayToDate(value)).toBeNull();
    },
  );
});

describe('dateToTimeOfDay', () => {
  it('pads hours and minutes', () => {
    expect(dateToTimeOfDay(new Date(2026, 9, 14, 7, 5))).toBe('07:05');
    expect(dateToTimeOfDay(new Date(2026, 9, 14, 23, 59))).toBe('23:59');
  });

  it('ignores the day and the seconds', () => {
    expect(dateToTimeOfDay(new Date(1999, 11, 31, 0, 0, 59))).toBe('00:00');
  });

  it.each([null, undefined, new Date(Number.NaN)])('gives an empty string for %s', (value) => {
    expect(dateToTimeOfDay(value)).toBe('');
  });

  it('is the inverse of timeOfDayToDate', () => {
    for (const time of ['00:00', '08:15', '12:00', '23:45']) {
      expect(dateToTimeOfDay(timeOfDayToDate(time))).toBe(time);
    }
  });
});
