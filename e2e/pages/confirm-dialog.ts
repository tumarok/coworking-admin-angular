import { expect, type Locator, type Page } from '@playwright/test';

/** The question the app asks before something that cannot be taken back (an alert dialog). */
export class ConfirmDialog {
  readonly dialog: Locator;

  constructor(page: Page, title: string | RegExp) {
    this.dialog = page.getByRole('alertdialog', { name: title });
  }

  async expectOpen(): Promise<void> {
    await expect(this.dialog).toBeVisible();
  }

  async confirm(label: string): Promise<void> {
    await this.dialog.getByRole('button', { name: label, exact: true }).click();
    await expect(this.dialog).toBeHidden();
  }

  async decline(label = 'Cancel'): Promise<void> {
    await this.dialog.getByRole('button', { name: label, exact: true }).click();
    await expect(this.dialog).toBeHidden();
  }
}
