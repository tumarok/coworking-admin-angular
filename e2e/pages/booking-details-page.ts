import { expect, type Locator, type Page } from '@playwright/test';
import { BookingFormDialog } from './booking-form-dialog';
import { ConfirmDialog } from './confirm-dialog';
import { DetailsList } from './details-list';

/** The status buttons a booking offers: the moves its status allows. */
export type BookingMove = 'Confirm' | 'Check in' | 'Complete' | 'No-show' | 'Cancel booking';

/** `/bookings/:id`. */
export class BookingDetailsPage {
  readonly heading: Locator;
  readonly edit: Locator;
  readonly facts: DetailsList;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { level: 1 });
    this.edit = page.getByRole('button', { name: 'Edit', exact: true });
    this.facts = new DetailsList(page);
  }

  async goto(id: string): Promise<void> {
    await this.page.goto(`/bookings/${id}`);
    await expect(this.heading).toBeVisible();
  }

  /** The status chip of the page (`Pending`). It has no role, only its text. */
  status(label: string): Locator {
    return this.page.getByRole('main').getByText(label, { exact: true });
  }

  move(name: BookingMove): Locator {
    return this.page.getByRole('button', { name, exact: true });
  }

  async openEditForm(): Promise<BookingFormDialog> {
    await this.edit.click();
    const dialog = new BookingFormDialog(this.page, 'Edit booking');
    await dialog.expectOpen();
    return dialog;
  }

  /** Cancelling asks first: returns the question ("Keep" or "Cancel booking"). */
  async askToCancel(): Promise<ConfirmDialog> {
    await this.move('Cancel booking').click();
    const question = new ConfirmDialog(this.page, 'Cancel this booking?');
    await question.expectOpen();
    return question;
  }

  /** Cancels the booking, answering the question with "Cancel booking". */
  async cancelBooking(): Promise<void> {
    const question = await this.askToCancel();
    await question.confirm('Cancel booking');
  }
}
