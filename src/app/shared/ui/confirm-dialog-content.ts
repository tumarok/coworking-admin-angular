import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** The label of the button that agrees. Say what it does: "Delete", not "OK". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** For an action that cannot be undone: the confirm button is red and focus starts on Cancel. */
  danger?: boolean;
}

/** What the dialog receives: the options plus the id its message carries, for `aria-describedby`. */
export type ConfirmDialogData = ConfirmOptions & { messageId: string };

/** The dialog `ConfirmDialog` opens; closes with `true` on confirm and `false` otherwise. */
@Component({
  selector: 'app-confirm-dialog-content',
  imports: [MatButton, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ options.title }}</h2>
    @if (options.message) {
      <mat-dialog-content [id]="options.messageId">{{ options.message }}</mat-dialog-content>
    }
    <mat-dialog-actions align="end">
      <button
        mat-button
        type="button"
        [mat-dialog-close]="false"
        [attr.data-autofocus]="options.danger ? '' : null"
      >
        {{ options.cancelLabel ?? 'Cancel' }}
      </button>
      <button
        mat-flat-button
        type="button"
        [class.danger]="options.danger"
        [mat-dialog-close]="true"
        [attr.data-autofocus]="options.danger ? null : ''"
      >
        {{ options.confirmLabel ?? 'Confirm' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .danger {
      --mat-button-filled-container-color: var(--mat-sys-error);
      --mat-button-filled-label-text-color: var(--mat-sys-on-error);
    }
  `,
})
export class ConfirmDialogContent {
  protected readonly options = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}
