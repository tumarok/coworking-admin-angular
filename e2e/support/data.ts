import type { ApiClient } from './api-client';

/** What the tests need to know of a record the API made; the API sends more. */
export interface LocationRecord {
  id: string;
  name: string;
  timezone: string;
}
export interface RoomRecord {
  id: string;
  name: string;
  locationId: string;
}
export interface MemberRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}
export interface BookingRecord {
  id: string;
  status: string;
}

type Overrides<T> = Partial<T> & Record<string, unknown>;

/** A location open 08:00 to 20:00 in Kyiv: a booking at 06:00 to 17:00 UTC is always inside. */
export function createLocation(api: ApiClient, overrides: Overrides<LocationRecord> = {}) {
  return api.post<LocationRecord>('/locations', {
    name: 'Rules Hub',
    city: 'Kyiv',
    address: '1 Rules Way',
    timezone: 'Europe/Kyiv',
    opensAt: '08:00',
    closesAt: '20:00',
    status: 'active',
    ...overrides,
  });
}

export function createRoom(
  api: ApiClient,
  locationId: string,
  overrides: Overrides<RoomRecord> = {},
) {
  return api.post<RoomRecord>('/rooms', {
    locationId,
    name: 'Onyx',
    type: 'meeting_room',
    capacity: 6,
    hourlyRate: 2500,
    amenities: [],
    status: 'available',
    ...overrides,
  });
}

export function createMember(api: ApiClient, overrides: Overrides<MemberRecord> = {}) {
  return api.post<MemberRecord>('/members', {
    firstName: 'Dana',
    lastName: 'Testova',
    email: 'dana.testova@example.com',
    phone: '+380 44 000 00 00',
    company: null,
    plan: 'flex',
    status: 'active',
    ...overrides,
  });
}

/** Where a booking is, and what it should look like once made. Times are UTC, `HH:mm`. */
export interface BookingSpec {
  roomId: string;
  memberId: string;
  /** `YYYY-MM-DD`, see `daysFromToday`. */
  day: string;
  from?: string;
  to?: string;
  attendees?: number;
  /** Where the booking is taken after it is made; it starts `pending`. */
  status?: 'pending' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled';
}

/** The moves that lead from `pending` to each status, in order. */
const PATH_TO: Readonly<Record<NonNullable<BookingSpec['status']>, readonly string[]>> = {
  pending: [],
  confirmed: ['confirmed'],
  checked_in: ['confirmed', 'checked_in'],
  completed: ['confirmed', 'checked_in', 'completed'],
  cancelled: ['cancelled'],
};

export async function createBooking(
  api: ApiClient,
  {
    roomId,
    memberId,
    day,
    from = '09:00',
    to = '10:00',
    attendees = 1,
    status = 'pending',
  }: BookingSpec,
) {
  const booking = await api.post<BookingRecord>('/bookings', {
    roomId,
    memberId,
    startsAt: `${day}T${from}:00.000Z`,
    endsAt: `${day}T${to}:00.000Z`,
    attendees,
    notes: null,
  });
  for (const next of PATH_TO[status]) {
    await api.post(`/bookings/${booking.id}/status`, { status: next });
  }
  return { ...booking, status };
}
