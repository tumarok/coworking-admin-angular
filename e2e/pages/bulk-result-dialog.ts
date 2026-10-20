import { expect, type Locator, type Page } from '@playwright/test';

/** Tells which bookings a bulk action left as they were, and why. */
export class BulkResultDialog {
  readonly dialog: Locator;
  readonly close: Locator;

  /** `done` is the past tense of the action: `confirmed` or `cancelled`. */
  constructor(page: Page, done: 'confirmed' | 'cancelled') {
    this.dialog = page.getByRole('dialog', { name: `Some bookings were not ${done}` });
    this.close = this.dialog.getByRole('button', { name: 'Close' });
  }

  async expectOpen(): Promise<void> {
    await expect(this.dialog).toBeVisible();
  }
}
