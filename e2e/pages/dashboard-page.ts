import { expect, type Locator, type Page } from '@playwright/test';
import { dayFirst } from '../support/dates';

/** `/`: figures for one day across all locations. */
export class DashboardPage {
  readonly heading: Locator;
  readonly dateBox: Locator;
  readonly keyFigures: Locator;
  readonly occupancy: Locator;
  readonly statuses: Locator;
  readonly upcoming: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Dashboard', level: 1 });
    this.dateBox = page.getByRole('textbox', { name: 'Date', exact: true });
    this.keyFigures = page.getByRole('region', { name: 'Key figures' });
    this.occupancy = page.getByRole('region', { name: 'Occupancy by location' });
    this.statuses = page.getByRole('region', { name: 'Bookings by status' });
    this.upcoming = page.getByRole('region', { name: 'Coming up' });
  }

  async goto(isoDay?: string): Promise<void> {
    await this.page.goto(isoDay ? `/?date=${isoDay}` : '/');
  }

  async expectLoaded(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.keyFigures).toBeVisible();
    // The bar above the figures says a day is still on its way.
    await expect(
      this.page.getByRole('progressbar', { name: 'Updating the dashboard' }),
    ).toHaveCount(0);
  }

  /** Types a day into the date box, as a person would. */
  async showDay(isoDay: string): Promise<void> {
    await this.dateBox.fill(dayFirst(isoDay));
  }

  /** A key figure and its value, as they read together: `Active members 71`. */
  async expectFigure(label: string, value: string): Promise<void> {
    await expect(this.keyFigures).toContainText(
      new RegExp(`${label}\\s*${escapeRegExp(value)}(?!\\d)`),
    );
  }

  /** One row of "Bookings by status": `Completed` and its count. */
  async expectStatusCount(status: string, count: number): Promise<void> {
    await expect(this.statuses.getByRole('listitem').filter({ hasText: status })).toHaveText(
      new RegExp(`^\\s*${status}\\s*${count}\\s*$`),
    );
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
