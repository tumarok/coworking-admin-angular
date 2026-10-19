import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** A record the message points to: where it is, and what the person reads. */
export interface BannerLink {
  label: string;
  /** A route of the app, such as `['/bookings', id]`. */
  link: string | readonly string[];
}

/**
 * The message above a form's fields for what is wrong with the form as a whole: the server refused
 * the request, or its answer names no field. Nothing is drawn without a message. It is an alert, so
 * a screen reader announces it when it appears.
 *
 * `links` lists records the message is about (the bookings in the way). They open in a new tab, so
 * the form and what was typed in it stay; the messages are then the list's lead-in and read bold.
 */
@Component({
  selector: 'app-form-banner',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (messages().length > 0) {
      <div class="banner" role="alert">
        @for (message of messages(); track $index) {
          <p [class.lead]="links().length > 0">{{ message }}</p>
        }
        @if (links().length > 0) {
          <ul>
            @for (item of links(); track $index) {
              <li>
                <a [routerLink]="item.link" target="_blank" rel="noopener">
                  {{ item.label }} <span class="visually-hidden">(opens in a new tab)</span>
                </a>
              </li>
            }
          </ul>
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

    .lead {
      font-weight: 700;
    }

    ul {
      margin: 0.25rem 0 0;
      padding-inline-start: 1.25rem;
    }

    a {
      color: inherit;
    }
  `,
})
export class FormBanner {
  readonly messages = input.required<readonly string[]>();
  readonly links = input<readonly BannerLink[]>([]);
}
