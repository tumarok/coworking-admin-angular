import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
} from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Notifier } from '@core/notifications/notifier';
import { type Booking, BOOKING_TRANSITIONS, type BookingStatus } from '@shared/api/contract';
import { ConfirmDialog } from '@shared/ui/confirm-dialog';
import { STATUS_ACTIONS, type StatusAction, statusChanged } from '../booking-options';
import { injectChangeBookingStatus } from '../data/booking-mutations';

/**
 * The buttons that move a booking to the statuses `BOOKING_TRANSITIONS` allows from its current
 * one, and none for a booking that has ended. Cancelling asks first. While a move runs, its button
 * shows that it is busy (and keeps focus) and the others are disabled, so two moves cannot cross.
 *
 * A success is told in a snackbar, and the booking, which the move made stale, reloads wherever it
 * is shown. A refusal (409: the booking has moved on since the page loaded) is told by the error
 * interceptor, and the buttons stay as they were.
 */
@Component({
  selector: 'app-booking-status-actions',
  imports: [MatButton, MatProgressSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // While a button shows its progress, Material hides its text (`visibility: hidden`), which takes
  // the name away: the label names it then.
  template: `
    @for (action of actions(); track action.status) {
      <button
        type="button"
        [matButton]="action.appearance"
        [class.warning]="action.tone === 'warning'"
        [class.danger]="action.tone === 'danger'"
        [showProgress]="moving() === action.status"
        [disabled]="busy() && moving() !== action.status"
        [attr.aria-busy]="moving() === action.status ? 'true' : null"
        [attr.aria-label]="moving() === action.status ? action.label : null"
        (click)="move(action)"
      >
        <mat-progress-spinner progressIndicator mode="indeterminate" diameter="20" />
        {{ action.label }}
      </button>
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    .warning {
      --mat-button-outlined-label-text-color: var(--status-warning-txt);
      --mat-button-outlined-outline-color: var(--status-warning-clr);
    }

    .danger {
      --mat-button-outlined-label-text-color: var(--mat-sys-error);
      --mat-button-outlined-outline-color: var(--mat-sys-error);
    }
  `,
})
export class BookingStatusActions {
  readonly booking = input.required<Booking>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly confirmDialog = inject(ConfirmDialog);
  private readonly notifier = inject(Notifier);
  private readonly change = injectChangeBookingStatus();

  protected readonly busy = this.change.isPending;
  /** The status the running move leads to. */
  protected readonly moving = signal<BookingStatus | undefined>(undefined);
  protected readonly actions = computed(() =>
    BOOKING_TRANSITIONS[this.booking().status].flatMap((status) => STATUS_ACTIONS[status] ?? []),
  );

  /** A move has gone through, and the booking it made stale has not arrived yet. */
  private awaitingNextStatus = false;

  constructor() {
    // The button that was pressed is gone with the old status, and focus with it. It goes to the
    // first move of the new status instead, once the booking has reloaded and the buttons changed.
    effect(() => {
      this.actions();
      if (!this.awaitingNextStatus) return;
      this.awaitingNextStatus = false;
      afterNextRender(
        () => {
          this.host.nativeElement.querySelector('button')?.focus();
        },
        { injector: this.injector },
      );
    });
  }

  protected async move(action: StatusAction): Promise<void> {
    if (this.busy()) return;
    if (action.confirmation && !(await this.confirmDialog.confirm(action.confirmation))) return;

    this.moving.set(action.status);
    try {
      await this.change.run({ id: this.booking().id, status: action.status });
    } catch {
      // The error interceptor has told the person why, and the buttons stay for another try.
      return;
    } finally {
      this.moving.set(undefined);
    }
    this.awaitingNextStatus = true;
    void this.notifier.success(statusChanged(action.status));
  }
}
