import { inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Notifier } from '@core/notifications/notifier';
import { firstValueFrom } from 'rxjs';
import type { BulkResultDialog, BulkResultDialogData } from './bulk-result-dialog';

/**
 * Returns the function that opens the list of bookings a bulk action did not move; it resolves
 * once the dialog is closed. Call it in an injection context. `load` is how the dialog's code is
 * fetched; it is a parameter so a failed download can be tried out in a test.
 *
 * The dialog is loaded when it is first needed (the dynamic `import`), so the list page, which
 * opens it only after a partial failure, does not carry it. If it cannot be fetched, the person is
 * told how many bookings were not moved. The dialog's options are given here, whole: Material takes
 * a config as it is and does not merge it with defaults.
 */
export function injectBulkResultDialog(
  load: () => Promise<{ BulkResultDialog: typeof BulkResultDialog }> = () =>
    import('./bulk-result-dialog'),
): (data: BulkResultDialogData) => Promise<void> {
  const dialog = inject(MatDialog);
  const notifier = inject(Notifier);

  return async (data) => {
    let component: typeof BulkResultDialog;
    try {
      component = (await load()).BulkResultDialog;
    } catch (error) {
      console.error('Cannot load the bulk result', error);
      void notifier.error('Could not show which bookings were skipped. Check your connection.');
      return;
    }

    const ref = dialog.open<BulkResultDialog, BulkResultDialogData>(component, {
      data,
      width: '34rem',
      maxWidth: '95vw',
      // Material focuses after the opening animation; the one button is the one to land on.
      autoFocus: '[data-autofocus]',
      restoreFocus: true,
    });
    await firstValueFrom(ref.afterClosed());
  };
}
