import {
  bookingInputSchema,
  canTransition,
  locationInputSchema,
  memberFullName,
  type BookingInput,
  type LocationInput,
} from '.';

const booking: BookingInput = {
  roomId: 'room_1',
  memberId: 'mem_1',
  startsAt: '2026-10-20T09:00:00.000Z',
  endsAt: '2026-10-20T11:00:00.000Z',
  attendees: 2,
  notes: null,
};

const location: LocationInput = {
  name: 'Central Hub',
  city: 'Kyiv',
  address: '1 Main Street',
  timezone: 'Europe/Kyiv',
  opensAt: '08:00',
  closesAt: '20:00',
  status: 'active',
};

const issueAt = (result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  result.error?.issues.map((i) => `${i.path.join('.')}: ${i.message}`);

describe('API contract', () => {
  describe('bookingInputSchema', () => {
    it('accepts a valid booking', () => {
      expect(bookingInputSchema.safeParse(booking).success).toBe(true);
    });

    it('rejects an end that is not after the start', () => {
      const result = bookingInputSchema.safeParse({ ...booking, endsAt: booking.startsAt });

      expect(issueAt(result)).toEqual(['endsAt: End must be after start']);
    });

    it('rejects a booking longer than the limit', () => {
      const result = bookingInputSchema.safeParse({
        ...booking,
        endsAt: '2026-10-20T18:00:00.000Z',
      });

      expect(issueAt(result)).toEqual(['endsAt: A booking cannot be longer than 8 hours']);
    });
  });

  describe('locationInputSchema', () => {
    it('accepts a valid location', () => {
      expect(locationInputSchema.safeParse(location).success).toBe(true);
    });

    it('rejects a closing time that is not after the opening time', () => {
      const result = locationInputSchema.safeParse({ ...location, closesAt: '08:00' });

      expect(issueAt(result)).toEqual(['closesAt: Closing time must be after opening time']);
    });
  });

  describe('helpers', () => {
    it('allows only the declared status transitions', () => {
      expect(canTransition('pending', 'confirmed')).toBe(true);
      expect(canTransition('completed', 'pending')).toBe(false);
    });

    it('joins the first and last name', () => {
      expect(memberFullName({ firstName: 'Alex', lastName: 'Morgan' })).toBe('Alex Morgan');
    });
  });
});
