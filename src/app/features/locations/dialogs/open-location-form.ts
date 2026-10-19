import { inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Notifier } from '@core/notifications/notifier';
import type { Location } from '@shared/api/contract';
import { firstValueFrom } from 'rxjs';
import type { LocationFormDialog, LocationFormDialogData } from './location-form-dialog';

/**
 * Returns the function that opens the location form: pass the location to edit, or nothing for a
 * new one. It resolves with the saved location, or `undefined` when the dialog was dismissed.
 * Call it in an injection context. `load` is how the form's code is fetched; it is a parameter so a
 * failed download can be tried out in a test.
 *
 * The form is loaded when it is first opened (the dynamic `import`), so the pages that open it do
 * not carry the select, time picker and date library it uses. The dialog's options are given
 * here, whole: Material takes a config as it is and does not merge it with defaults.
 */
export function injectLocationFormDialog(
  load: () => Promise<{ LocationFormDialog: typeof LocationFormDialog }> = () =>
    import('./location-form-dialog'),
): (location?: Location) => Promise<Location | undefined> {
  const dialog = inject(MatDialog);
  const notifier = inject(Notifier);

  return async (location) => {
    let component: typeof LocationFormDialog;
    try {
      component = (await load()).LocationFormDialog;
    } catch (error) {
      console.error('Cannot load the location form', error);
      void notifier.error('Could not open the form. Check your connection and try again.');
      return undefined;
    }

    const ref = dialog.open<LocationFormDialog, LocationFormDialogData, Location>(component, {
      data: { location },
      width: '40rem',
      maxWidth: '95vw',
      // Material focuses after the opening animation. The form marks the field to start in.
      autoFocus: '[data-autofocus]',
      restoreFocus: true,
    });
    return firstValueFrom(ref.afterClosed());
  };
}
