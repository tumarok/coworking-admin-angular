import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import type { BulkBookingAction } from '@shared/api/contract';
import { BULK_DONE } from '../booking-options';

/** A booking the bulk action could not move, named before the request went out. */
export interface BulkFailure {
  id: string;
  /** What names the booking for a person: its room and time, or the id when nothing else is known. */
  label: string;
  /** The server's reason. */
  reason: string;
}

export interface BulkResultDialogData {
  action: BulkBookingAction;
  failures: readonly BulkFailure[];
}

/**
 * Tells which bookings a bulk action left as they were, and why. Each is a link to its page; going
 * there closes the dialog, which Material would not do on its own for a route change. A click that
 * opens the link elsewhere (a new tab, a new window) leaves the dialog where it is.
 */
@Component({
  selector: 'app-bulk-result-dialog',
  imports: [
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Some bookings were not {{ done }}</h2>
    <mat-dialog-content>
      <ul class="failures">
        @for (failure of data.failures; track failure.id) {
          <li>
            <a [routerLink]="['/bookings', failure.id]" (click)="followed($event)">{{
              failure.label
            }}</a>
            <span class="reason">{{ failure.reason }}</span>
          </li>
        }
      </ul>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button type="button" mat-dialog-close data-autofocus>Close</button>
    </mat-dialog-actions>
  `,
  styles: `
    .failures {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    li {
      padding-block: 0.5rem;
    }

    li + li {
      border-top: 1px solid var(--mat-sys-outline-variant);
    }

    .reason {
      display: block;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class BulkResultDialog {
  protected readonly data = inject<BulkResultDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<BulkResultDialog>>(MatDialogRef);

  protected readonly done = BULK_DONE[this.data.action];

  protected followed(event: MouseEvent): void {
    if (
      event.button === 0 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      this.ref.close();
    }
  }
}
