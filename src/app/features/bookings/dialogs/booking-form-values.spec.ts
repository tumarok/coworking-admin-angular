import type { Booking } from '@shared/api/contract';
import {
  type BookingFormValues,
  bookingFormSchema,
  slotOf,
  slotProblem,
  toBookingFormValues,
  toBookingInput,
} from './booking-form-values';

const BOOKING: Booking = {
  id: 'bk_1',
  roomId: 'room_1',
  roomName: 'Aurora',
  locationId: 'loc_1',
  locationName: 'Riverside Hub',
  memberId: 'mem_1',
  memberName: 'Ada Lovelace',
  startsAt: '2026-07-01T06:00:00.000Z',
  endsAt: '2026-07-01T08:30:00.000Z',
  attendees: 4,
  status: 'confirmed',
  notes: 'Bring the cables',
  totalPrice: 6250,
  createdAt: '2026-06-01T09:00:00.000Z',
};

const VALUES: BookingFormValues = {
  roomId: 'room_1',
  memberId: 'mem_1',
  date: '2026-07-01',
  startTime: '09:00',
  endTime: '11:30',
  attendees: 4,
  notes: '',
};

describe('toBookingFormValues', () => {
  it('starts a new booking on a morning hour, for one person, with nothing chosen', () => {
    expect(toBookingFormValues()).toEqual({
      roomId: '',
      memberId: '',
      date: '',
      startTime: '09:00',
      endTime: '10:00',
      attendees: 1,
      notes: '',
    });
  });

  it('starts a new booking with the room and the member chosen in advance', () => {
    expect(toBookingFormValues({ roomId: 'room_9', memberId: 'mem_9' })).toMatchObject({
      roomId: 'room_9',
      memberId: 'mem_9',
    });
  });

  it('fills an existing booking in as its location’s clock reads it', () => {
    expect(toBookingFormValues({ booking: BOOKING, timeZone: 'Europe/Kyiv' })).toEqual({
      roomId: 'room_1',
      memberId: 'mem_1',
      date: '2026-07-01',
      startTime: '09:00',
      endTime: '11:30',
      attendees: 4,
      notes: 'Bring the cables',
    });
  });

  it('reads another clock for another zone, even on the day before', () => {
    expect(toBookingFormValues({ booking: BOOKING, timeZone: 'Pacific/Honolulu' })).toMatchObject({
      date: '2026-06-30',
      startTime: '20:00',
      endTime: '22:30',
    });
  });

  it('reads a booking in UTC when its zone is not known', () => {
    expect(toBookingFormValues({ booking: BOOKING })).toMatchObject({
      date: '2026-07-01',
      startTime: '06:00',
      endTime: '08:30',
    });
  });

  it('turns a booking without notes into empty text', () => {
    expect(toBookingFormValues({ booking: { ...BOOKING, notes: null } }).notes).toBe('');
  });

  it('does not keep a room or a member that no longer exists: the field starts empty', () => {
    const values = toBookingFormValues({
      booking: { ...BOOKING, roomName: '—', memberName: '—', locationId: '', locationName: '—' },
    });

    expect(values).toMatchObject({ roomId: '', memberId: '' });
  });
});

describe('bookingFormSchema', () => {
  const issues = (values: Partial<BookingFormValues>) => {
    const found: Partial<Record<keyof BookingFormValues, string>> = {};
    for (const issue of bookingFormSchema.safeParse({ ...VALUES, ...values }).error?.issues ?? []) {
      found[issue.path[0] as keyof BookingFormValues] = issue.message;
    }
    return found;
  };

  it('accepts a complete form', () => {
    expect(bookingFormSchema.safeParse(VALUES).success).toBe(true);
  });

  it('asks for a room, a member and a date', () => {
    expect(issues({ roomId: '', memberId: '', date: '' })).toEqual({
      roomId: 'Choose a room',
      memberId: 'Choose a member',
      date: 'Pick a date',
    });
  });

  it('asks for a real day', () => {
    expect(issues({ date: '2026-02-31' }).date).toBe('Pick a date');
  });

  it('asks for the times as HH:mm', () => {
    expect(issues({ startTime: '', endTime: '9:5' })).toEqual({
      startTime: 'Use the HH:mm format',
      endTime: 'Use the HH:mm format',
    });
  });

  it('words an empty number of attendees, a fraction and less than one', () => {
    expect(issues({ attendees: null }).attendees).toBe('Enter a number');
    expect(issues({ attendees: 2.5 }).attendees).toBe('Enter a whole number');
    expect(issues({ attendees: 0 }).attendees).toBe('At least 1 person');
  });

  it('allows notes up to 500 characters, measured after trimming', () => {
    expect(issues({ notes: `  ${'x'.repeat(500)}  ` }).notes).toBeUndefined();
    expect(issues({ notes: 'x'.repeat(501) }).notes).toBe('At most 500 characters');
  });
});

describe('slotOf', () => {
  it('reads the day and the times on the clock of the zone', () => {
    expect(slotOf(VALUES, 'Europe/Kyiv')).toEqual({
      startsAt: '2026-07-01T06:00:00.000Z',
      endsAt: '2026-07-01T08:30:00.000Z',
    });
    expect(slotOf(VALUES, 'Europe/Lisbon')).toEqual({
      startsAt: '2026-07-01T08:00:00.000Z',
      endsAt: '2026-07-01T10:30:00.000Z',
    });
  });

  it('is nothing when the day or a time is unreadable', () => {
    expect(slotOf({ ...VALUES, date: '' }, 'Europe/Kyiv')).toBeUndefined();
    expect(slotOf({ ...VALUES, startTime: '' }, 'Europe/Kyiv')).toBeUndefined();
    expect(slotOf({ ...VALUES, endTime: '25:00' }, 'Europe/Kyiv')).toBeUndefined();
  });
});

describe('slotProblem', () => {
  const problem = (startTime: string, endTime: string, date = '2026-07-01', zone = 'Europe/Kyiv') =>
    slotProblem({ date, startTime, endTime }, zone);

  it('finds nothing wrong with a span of up to 8 hours', () => {
    expect(problem('09:00', '10:00')).toBeUndefined();
    expect(problem('09:00', '17:00')).toBeUndefined();
  });

  it('says the end must be after the start, when it is equal or earlier', () => {
    expect(problem('10:00', '10:00')).toBe('End must be after start');
    expect(problem('10:00', '09:30')).toBe('End must be after start');
  });

  it('says a booking cannot be longer than 8 hours, by a minute too', () => {
    expect(problem('09:00', '17:01')).toBe('A booking cannot be longer than 8 hours');
    expect(problem('08:00', '20:00')).toBe('A booking cannot be longer than 8 hours');
  });

  it('says nothing while a time is unreadable: its own error speaks', () => {
    expect(problem('', '10:00')).toBeUndefined();
    expect(problem('09:00', 'late')).toBeUndefined();
  });

  it('compares the times on an ordinary day while the day is not typed yet', () => {
    expect(problem('10:00', '09:00', '')).toBe('End must be after start');
    expect(problem('09:00', '18:00', 'soon')).toBe('A booking cannot be longer than 8 hours');
    expect(problem('09:00', '10:00', '')).toBeUndefined();
  });

  describe('on the night the clock is put back (Berlin, 2026-10-25, a day of 25 hours)', () => {
    it('counts the hours the night has, so 8 hours on the wall are 9 on the clock', () => {
      expect(problem('00:30', '08:30', '2026-10-25', 'Europe/Berlin')).toBe(
        'A booking cannot be longer than 8 hours',
      );
    });

    it('accepts what is really 8 hours, though the wall shows 7', () => {
      expect(problem('00:30', '07:30', '2026-10-25', 'Europe/Berlin')).toBeUndefined();
    });

    it('does not do that on another day', () => {
      expect(problem('00:30', '08:30', '2026-10-24', 'Europe/Berlin')).toBeUndefined();
    });
  });

  describe('on the night the clock is put forward (Berlin, 2026-03-29, a day of 23 hours)', () => {
    it('accepts 8 hours on the wall, which are only 7 on the clock', () => {
      expect(problem('00:30', '08:30', '2026-03-29', 'Europe/Berlin')).toBeUndefined();
    });

    it('refuses what is really more than 8 hours', () => {
      expect(problem('00:30', '09:45', '2026-03-29', 'Europe/Berlin')).toBe(
        'A booking cannot be longer than 8 hours',
      );
    });
  });
});

describe('toBookingInput', () => {
  it('reads the times on the room’s clock and sends the rest as chosen', () => {
    expect(toBookingInput(VALUES, 'Europe/Kyiv')).toEqual({
      roomId: 'room_1',
      memberId: 'mem_1',
      startsAt: '2026-07-01T06:00:00.000Z',
      endsAt: '2026-07-01T08:30:00.000Z',
      attendees: 4,
      notes: null,
    });
  });

  it('trims the notes, and sends empty notes as null', () => {
    expect(toBookingInput({ ...VALUES, notes: '  Bring the cables  ' }, 'Europe/Kyiv')?.notes).toBe(
      'Bring the cables',
    );
    expect(toBookingInput({ ...VALUES, notes: '   ' }, 'Europe/Kyiv')?.notes).toBeNull();
  });

  it('is nothing for values the schema refuses or whose times cannot be read', () => {
    expect(toBookingInput({ ...VALUES, roomId: '' }, 'Europe/Kyiv')).toBeUndefined();
    expect(toBookingInput({ ...VALUES, attendees: null }, 'Europe/Kyiv')).toBeUndefined();
    expect(toBookingInput({ ...VALUES, date: '' }, 'Europe/Kyiv')).toBeUndefined();
  });
});
