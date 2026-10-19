import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The message above a form's fields for what is wrong with the form as a whole: the server refused
 * the request, or its answer names no field. Nothing is drawn without a message. It is an alert, so
 * a screen reader announces it when it appears.
 */
@Component({
  selector: 'app-form-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (messages().length > 0) {
      <div class="banner" role="alert">
        @for (message of messages(); track $index) {
          <p>{{ message }}</p>
        }
      </div>
    }
  `,
  styles: `
    .banner {
      padding: 0.75rem 1rem;
      border-radius: var(--mat-sys-corner-small);
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
      font: var(--mat-sys-body-medium);
    }

    p {
      margin: 0;
    }

    p + p {
      margin-top: 0.25rem;
    }
  `,
})
export class FormBanner {
  readonly messages = input.required<readonly string[]>();
}
