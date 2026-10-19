import { Location } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import {
  disabled,
  form,
  FormField,
  FormRoot,
  metadata,
  REQUIRED,
  validateStandardSchema,
} from '@angular/forms/signals';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatSuffix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { ActivatedRoute, Router } from '@angular/router';
import { readReturnUrl } from '@core/auth/return-url';
import { SessionStore } from '@core/auth/session-store';
import { APP_NAME } from '@core/layout/app-name';
import { parseApiError } from '@shared/api/api-error';
import { loginRequestSchema } from '@shared/api/contract';
import { AppFormField } from '@shared/forms/form-field';
import { AppIcon } from '@shared/ui/app-icon';

interface LoginValues {
  email: string;
  password: string;
}

/**
 * The sign-in page. The server's answer to a wrong password is shown above the fields and goes
 * away with the first edit, so it never contradicts what is in the form. Field errors wait until
 * the field has been touched.
 */
@Component({
  selector: 'app-login-page',
  imports: [
    AppFormField,
    AppIcon,
    FormField,
    FormRoot,
    MatButton,
    MatFormField,
    MatIconButton,
    MatInput,
    MatSuffix,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage {
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly injector = inject(Injector);

  protected readonly appName = APP_NAME;
  protected readonly model = signal<LoginValues>({ email: '', password: '' });
  protected readonly loginForm = form(
    this.model,
    (path) => {
      // The contract's own schema: the form and the API agree on what a valid sign-in is.
      validateStandardSchema(path, loginRequestSchema);
      // Shown as required without a second validator: the schema already words the message.
      metadata(path.email, REQUIRED, () => true);
      metadata(path.password, REQUIRED, () => true);
      disabled(path, { when: () => this.session.loginPending() });
    },
    { submission: { action: () => this.signIn() } },
  );

  /** Why the API refused the sign-in; cleared as soon as the form changes. */
  protected readonly failure = linkedSignal<LoginValues, string | null>({
    source: this.model,
    computation: () => null,
  });
  protected readonly passwordShown = signal(false);

  private readonly emailInput = viewChild.required('emailInput', { read: ElementRef });
  private readonly passwordInput = viewChild.required('passwordInput', { read: ElementRef });

  constructor() {
    // The `autofocus` attribute only works on a page load, not when the router shows the page.
    afterNextRender(() => {
      (this.emailInput().nativeElement as HTMLElement).focus();
    });
  }

  /**
   * The button stays disabled while the form is invalid, and a browser does not submit a form
   * through a disabled button, so Enter would do nothing. It shows what is wrong instead.
   */
  protected revealErrors(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.loginForm().markAsTouched();
  }

  private async signIn(): Promise<void> {
    this.failure.set(null);
    try {
      await this.session.login(this.model());
    } catch (error) {
      this.failure.set(parseApiError(error).message);
      // The fields were disabled while the request ran, which dropped the focus. They are enabled
      // again after the next render, and the password is what the visitor will retype.
      afterNextRender(
        () => {
          (this.passwordInput().nativeElement as HTMLElement).focus();
        },
        { injector: this.injector },
      );
      return;
    }
    const target = readReturnUrl(this.location.getState(), this.route.snapshot.queryParams);
    await this.router.navigateByUrl(target ?? '/', { replaceUrl: true });
  }
}
