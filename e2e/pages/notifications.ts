import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The snack bar that tells what an action did or why it failed. Material's container has no role
 * and keeps its live region in an anonymous element, so the component's own tag is what names it.
 */
export class Notifications {
  readonly snackBars: Locator;

  constructor(page: Page) {
    this.snackBars = page.locator('mat-snack-bar-container');
  }

  message(text: string | RegExp): Locator {
    return this.snackBars.filter({ hasText: text });
  }

  async expectMessage(text: string | RegExp): Promise<void> {
    await expect(this.message(text)).toBeVisible();
  }
}
