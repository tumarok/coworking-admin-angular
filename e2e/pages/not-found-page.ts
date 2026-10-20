import type { Locator, Page } from '@playwright/test';

/** What a page says when the route or the record does not exist. */
export class NotFoundPage {
  readonly heading: Locator;
  readonly link: Locator;

  /** `title` is the heading (`Page not found`, `Booking not found`); `linkName` the way out. */
  constructor(page: Page, title: string, linkName: string) {
    this.heading = page.getByRole('heading', { name: title, level: 1 });
    this.link = page.getByRole('link', { name: linkName });
  }
}
