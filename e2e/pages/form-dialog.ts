import { expect, type Locator, type Page } from '@playwright/test';

/** What every form dialog has: a title, Save and Cancel, errors under fields and a banner. */
export abstract class FormDialog {
  readonly dialog: Locator;
  readonly save: Locator;
  readonly cancel: Locator;
  /** Messages that are about the form as a whole, and the errors under its fields. */
  readonly alerts: Locator;

  constructor(
    protected readonly page: Page,
    title: string | RegExp,
  ) {
    this.dialog = page.getByRole('dialog', { name: title });
    this.save = this.dialog.getByRole('button', { name: /^(Save|Saving…)$/ });
    this.cancel = this.dialog.getByRole('button', { name: 'Cancel', exact: true });
    this.alerts = this.dialog.getByRole('alert');
  }

  alert(text: string | RegExp): Locator {
    return this.alerts.filter({ hasText: text });
  }

  /** The control the dialog puts focus on when it opens (its `data-autofocus` one). */
  protected abstract get initialFocus(): Locator;

  /**
   * Waits until the dialog is ready to be filled in. It is on screen before it is ready: once its
   * opening animation ends, Material moves focus to the first control, and a field typed into
   * before that loses its text to that control (the keystrokes follow the focus).
   */
  async expectOpen(): Promise<void> {
    await expect(this.dialog).toBeVisible();
    await expect(this.initialFocus).toBeFocused();
  }

  async expectClosed(): Promise<void> {
    await expect(this.dialog).toBeHidden();
  }

  async submit(): Promise<void> {
    await this.save.click();
  }

  /** Saves and waits for the dialog to close: the record was accepted. */
  async submitAndClose(): Promise<void> {
    await this.save.click();
    await this.expectClosed();
  }

  protected textbox(name: string): Locator {
    return this.dialog.getByRole('textbox', { name, exact: true });
  }

  protected combobox(name: string): Locator {
    return this.dialog.getByRole('combobox', { name, exact: true });
  }
}
