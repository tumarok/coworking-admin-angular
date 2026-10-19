import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
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
  validateStandardSchema,
} from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatOption } from '@angular/material/core';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatFormField, MatPrefix, MatSuffix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelect } from '@angular/material/select';
import { Notifier } from '@core/notifications/notifier';
import { parseApiError } from '@shared/api/api-error';
import type { Room } from '@shared/api/contract';
import { focusFirstInvalid } from '@shared/forms/focus-first-invalid';
import { FormBanner } from '@shared/forms/form-banner';
import { AppFormField } from '@shared/forms/form-field';
import { formLevelMessages, hasBlockingErrors, serverErrors } from '@shared/forms/server-errors';
import { visibleErrors } from '@shared/forms/visible-errors';
import type { SelectOption } from '@shared/ui/select-option';
import { deepEqual } from '@shared/util/deep-equal';
import { injectLocationOptions } from '../data/location-options';
import { injectCreateRoom, injectUpdateRoom } from '../data/room-mutations';
import { hasLocation } from '../room-location';
import { AMENITY_OPTIONS, STATUS_OPTIONS, TYPE_OPTIONS } from '../room-options';
import { type RoomFormValues, roomFormSchema, toRoomFormValues } from './room-form-values';

export interface RoomFormDialogData {
  /** The room to edit; none for a new one. */
  room?: Room;
}

/**
 * The form that creates or edits a room, in a dialog (opened by `injectRoomFormDialog`, which loads
 * this file only when it is needed). Closes with the saved room.
 *
 * - **Validation.** The contract's own schema, adjusted where the form differs from the API (the
 *   rate is typed in euros, see `roomFormSchema`). Errors of a field show once it was touched. Save
 *   waits for a form with no field errors that differs from where it started.
 * - **Location.** Chosen from the locations the API lists. A room whose location is not among them
 *   (past the first page) keeps its own as a choice, so editing it does not blank the field.
 * - **Refusals.** The request is silent, so the dialog words what the server said: a 422 puts each
 *   message under its field, anything else (a 409, no network) becomes a banner. The dialog stays
 *   open, focus moves to the first field with an error (the first field, for a banner), and an
 *   error goes away when its field is edited (the banner, when anything is). A banner does not stop
 *   Save: a dropped connection or a 502 deserves another try as the form is.
 */
@Component({
  selector: 'app-room-form-dialog',
  imports: [
    AppFormField,
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
    MatOption,
    MatPrefix,
    MatSelect,
    MatSuffix,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './room-form-dialog.html',
  styleUrl: '../../../shared/forms/form-dialog.scss',
})
export class RoomFormDialog {
  private readonly data = inject<RoomFormDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<RoomFormDialog, Room>>(MatDialogRef);
  private readonly notifier = inject(Notifier);
  private readonly injector = inject(Injector);
  private readonly create = injectCreateRoom();
  private readonly update = injectUpdateRoom();
  private readonly knownLocations = injectLocationOptions();

  protected readonly title = this.data.room ? `Edit ${this.data.room.name}` : 'New room';
  protected readonly types = TYPE_OPTIONS;
  protected readonly statuses = STATUS_OPTIONS;
  protected readonly amenities = AMENITY_OPTIONS;
  protected readonly locationsFailed = computed(() => this.knownLocations.error() !== undefined);

  protected readonly locations = computed<readonly SelectOption[]>(() => {
    const options = this.knownLocations.options();
    const room = this.data.room;
    const missing =
      room && hasLocation(room) && !options.some((option) => option.value === room.locationId);
    return missing ? [{ value: room.locationId, label: room.locationName }, ...options] : options;
  });

  /** Where the form started; "changed" means different from this. */
  private readonly initial = toRoomFormValues(this.data.room);
  protected readonly model = signal<RoomFormValues>({ ...this.initial });
  protected readonly form = form(
    this.model,
    (path) => {
      validateStandardSchema(path, roomFormSchema);
      // The fields rest while the request runs: nothing to edit under an answer on its way.
      disabled(path, { when: () => this.pending() });
      // Marked required without a second validator: the schema already words the message.
      for (const field of [path.locationId, path.name]) metadata(field, REQUIRED, () => true);
      metadata(path.capacity, REQUIRED, () => true);
      metadata(path.hourlyRate, REQUIRED, () => true);
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
    () => !hasBlockingErrors(this.form) && this.changed() && !this.pending(),
  );
  /** What the server said about the form as a whole. */
  protected readonly failures = computed(() => formLevelMessages(this.form));

  protected readonly visibleErrors = visibleErrors;

  constructor() {
    // Closing in the middle of a save would lose its answer: wait for it.
    effect(() => {
      this.ref.disableClose = this.pending();
    });
  }

  /**
   * Save is disabled for an invalid form, and a browser does not submit through a disabled button,
   * so Enter would do nothing. It shows what is wrong instead.
   */
  protected revealErrors(event: Event): void {
    if (event.target instanceof HTMLInputElement && hasBlockingErrors(this.form)) {
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
    // Cannot fail: the form has no schema error. Parsing also trims the text and turns the euros
    // of the rate into the cents the API takes.
    const input = roomFormSchema.parse(this.model());
    try {
      const saved = this.data.room
        ? await this.update.run({ id: this.data.room.id, input })
        : await this.create.run(input);
      void this.notifier.success(`Room ${this.data.room ? 'updated' : 'created'}: ${saved.name}`);
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
      return serverErrors(this.form, parseApiError(error));
    }
  }
}
