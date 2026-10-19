import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import type { BulkBookingAction } from '@shared/api/contract';
import { ConfirmDialog } from '@shared/ui/confirm-dialog';
import { bulkCancelConfirmation } from '../booking-options';

/**
 * What can be done with the bookings ticked in the list: how many there are ("3 selected", in a
 * live region that is always present, so a screen reader hears the count change) and the two
 * actions, which are there only while something is selected. Confirming goes at once;
 * cancelling asks first, naming the number. The bar only reports the choice (`run`): the page sends
 * the request, and says which action is under way (`running`).
 *
 * While a request runs both buttons are disabled but stay focusable, so focus is not thrown out of
 * the bar, and the one that is running shows its progress.
 */
@Component({
  selector: 'app-bulk-actions-bar',
  imports: [MatButton, MatProgressSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The live region is always there, empty until something is selected: a region that appears
  // with its text is often not announced. While a button shows its progress, Material hides its
  // text (`visibility: hidden`), so the buttons are named by a label that holds either way.
  template: `
    <p role="status" class="count">
      @if (count() > 0) {
        {{ count() }} selected
      }
    </p>
    @if (count() > 0) {
      <div class="actions">
        <button
          type="button"
          matButton="filled"
          aria-label="Confirm selected bookings"
          disabledInteractive
          [showProgress]="running() === 'confirm'"
          [disabled]="busy()"
          [attr.aria-busy]="running() === 'confirm' ? 'true' : null"
          (click)="confirm()"
        >
          <mat-progress-spinner progressIndicator mode="indeterminate" diameter="20" />
          Confirm
        </button>
        <button
          type="button"
          matButton="outlined"
          class="danger"
          aria-label="Cancel selected bookings"
          disabledInteractive
          [showProgress]="running() === 'cancel'"
          [disabled]="busy()"
          [attr.aria-busy]="running() === 'cancel' ? 'true' : null"
          (click)="cancel()"
        >
          <mat-progress-spinner progressIndicator mode="indeterminate" diameter="20" />
          Cancel
        </button>
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem 1rem;
      min-height: 2.5rem;
    }

    .count {
      margin: 0;
      font: var(--mat-sys-title-small);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .danger {
      --mat-button-outlined-label-text-color: var(--mat-sys-error);
      --mat-button-outlined-outline-color: var(--mat-sys-error);
    }
  `,
})
export class BulkActionsBar {
  /** How many bookings are selected. */
  readonly count = input.required<number>();
  /** The action whose request is under way, if any. */
  readonly running = input<BulkBookingAction>();

  /** The action to carry out; a cancellation arrives only once the person has agreed to it. */
  readonly run = output<BulkBookingAction>();

  private readonly confirmDialog = inject(ConfirmDialog);

  protected readonly busy = computed(() => this.running() !== undefined);

  protected confirm(): void {
    // A disabled-but-focusable button still reports clicks, so the bar does not rely on it.
    if (!this.busy()) this.run.emit('confirm');
  }

  protected async cancel(): Promise<void> {
    if (this.busy()) return;
    const agreed = await this.confirmDialog.confirm(bulkCancelConfirmation(this.count()));
    // The selection can go while the question is open (the list changed under it): nothing to cancel.
    if (agreed && this.count() > 0) this.run.emit('cancel');
  }
}
