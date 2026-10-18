import { Component } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import { MoneyPipe } from './money-pipe';
import { TimeRangePipe } from './time-range-pipe';
import { ZonedPipe } from './zoned-pipe';

@Component({
  imports: [MoneyPipe, TimeRangePipe, ZonedPipe],
  template: `
    <p data-testid="money">{{ cents | money }}</p>
    <p data-testid="date">{{ start | zoned: 'date' : zone }}</p>
    <p data-testid="time">{{ start | zoned: 'time' : zone }}</p>
    <p data-testid="date-time">{{ start | zoned: 'dateTime' : zone }}</p>
    <p data-testid="utc">{{ start | zoned: 'time' }}</p>
    <p data-testid="range">{{ start | timeRange: end : zone }}</p>
  `,
})
class Host {
  cents: number | null | undefined = 1250;
  start: string | null | undefined = '2026-10-12T06:00:00.000Z';
  end: string | null | undefined = '2026-10-12T08:30:00.000Z';
  zone = 'Europe/Kyiv';
}

describe('formatting pipes', () => {
  const text = (id: string) => screen.getByTestId(id).textContent;

  it('formats money, dates and ranges', async () => {
    await render(Host);

    expect(text('money')).toBe('€12.50');
    expect(text('date')).toBe('12 Oct 2026');
    expect(text('time')).toBe('09:00');
    expect(text('date-time')).toBe('12 Oct 2026, 09:00');
    expect(text('range')).toBe('12 Oct 2026, 09:00–11:30');
  });

  it('reads in UTC when no zone is given', async () => {
    await render(Host);

    expect(text('utc')).toBe('06:00');
  });

  it('shows a placeholder for missing values', async () => {
    await render(Host, { componentProperties: { cents: null, start: undefined, end: null } });

    expect(text('money')).toBe('—');
    expect(text('date')).toBe('—');
    expect(text('time')).toBe('—');
    expect(text('date-time')).toBe('—');
    expect(text('range')).toBe('—');
  });

  it('shows a placeholder for money that is undefined', async () => {
    await render(Host, { componentProperties: { cents: undefined } });

    expect(text('money')).toBe('—');
  });
});
