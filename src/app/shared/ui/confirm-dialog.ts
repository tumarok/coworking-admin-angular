import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import {
  ConfirmDialogContent,
  type ConfirmDialogData,
  type ConfirmOptions,
} from './confirm-dialog-content';

/**
 * Asks a yes/no question and answers with a promise: `true` only when the person confirmed.
 * Escape, a click outside and the cancel button all answer `false`.
 *
 * ```ts
 * if (await this.confirmDialog.confirm({ title: 'Delete room?', confirmLabel: 'Delete', danger: true })) { … }
 * ```
 *
 * It is an alert dialog (the person has to answer before going on), focus starts on the safe
 * answer for a dangerous question and on the confirm button otherwise, and returns to the control
 * that asked.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmDialog {
  private readonly dialog = inject(MatDialog);
  private opened = 0;

  async confirm(options: ConfirmOptions): Promise<boolean> {
    const messageId = `confirm-dialog-message-${++this.opened}`;
    const ref = this.dialog.open<ConfirmDialogContent, ConfirmDialogData, boolean>(
      ConfirmDialogContent,
      {
        data: { ...options, messageId },
        role: 'alertdialog',
        ariaDescribedBy: options.message ? messageId : null,
        width: '28rem',
        maxWidth: '95vw',
        // Material focuses after the opening animation; a selector picks the answer to start on.
        autoFocus: '[data-autofocus]',
        restoreFocus: true,
      },
    );
    return (await firstValueFrom(ref.afterClosed())) === true;
  }
}
