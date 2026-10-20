import { expect, type Locator, type Page } from '@playwright/test';
import { BookingFormDialog } from './booking-form-dialog';
import { ConfirmDialog } from './confirm-dialog';
import { DataTable } from './data-table';
import { ListToolbar } from './list-toolbar';

/** `/bookings`: the list, its filters and the bulk actions on the rows ticked. */
export class BookingsPage {
  readonly heading: Locator;
  readonly newBooking: Locator;
  readonly toolbar: ListToolbar;
  readonly table: DataTable;
  /** "2 selected": a live region that says nothing (and so is not found) while nothing is ticked. */
  readonly selectedCount: Locator;
  /** The day boxes of the toolbar, typed as `dd/mm/yyyy`. */
  readonly fromDate: Locator;
  readonly toDate: Locator;
  readonly bulkConfirm: Locator;
  readonly bulkCancel: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Bookings', level: 1 });
    this.newBooking = page.getByRole('button', { name: 'New booking' });
    this.toolbar = new ListToolbar(page, 'Filter bookings');
    this.table = new DataTable(page, 'Bookings');
    this.fromDate = page.getByRole('textbox', { name: 'From date' });
    this.toDate = page.getByRole('textbox', { name: 'To date' });
    this.selectedCount = page.getByRole('status').filter({ hasText: /\d+ selected/ });
    this.bulkConfirm = page.getByRole('button', { name: 'Confirm selected bookings' });
    this.bulkCancel = page.getByRole('button', { name: 'Cancel selected bookings' });
  }

  async goto(query = ''): Promise<void> {
    await this.page.goto(`/bookings${query}`);
    await expect(this.heading).toBeVisible();
  }

  async openNewBookingForm(): Promise<BookingFormDialog> {
    await this.newBooking.click();
    const dialog = new BookingFormDialog(this.page, 'New booking');
    await dialog.expectOpen();
    return dialog;
  }

  /** Ticks the rows that hold these texts. */
  async select(...rows: (string | RegExp)[]): Promise<void> {
    for (const row of rows) await this.table.checkbox(row).check();
  }

  /** Asks to cancel what is ticked and returns the question ("Keep" or "Cancel bookings"). */
  async askToCancelSelected(count: number): Promise<ConfirmDialog> {
    await this.bulkCancel.click();
    const question = new ConfirmDialog(
      this.page,
      `Cancel ${count} ${count === 1 ? 'booking' : 'bookings'}?`,
    );
    await question.expectOpen();
    return question;
  }

  /** Cancels what is ticked, after agreeing to the question. */
  async cancelSelected(count: number): Promise<void> {
    const question = await this.askToCancelSelected(count);
    await question.confirm('Cancel bookings');
  }
}
