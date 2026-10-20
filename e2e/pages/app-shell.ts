import { expect, type Locator, type Page } from '@playwright/test';

export type Section = 'Dashboard' | 'Locations' | 'Rooms' | 'Members' | 'Bookings';

/** The frame around every signed-in page: top bar, account menu, navigation and the page itself. */
export class AppShell {
  readonly main: Locator;
  readonly navigation: Locator;
  readonly accountMenu: Locator;

  constructor(private readonly page: Page) {
    this.main = page.getByRole('main');
    this.navigation = page.getByRole('navigation', { name: 'Main' });
    this.accountMenu = page.getByRole('button', { name: 'Account menu' });
  }

  link(section: Section): Locator {
    return this.navigation.getByRole('link', { name: section, exact: true });
  }

  async open(section: Section): Promise<void> {
    await this.link(section).click();
  }

  async expectCurrent(section: Section): Promise<void> {
    await expect(this.link(section)).toHaveAttribute('aria-current', 'page');
  }

  async signOut(): Promise<void> {
    await this.accountMenu.click();
    await this.page.getByRole('menuitem', { name: 'Sign out' }).click();
  }
}
