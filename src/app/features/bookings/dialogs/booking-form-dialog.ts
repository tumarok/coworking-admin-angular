import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  linkedSignal,
  signal,
} from '@angular/core';
import {
  disabled,
  form,
  FormField,
  FormRoot,
  metadata,
  REQUIRED,
  type TreeValidationResult,
  validate,
  validateStandardSchema,
} from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatFormField } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { Notifier } from '@core/notifications/notifier';
import { parseApiError } from '@shared/api/api-error';
import { type Booking, type BookingConflict, memberFullName } from '@shared/api/contract';
import { AutocompleteField } from '@shared/forms/autocomplete-field';
import { DateField } from '@shared/forms/date-field';
import { focusFirstInvalid } from '@shared/forms/focus-first-invalid';
import { type BannerLink, FormBanner } from '@shared/forms/form-banner';
import { AppFormField } from '@shared/forms/form-field';
import { formLevelMessages, hasBlockingErrors, serverErrors } from '@shared/forms/server-errors';
import { TimeField } from '@shared/forms/time-field';
import { visibleErrors } from '@shared/forms/visible-errors';
import { deepEqual } from '@shared/util/deep-equal';
import { formatTimeRange } from '@shared/util/format';
import { FALLBACK_TIME_ZONE } from '../booking-display';
import { injectCreateBooking, injectUpdateBooking } from '../data/booking-mutations';
import { injectLocationById } from '../data/location-queries';
import { injectMemberById, injectMemberSearch } from '../data/member-lookups';
import { injectRoomById, injectRoomSearch } from '../data/room-lookups';
import {
  type BookingFormStart,
  type BookingFormValues,
  bookingFormSchema,
  slotProblem,
  toBookingFormValues,
  toBookingInput,
} from './booking-form-values';

/** What the dialog is given: see {@link BookingFormStart}. */
export type BookingFormDialogData = BookingFormStart;

/** The API names the times of a booking `startsAt` and `endsAt`; the form's fields are these. */
const FORM_FIELDS_OF_API_KEYS = { startsAt: 'startTime', endsAt: 'endTime' };

const CONFLICT_MESSAGE = 'The room is already booked for this time.';

const seats = (count: number) => `${count} ${count === 1 ? 'seat' : 'seats'}`;

/**
 * The form that creates or edits a booking, in a dialog (opened by `injectBookingFormDialog`, which
 * loads this file only when it is needed). Closes with the saved booking.
 *
 * - **Choosing.** The room and the member are searched on the server as the person types (the
 *   first 20 matches of the rooms that can be booked and of the active members). A booking being
 *   edited, or a choice made in advance, shows its room and member even when they are not among
 *   those matches any more.
 * - **Time.** The day and the two clock times are read on the clock of the chosen room's location,
 *   not of the browser, and a hint under the day says which clock and the opening hours. Whether the
 *   end is after the start, within 8 hours, is judged on that clock too (a night when the clock is
 *   changed has more or fewer hours), and the seats of the room limit the attendees.
 * - **Validation.** The form's schema, which words the same problems as the contract's. Errors of a
 *   field show once it was touched (the end's also once the start or the day was, the attendees'
 *   also once the room was). Save waits for a form with no field errors that differs from where it
 *   started, and for the room's location to have arrived, as its clock is needed.
 * - **Refusals.** The request is silent, so the dialog words what the server said: a 422 puts each
 *   message under its field (`startsAt` under From, `endsAt` under To), a 409 for an overlap says
 *   so with links to the bookings in the way, anything else (no network) becomes a banner. The
 *   dialog stays open, focus moves to the first field with an error (the first field, for a banner)
 *   and an error goes away when its field is edited. A banner does not stop Save: a dropped
 *   connection deserves another try as the form is. The overlap goes away when the room, the day or
 *   a time changes, which are what it was about.
 */
@Component({
  selector: 'app-booking-form-dialog',
  imports: [
    AppFormField,
    AutocompleteField,
    DateField,
    FormBanner,
    FormField,
    FormRoot,
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatFormField,
    MatInput,
    TimeField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './booking-form-dialog.html',
  styleUrl: '../../../shared/forms/form-dialog.scss',
})
export class BookingFormDialog {
  private readonly data = inject<BookingFormDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<BookingFormDialog, Booking>>(MatDialogRef);
  private readonly notifier = inject(Notifier);
  private readonly injector = inject(Injector);
  private readonly create = injectCreateBooking();
  private readonly update = injectUpdateBooking();

  protected readonly title = this.data.booking ? 'Edit booking' : 'New booking';

  /** Where the form started; "changed" means different from this. */
  private readonly initial = toBookingFormValues(this.data);
  protected readonly model = signal<BookingFormValues>({ ...this.initial });

  // --- the room -----------------------------------------------------------------------------------
  protected readonly roomSearch = signal('');
  protected readonly rooms = injectRoomSearch(() => this.roomSearch());
  private readonly roomId = computed(() => this.model().roomId);
  private readonly listedRoom = computed(() =>
    this.rooms.value()?.items.find((room) => room.id === this.roomId()),
  );
  /** A chosen room the search does not list (an edit, a choice made in advance) is asked for. */
  private readonly askedRoom = injectRoomById(() =>
    this.listedRoom() ? undefined : this.roomId() || undefined,
  );
  private readonly room = computed(() => this.listedRoom() ?? this.askedRoom.value());
  protected readonly roomsFailed = computed(() => this.rooms.error() !== undefined);
  protected readonly roomOptions = computed(
    () =>
      this.rooms.value()?.items.map((room) => ({
        value: room.id,
        label: `${room.name} · ${room.locationName} (${seats(room.capacity)})`,
      })) ?? [],
  );
  protected readonly roomLabel = computed(() => {
    const room = this.room();
    if (room) return `${room.name} · ${room.locationName} (${seats(room.capacity)})`;
    if (this.askedRoom.error()) return 'Unknown room';
    const own = this.data.booking;
    return own?.roomId === this.roomId() ? own.roomName : '';
  });

  // --- the member ---------------------------------------------------------------------------------
  protected readonly memberSearch = signal('');
  protected readonly members = injectMemberSearch(() => this.memberSearch());
  private readonly memberId = computed(() => this.model().memberId);
  private readonly listedMember = computed(() =>
    this.members.value()?.items.find((member) => member.id === this.memberId()),
  );
  private readonly askedMember = injectMemberById(() =>
    this.listedMember() ? undefined : this.memberId() || undefined,
  );
  private readonly member = computed(() => this.listedMember() ?? this.askedMember.value());
  protected readonly membersFailed = computed(() => this.members.error() !== undefined);
  protected readonly memberOptions = computed(
    () =>
      this.members.value()?.items.map((member) => ({
        value: member.id,
        label: `${memberFullName(member)} · ${member.email}`,
      })) ?? [],
  );
  protected readonly memberLabel = computed(() => {
    const member = this.member();
    if (member) return `${memberFullName(member)} · ${member.email}`;
    if (this.askedMember.error()) return 'Unknown member';
    const own = this.data.booking;
    return own?.memberId === this.memberId() ? own.memberName : '';
  });

  // --- the clock ----------------------------------------------------------------------------------
  private readonly location = injectLocationById(() => this.room()?.locationId);
  /**
   * The time zone the times are read in: the chosen room's location's. The booking being edited
   * brings its own, which holds while its room is still the chosen one. `undefined` while it is
   * not known, which keeps Save from sending times read on the wrong clock.
   */
  private readonly timeZone = computed(
    () =>
      this.location.value()?.timezone ??
      (this.roomId() === this.initial.roomId ? this.data.timeZone : undefined),
  );
  /** The clock to judge the times on before the room says: the span between them barely differs. */
  private readonly checkZone = computed(() => this.timeZone() ?? FALLBACK_TIME_ZONE);
  protected readonly dateHint = computed(() => {
    const location = this.location.value();
    if (location) {
      return `${location.name} local time (${location.timezone}), open ${location.opensAt}–${location.closesAt}`;
    }
    return this.location.error()
      ? 'The location of this room could not be loaded. Close the form and try again.'
      : undefined;
  });

  protected readonly form = form(
    this.model,
    (path) => {
      validateStandardSchema(path, bookingFormSchema);
      validate(path.endTime, (field) => {
        const message = slotProblem(
          {
            date: field.valueOf(path.date),
            startTime: field.valueOf(path.startTime),
            endTime: field.valueOf(path.endTime),
          },
          this.checkZone(),
        );
        return message ? { kind: 'slot', message } : undefined;
      });
      validate(path.attendees, ({ value }) => {
        const room = this.room();
        const people = value();
        return room && people !== null && people > room.capacity
          ? { kind: 'capacity', message: `This room seats up to ${room.capacity}` }
          : undefined;
      });
      // The fields rest while the request runs: nothing to edit under an answer on its way.
      disabled(path, { when: () => this.pending() });
      // Marked required without a second validator: the schema already words the message.
      for (const field of [path.roomId, path.memberId, path.date]) {
        metadata(field, REQUIRED, () => true);
      }
      metadata(path.attendees, REQUIRED, () => true);
    },
    {
      // Signal Forms would refuse to send a form that has any error, including a server's refusal
      // of the last attempt. `save` decides instead, by `hasBlockingErrors`.
      submission: { action: () => this.save(), ignoreValidators: 'all' },
    },
  );

  protected readonly pending = computed(() => this.create.isPending() || this.update.isPending());
  private readonly changed = computed(() => !deepEqual(this.model(), this.initial));
  /** A refusal of the whole attempt (a 409, a dropped connection) does not stop another try. */
  protected readonly canSave = computed(
    () =>
      !hasBlockingErrors(this.form) &&
      this.changed() &&
      !this.pending() &&
      this.timeZone() !== undefined,
  );

  /** The bookings that were in the way of the last attempt, until what it was about changes. */
  protected readonly conflicts = linkedSignal<string, readonly BookingConflict[]>({
    source: computed(() => {
      const { roomId, date, startTime, endTime } = this.model();
      return [roomId, date, startTime, endTime].join('|');
    }),
    computation: () => [],
  });
  private readonly failures = computed(() => formLevelMessages(this.form));
  protected readonly banner = computed(() =>
    this.conflicts().length > 0 ? [CONFLICT_MESSAGE] : this.failures(),
  );
  protected readonly conflictLinks = computed<readonly BannerLink[]>(() =>
    this.conflicts().map((conflict) => ({
      label: formatTimeRange(conflict.startsAt, conflict.endsAt, this.checkZone()),
      link: ['/bookings', conflict.id],
    })),
  );

  protected readonly visibleErrors = visibleErrors;

  constructor() {
    // Closing in the middle of a save would lose its answer: wait for it.
    effect(() => {
      this.ref.disableClose = this.pending();
    });
  }

  /**
   * Save is disabled for an invalid form, and a browser does not submit through a disabled button,
   * so Enter would do nothing. It shows what is wrong instead. An Enter that chose an option of a
   * list has been answered already.
   */
  protected revealErrors(event: Event): void {
    if (
      !event.defaultPrevented &&
      event.target instanceof HTMLInputElement &&
      hasBlockingErrors(this.form)
    ) {
      this.revealProblems();
    }
  }

  private revealProblems(): void {
    this.form().markAsTouched();
    focusFirstInvalid(this.form);
  }

  private async save(): Promise<TreeValidationResult> {
    if (hasBlockingErrors(this.form)) {
      this.revealProblems();
      return;
    }
    if (!this.changed()) return;
    const timeZone = this.timeZone();
    // Cannot fail once the form has no field error: the clock is known and the times are read.
    // Parsing also trims the notes and turns an empty note into `null`.
    const input = timeZone ? toBookingInput(this.model(), timeZone) : undefined;
    if (!timeZone || !input) return;
    try {
      const saved = this.data.booking
        ? await this.update.run({ id: this.data.booking.id, input })
        : await this.create.run(input);
      const when = formatTimeRange(saved.startsAt, saved.endsAt, timeZone);
      void this.notifier.success(
        `Booking ${this.data.booking ? 'updated' : 'created'}: ${saved.roomName}, ${when}`,
      );
      this.ref.close(saved);
      return;
    } catch (error) {
      // The fields were disabled while the request ran, which dropped the focus. They are enabled
      // again after the next render, and focus goes to the first field with an error, or to the
      // first field when the refusal names none.
      afterNextRender(
        () => {
          focusFirstInvalid(this.form);
        },
        { injector: this.injector },
      );
      const refusal = parseApiError(error);
      this.conflicts.set(refusal.status === 409 ? refusal.conflicts : []);
      return serverErrors(this.form, refusal, FORM_FIELDS_OF_API_KEYS);
    }
  }
}
