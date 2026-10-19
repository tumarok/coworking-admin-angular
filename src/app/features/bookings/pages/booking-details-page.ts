import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import type { Booking } from '@shared/api/contract';
import { type DetailsField, DetailsList } from '@shared/ui/details-list';
import { DetailsValue } from '@shared/ui/details-value';
import { EmptyState } from '@shared/ui/empty-state';
import { type BackLink, PageHeader } from '@shared/ui/page-header';
import { StatusChip } from '@shared/ui/status-chip';
import { durationHours, formatDateTime, formatMoney } from '@shared/util/format';
import {
  bookingLabel,
  DELETED_MEMBER,
  DELETED_ROOM,
  FALLBACK_TIME_ZONE,
  hasLocation,
  hasMember,
  hasRoom,
  missingLocation,
} from '../booking-display';
import { injectBookingQuery } from '../data/booking-queries';
import { injectLocationById } from '../data/location-queries';
import { injectBookingFormDialog } from '../dialogs/open-booking-form';
import { BookingStatusActions } from './booking-status-actions';

/** The length of a booking in hours, to two decimals without trailing zeros: `1.5`, `0.33`. */
const hoursOf = (booking: Booking): number =>
  Number((durationHours(booking.startsAt, booking.endsAt) ?? 0).toFixed(2));

/**
 * `/bookings/:id`: one booking, with the buttons for its next status and, while it can still be
 * changed (pending or confirmed), Edit. A booking that does not exist and a load that failed are
 * told apart: the first is final, the second can be tried again.
 *
 * Its times read on its location's clock, which comes from the location itself, so the page waits
 * for it (or for its failure) before drawing a time. A booking whose room or member was deleted
 * says so in words.
 */
@Component({
  selector: 'app-booking-details-page',
  imports: [
    BookingStatusActions,
    DetailsList,
    DetailsValue,
    EmptyState,
    MatButton,
    PageHeader,
    RouterLink,
    StatusChip,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './booking-details-page.html',
})
export class BookingDetailsPage {
  /** From the route: `/bookings/:id`. */
  readonly id = input.required<string>();

  private readonly openForm = injectBookingFormDialog();

  protected readonly query = injectBookingQuery(() => this.id());
  private readonly location = injectLocationById(() => this.query.value()?.locationId);
  protected readonly notFound = computed(() => this.query.error()?.status === 404);

  /**
   * The booking with its location's clock, once the clock is known or known to be out of reach. A
   * booking that is shown stays while only its clock is on its way again (a saved edit moved it to
   * a room in another location): the page does not fall back to "Loading" under the person's focus.
   * Another booking never inherits it.
   */
  private readonly view = linkedSignal<
    { booking: Booking | undefined; zone: string | undefined; waiting: boolean },
    { booking: Booking; zone: string | undefined } | undefined
  >({
    source: () => {
      const booking = this.query.value();
      const waiting =
        !!booking &&
        hasLocation(booking) &&
        !this.location.value() &&
        this.location.error() === undefined;
      return { booking, zone: this.location.value()?.timezone, waiting };
    },
    computation: ({ booking, zone, waiting }, previous) => {
      if (!booking) return undefined;
      if (!waiting) return { booking, zone };
      const shown = previous?.value;
      return shown?.booking.id === booking.id ? shown : undefined;
    },
  });
  protected readonly booking = computed(() => this.view()?.booking);
  private readonly timeZone = computed(() => this.view()?.zone);

  protected readonly back: BackLink = { label: 'Bookings', link: '/bookings' };
  protected readonly deletedRoom = DELETED_ROOM;
  protected readonly deletedMember = DELETED_MEMBER;
  protected readonly hasRoom = hasRoom;
  protected readonly hasMember = hasMember;
  protected readonly hasLocation = hasLocation;
  protected readonly missingLocation = missingLocation;

  protected readonly fields: readonly DetailsField<Booking>[] = [
    { key: 'room', label: 'Room' },
    { key: 'location', label: 'Location' },
    { key: 'member', label: 'Member' },
    { key: 'startsAt', label: 'Starts', value: (b) => this.clock(b.startsAt) },
    { key: 'endsAt', label: 'Ends', value: (b) => this.clock(b.endsAt) },
    {
      key: 'duration',
      label: 'Duration',
      value: (b) => `${hoursOf(b)} h`,
    },
    { key: 'attendees', label: 'Attendees', value: (b) => b.attendees },
    { key: 'price', label: 'Price', value: (b) => formatMoney(b.totalPrice) },
    { key: 'createdAt', label: 'Created', value: (b) => this.clock(b.createdAt) },
    { key: 'notes', label: 'Notes', value: (b) => b.notes },
  ];

  protected title(booking: Booking): string {
    return bookingLabel(booking, this.timeZone());
  }

  /** Only a booking that has not started its course can be changed. */
  protected editable(booking: Booking): boolean {
    return booking.status === 'pending' || booking.status === 'confirmed';
  }

  protected async edit(booking: Booking): Promise<void> {
    await this.openForm({ booking, timeZone: this.timeZone() });
  }

  /** A time on the booking's clock; one whose clock is unknown reads in UTC and says so. */
  private clock(iso: string): string {
    const zone = this.timeZone();
    const text = formatDateTime(iso, zone ?? FALLBACK_TIME_ZONE);
    return zone ? text : `${text} ${FALLBACK_TIME_ZONE}`;
  }
}
