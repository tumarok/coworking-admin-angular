import type { Room } from '@shared/api/contract';
import { type RoomFormValues, roomFormSchema, toRoomFormValues } from './room-form-values';

const ROOM: Room = {
  id: 'room_1',
  locationId: 'loc_1',
  locationName: 'Riverside Hub',
  name: 'Atlas',
  type: 'private_office',
  capacity: 4,
  hourlyRate: 3250,
  amenities: ['whiteboard', 'projector'],
  status: 'maintenance',
};

const VALUES: RoomFormValues = {
  locationId: 'loc_1',
  name: 'Atlas',
  type: 'private_office',
  capacity: 4,
  hourlyRate: 32.5,
  amenities: ['projector'],
  status: 'available',
};

const issues = (values: Partial<RoomFormValues>) => {
  const result = roomFormSchema.safeParse({ ...VALUES, ...values });
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]));
};

describe('toRoomFormValues', () => {
  it('starts a new room as a meeting room for six at €25, with the location still to choose', () => {
    expect(toRoomFormValues()).toEqual({
      locationId: '',
      name: '',
      type: 'meeting_room',
      capacity: 6,
      hourlyRate: 25,
      amenities: [],
      status: 'available',
    });
  });

  it('gives each new form values of its own', () => {
    const [a, b] = [toRoomFormValues(), toRoomFormValues()];

    a.amenities.push('phone');

    expect(b.amenities).toEqual([]);
  });

  it('starts without a location when the room’s own no longer exists, so one must be chosen', () => {
    expect(toRoomFormValues({ ...ROOM, locationName: '—' }).locationId).toBe('');
  });

  it('shows the saved room, with the rate in euros and the amenities in the order of the list', () => {
    expect(toRoomFormValues(ROOM)).toEqual({
      locationId: 'loc_1',
      name: 'Atlas',
      type: 'private_office',
      capacity: 4,
      hourlyRate: 32.5,
      amenities: ['projector', 'whiteboard'],
      status: 'maintenance',
    });
  });
});

describe('roomFormSchema', () => {
  it('parses the form into the input the API takes: the rate in cents, the name trimmed', () => {
    expect(roomFormSchema.parse({ ...VALUES, name: '  Atlas ' })).toEqual({
      locationId: 'loc_1',
      name: 'Atlas',
      type: 'private_office',
      capacity: 4,
      hourlyRate: 3250,
      amenities: ['projector'],
      status: 'available',
    });
  });

  it('turns a rate in euros into whole cents, whatever error the float multiplication has', () => {
    expect(roomFormSchema.parse({ ...VALUES, hourlyRate: 19.99 }).hourlyRate).toBe(1999);
    expect(roomFormSchema.parse({ ...VALUES, hourlyRate: 0.1 + 0.2 }).hourlyRate).toBe(30);
    expect(roomFormSchema.parse({ ...VALUES, hourlyRate: 1.1 }).hourlyRate).toBe(110);
    expect(roomFormSchema.parse({ ...VALUES, hourlyRate: 0.29 }).hourlyRate).toBe(29);
  });

  it('refuses a rate with fractions of a cent instead of rounding it', () => {
    for (const rate of [1.005, 12.345, 0.004, 19.999]) {
      expect(issues({ hourlyRate: rate })).toEqual({ hourlyRate: 'Use at most 2 decimals' });
    }
  });

  it('accepts the limits: one seat, 200 seats, a free room, the dearest hour', () => {
    expect(issues({ capacity: 1, hourlyRate: 0 })).toEqual({});
    expect(issues({ capacity: 200, hourlyRate: 10_000 })).toEqual({});
  });

  it('words each rule the way the form shows it', () => {
    expect(issues({ locationId: '' })).toEqual({ locationId: 'Choose a location' });
    expect(issues({ name: 'a' })).toEqual({ name: 'At least 2 characters' });
    expect(issues({ capacity: 0 })).toEqual({ capacity: 'At least 1 seat' });
    expect(issues({ hourlyRate: -1 })).toEqual({ hourlyRate: 'Cannot be negative' });
    expect(issues({ hourlyRate: 10_000.01 })).toEqual({ hourlyRate: 'At most €10,000.00' });
  });

  it('asks for whole seats, and still applies the contract’s range to a whole number', () => {
    expect(issues({ capacity: 2.5 })).toEqual({ capacity: 'Enter a whole number' });
    expect(issues({ capacity: 0 })).toEqual({ capacity: 'At least 1 seat' });
  });

  it('asks for a number that was left empty, in words for that field', () => {
    expect(issues({ capacity: null, hourlyRate: null })).toEqual({
      capacity: 'Enter the number of seats',
      hourlyRate: 'Enter a rate',
    });
  });

  it('keeps the contract’s own limits for what the form does not reword', () => {
    expect(issues({ capacity: 201 })).toHaveProperty('capacity');
    expect(issues({ name: 'x'.repeat(61) })).toHaveProperty('name');
    expect(issues({ type: 'garage' as never })).toHaveProperty('type');
  });
});
