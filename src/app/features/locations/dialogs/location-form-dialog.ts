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
import { MatFormField } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelect } from '@angular/material/select';
import { Notifier } from '@core/notifications/notifier';
import { parseApiError } from '@shared/api/api-error';
import { type Location, locationInputSchema } from '@shared/api/contract';
import { focusFirstInvalid } from '@shared/forms/focus-first-invalid';
import { FormBanner } from '@shared/forms/form-banner';
import { AppFormField } from '@shared/forms/form-field';
import { formLevelMessages, hasBlockingErrors, serverErrors } from '@shared/forms/server-errors';
import { TimeField } from '@shared/forms/time-field';
import { visibleErrors } from '@shared/forms/visible-errors';
import { deepEqual } from '@shared/util/deep-equal';
import { injectCreateLocation, injectUpdateLocation } from '../data/location-mutations';
import { STATUS_OPTIONS, TIMEZONE_OPTIONS } from '../location-options';
import { type LocationFormValues, toLocationFormValues } from './location-form-values';

export interface LocationFormDialogData {
  /** The location to edit; none for a new one. */
  location?: Location;
}

/**
 * The form that creates or edits a location, in a dialog (opened by `injectLocationFormDialog`,
 * which loads this file only when it is needed). Closes with the saved location.
 *
 * - **Validation.** The contract's own schema, so the form and the API agree; errors of a field show
 *   once it was touched (the closing time's also once the opening time was). Save waits for a form
 *   with no field errors that differs from where it started.
 * - **Refusals.** The request is silent, so the dialog words what the server said: a 422 puts each
 *   message under its field, anything else (a 409, no network) becomes a banner. The dialog stays
 *   open, focus moves to the first field with an error (the first field, for a banner), and an
 *   error goes away when its field is edited (the banner, when anything is). A banner does not stop
 *   Save: a dropped connection or a 502 deserves another try as the form is.
 */
@Component({
  selector: 'app-location-form-dialog',
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
    MatSelect,
    TimeField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './location-form-dialog.html',
  styleUrl: './location-form-dialog.scss',
})
export class LocationFormDialog {
  private readonly data = inject<LocationFormDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<LocationFormDialog, Location>>(MatDialogRef);
  private readonly notifier = inject(Notifier);
  private readonly injector = inject(Injector);
  private readonly create = injectCreateLocation();
  private readonly update = injectUpdateLocation();

  protected readonly title = this.data.location
    ? `Edit ${this.data.location.name}`
    : 'New location';
  protected readonly timezones = TIMEZONE_OPTIONS;
  protected readonly statuses = STATUS_OPTIONS;

  /** Where the form started; "changed" means different from this. */
  private readonly initial = toLocationFormValues(this.data.location);
  protected readonly model = signal<LocationFormValues>({ ...this.initial });
  protected readonly form = form(
    this.model,
    (path) => {
      validateStandardSchema(path, locationInputSchema);
      // The fields rest while the request runs: nothing to edit under an answer on its way.
      disabled(path, { when: () => this.pending() });
      // Marked required without a second validator: the schema already words the message.
      for (const field of [path.name, path.city, path.address, path.opensAt, path.closesAt]) {
        metadata(field, REQUIRED, () => true);
      }
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
    // Cannot fail: the form has no schema error. Parsing also applies the schema's trimming.
    const input = locationInputSchema.parse(this.model());
    try {
      const saved = this.data.location
        ? await this.update.run({ id: this.data.location.id, input })
        : await this.create.run(input);
      void this.notifier.success(
        `Location ${this.data.location ? 'updated' : 'created'}: ${saved.name}`,
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
      return serverErrors(this.form, parseApiError(error));
    }
  }
}
