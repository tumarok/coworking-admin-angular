import { inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Notifier } from '@core/notifications/notifier';
import type { Booking } from '@shared/api/contract';
import { firstValueFrom } from 'rxjs';
import type { BookingFormStart } from './booking-form-values';
import type { BookingFormDialog } from './booking-form-dialog';

/**
 * Returns the function that opens the booking form: pass the booking to edit (with the time zone
 * of its location), or what to choose in advance for a new one, or nothing. It resolves with the
 * saved booking, or `undefined` when the dialog was dismissed. Call it in an injection context.
 * `load` is how the form's code is fetched; it is a parameter so a failed download can be tried out
 * in a test.
 *
 * The form is loaded when it is first opened (the dynamic `import`), so the pages that open it do
 * not carry the pickers, the autocomplete and the contract's schema it uses. The dialog's options
 * are given here, whole: Material takes a config as it is and does not merge it with defaults.
 */
export function injectBookingFormDialog(
  load: () => Promise<{ BookingFormDialog: typeof BookingFormDialog }> = () =>
    import('./booking-form-dialog'),
): (start?: BookingFormStart) => Promise<Booking | undefined> {
  const dialog = inject(MatDialog);
  const notifier = inject(Notifier);

  return async (start = {}) => {
    let component: typeof BookingFormDialog;
    try {
      component = (await load()).BookingFormDialog;
    } catch (error) {
      console.error('Cannot load the booking form', error);
      void notifier.error('Could not open the form. Check your connection and try again.');
      return undefined;
    }

    const ref = dialog.open<BookingFormDialog, BookingFormStart, Booking>(component, {
      data: start,
      width: '44rem',
      maxWidth: '95vw',
      // Material focuses after the opening animation. The form marks the field to start in.
      autoFocus: '[data-autofocus]',
      restoreFocus: true,
    });
    return firstValueFrom(ref.afterClosed());
  };
}
