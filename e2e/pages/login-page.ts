import type { Locator, Page } from '@playwright/test';

export class LoginPage {
  readonly heading: Locator;
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  /** The refusal of the sign-in, shown inside the form. */
  readonly failure: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Sign in', level: 1 });
    this.email = page.getByRole('textbox', { name: 'Email' });
    // Exact, because the show/hide button is named "Show password".
    this.password = page.getByRole('textbox', { name: 'Password', exact: true });
    this.submit = page.getByRole('button', { name: /^Sign in/ });
    this.failure = page.getByRole('alert');
  }

  async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }
}
