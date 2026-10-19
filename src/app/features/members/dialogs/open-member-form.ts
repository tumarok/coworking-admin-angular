import { inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Notifier } from '@core/notifications/notifier';
import type { Member } from '@shared/api/contract';
import { firstValueFrom } from 'rxjs';
import type { MemberFormDialog, MemberFormDialogData } from './member-form-dialog';

/**
 * Returns the function that opens the member form: pass the member to edit, or nothing for a
 * new one. It resolves with the saved member, or `undefined` when the dialog was dismissed.
 * Call it in an injection context. `load` is how the form's code is fetched; it is a parameter so a
 * failed download can be tried out in a test.
 *
 * The form is loaded when it is first opened (the dynamic `import`), so the pages that open it do
 * not carry the selects and the contract's schema it uses. The dialog's options are given here,
 * whole: Material takes a config as it is and does not merge it with defaults.
 */
export function injectMemberFormDialog(
  load: () => Promise<{ MemberFormDialog: typeof MemberFormDialog }> = () =>
    import('./member-form-dialog'),
): (member?: Member) => Promise<Member | undefined> {
  const dialog = inject(MatDialog);
  const notifier = inject(Notifier);

  return async (member) => {
    let component: typeof MemberFormDialog;
    try {
      component = (await load()).MemberFormDialog;
    } catch (error) {
      console.error('Cannot load the member form', error);
      void notifier.error('Could not open the form. Check your connection and try again.');
      return undefined;
    }

    const ref = dialog.open<MemberFormDialog, MemberFormDialogData, Member>(component, {
      data: { member },
      width: '40rem',
      maxWidth: '95vw',
      // Material focuses after the opening animation. The form marks the field to start in.
      autoFocus: '[data-autofocus]',
      restoreFocus: true,
    });
    return firstValueFrom(ref.afterClosed());
  };
}
