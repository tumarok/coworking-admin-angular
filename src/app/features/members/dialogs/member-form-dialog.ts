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
import { type Member, memberFullName } from '@shared/api/contract';
import { focusFirstInvalid } from '@shared/forms/focus-first-invalid';
import { FormBanner } from '@shared/forms/form-banner';
import { AppFormField } from '@shared/forms/form-field';
import { formLevelMessages, hasBlockingErrors, serverErrors } from '@shared/forms/server-errors';
import { visibleErrors } from '@shared/forms/visible-errors';
import { deepEqual } from '@shared/util/deep-equal';
import { injectCreateMember, injectUpdateMember } from '../data/member-mutations';
import { PLAN_OPTIONS, STATUS_OPTIONS } from '../member-options';
import { type MemberFormValues, memberFormSchema, toMemberFormValues } from './member-form-values';

export interface MemberFormDialogData {
  /** The member to edit; none for a new one. */
  member?: Member;
}

/**
 * The form that creates or edits a member, in a dialog (opened by `injectMemberFormDialog`, which
 * loads this file only when it is needed). Closes with the saved member.
 *
 * - **Validation.** The contract's own schema, adjusted where the form differs from the API (an
 *   empty company is sent as `null`, see `memberFormSchema`). Errors of a field show once it was
 *   touched. Save waits for a form with no field errors that differs from where it started.
 * - **Refusals.** The request is silent, so the dialog words what the server said: a 422 puts each
 *   message under its field (an email that is already registered, under Email), anything else (a
 *   409, no network) becomes a banner. The dialog stays open, focus moves to the first field with
 *   an error (the first field, for a banner), and an error goes away when its field is edited (the
 *   banner, when anything is). A banner does not stop Save: a dropped connection or a 502 deserves
 *   another try as the form is.
 * - **Autocomplete** is off on the personal fields: the person typing is not the member, so the
 *   browser's own details would be the wrong ones.
 */
@Component({
  selector: 'app-member-form-dialog',
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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './member-form-dialog.html',
  styleUrl: '../../../shared/forms/form-dialog.scss',
})
export class MemberFormDialog {
  private readonly data = inject<MemberFormDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<MemberFormDialog, Member>>(MatDialogRef);
  private readonly notifier = inject(Notifier);
  private readonly injector = inject(Injector);
  private readonly create = injectCreateMember();
  private readonly update = injectUpdateMember();

  protected readonly title = this.data.member
    ? `Edit ${memberFullName(this.data.member)}`
    : 'New member';
  protected readonly plans = PLAN_OPTIONS;
  protected readonly statuses = STATUS_OPTIONS;

  /** Where the form started; "changed" means different from this. */
  private readonly initial = toMemberFormValues(this.data.member);
  protected readonly model = signal<MemberFormValues>({ ...this.initial });
  protected readonly form = form(
    this.model,
    (path) => {
      validateStandardSchema(path, memberFormSchema);
      // The fields rest while the request runs: nothing to edit under an answer on its way.
      disabled(path, { when: () => this.pending() });
      // Marked required without a second validator: the schema already words the message.
      for (const field of [path.firstName, path.lastName, path.email, path.phone]) {
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
    // Cannot fail: the form has no schema error. Parsing also trims the text and turns an empty
    // company into the `null` the API takes.
    const input = memberFormSchema.parse(this.model());
    try {
      const saved = this.data.member
        ? await this.update.run({ id: this.data.member.id, input })
        : await this.create.run(input);
      void this.notifier.success(
        `Member ${this.data.member ? 'updated' : 'added'}: ${memberFullName(saved)}`,
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
