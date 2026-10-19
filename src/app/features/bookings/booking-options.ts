import { BOOKING_STATUSES, type BookingStatus, type BulkBookingAction } from '@shared/api/contract';
import type { ConfirmOptions } from '@shared/ui/confirm-dialog-content';
import type { SelectOption } from '@shared/ui/select-option';
import { humanize } from '@shared/util/format';

/** The status filter offers every status. */
export const STATUS_OPTIONS: readonly SelectOption<BookingStatus>[] = BOOKING_STATUSES.map(
  (value) => ({ value, label: humanize(value) }),
);

/** A button that moves a booking to a status. */
export interface StatusAction {
  /** The status it moves to. */
  status: BookingStatus;
  label: string;
  /** The main moves are filled; the ones that end a booking early are outlined. */
  appearance: 'filled' | 'outlined';
  /** Colours an outlined button as a warning or as dangerous. */
  tone?: 'warning' | 'danger';
  /** Asked before the move, for a move that cannot be taken back. */
  confirmation?: ConfirmOptions;
}

/**
 * The button for each status a booking can move to. `pending` is where a booking starts, so no
 * move leads to it. Which buttons a booking shows is up to `BOOKING_TRANSITIONS`.
 */
export const STATUS_ACTIONS: Readonly<Partial<Record<BookingStatus, StatusAction>>> = {
  confirmed: { status: 'confirmed', label: 'Confirm', appearance: 'filled' },
  checked_in: { status: 'checked_in', label: 'Check in', appearance: 'filled' },
  completed: { status: 'completed', label: 'Complete', appearance: 'filled' },
  no_show: { status: 'no_show', label: 'No-show', appearance: 'outlined', tone: 'warning' },
  cancelled: {
    status: 'cancelled',
    label: 'Cancel booking',
    appearance: 'outlined',
    tone: 'danger',
    confirmation: {
      title: 'Cancel this booking?',
      message: 'The room becomes available for this time again.',
      confirmLabel: 'Cancel booking',
      cancelLabel: 'Keep',
      danger: true,
    },
  },
};

/** What the snackbar says once a booking has moved: `Booking checked in`. */
export const statusChanged = (status: BookingStatus): string =>
  `Booking ${status.replaceAll('_', ' ')}`;

/** `1 booking`, `2 bookings`. */
export const countBookings = (count: number): string =>
  `${count} ${count === 1 ? 'booking' : 'bookings'}`;

/** The past tense of each bulk action, for what was done and what was not. */
export const BULK_DONE: Readonly<Record<BulkBookingAction, string>> = {
  confirm: 'confirmed',
  cancel: 'cancelled',
};

/** Asked before cancelling the selected bookings; confirming them asks nothing. */
export const bulkCancelConfirmation = (count: number): ConfirmOptions => ({
  title: `Cancel ${countBookings(count)}?`,
  confirmLabel: 'Cancel bookings',
  cancelLabel: 'Keep',
  danger: true,
});
