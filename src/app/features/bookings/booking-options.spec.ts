import { BOOKING_STATUSES, BOOKING_TRANSITIONS } from '@shared/api/contract';
import { STATUS_ACTIONS, STATUS_OPTIONS, statusChanged } from './booking-options';

describe('STATUS_OPTIONS', () => {
  it('offers every status, worded for people', () => {
    expect(STATUS_OPTIONS.map((o) => o.label)).toEqual([
      'Pending',
      'Confirmed',
      'Checked in',
      'Completed',
      'Cancelled',
      'No show',
    ]);
    expect(STATUS_OPTIONS.map((o) => o.value)).toEqual([...BOOKING_STATUSES]);
  });
});

describe('STATUS_ACTIONS', () => {
  it('has a button for every status a booking can move to', () => {
    const targets = new Set(Object.values(BOOKING_TRANSITIONS).flat());

    for (const status of targets) expect(STATUS_ACTIONS[status]?.status).toBe(status);
  });

  it('has none for pending, which a booking starts in', () => {
    expect(STATUS_ACTIONS.pending).toBeUndefined();
  });

  it('words the buttons as the screens do', () => {
    expect(Object.values(STATUS_ACTIONS).map((a) => a.label)).toEqual([
      'Confirm',
      'Check in',
      'Complete',
      'No-show',
      'Cancel booking',
    ]);
  });

  it('asks before cancelling, and only then', () => {
    expect(STATUS_ACTIONS.cancelled?.confirmation).toMatchObject({
      title: 'Cancel this booking?',
      confirmLabel: 'Cancel booking',
      cancelLabel: 'Keep',
      danger: true,
    });
    const asking = Object.values(STATUS_ACTIONS).filter((a) => a.confirmation);
    expect(asking.map((a) => a.status)).toEqual(['cancelled']);
  });
});

describe('statusChanged', () => {
  it.each([
    ['confirmed', 'Booking confirmed'],
    ['checked_in', 'Booking checked in'],
    ['completed', 'Booking completed'],
    ['no_show', 'Booking no show'],
    ['cancelled', 'Booking cancelled'],
  ] as const)('tells %s as "%s"', (status, text) => {
    expect(statusChanged(status)).toBe(text);
  });
});
