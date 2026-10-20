import type { Locator, Page } from '@playwright/test';
import { dayFirst } from '../support/dates';
import { chooseFromSearch } from './controls';
import { FormDialog } from './form-dialog';

export interface BookingFields {
  /** What to type to find the room, and the text of the option to pick (`Quartz · Test Harbour`). */
  room?: { search: string; option: string | RegExp };
  /** What to type to find the member, and the text of the option to pick. */
  member?: { search: string; option: string | RegExp };
  /** `YYYY-MM-DD`; typed into the box as `dd/mm/yyyy`. */
  day?: string;
  /** `HH:mm`, on the clock of the room's location. */
  from?: string;
  to?: string;
  attendees?: number;
  notes?: string;
}

/** The dialog that creates a booking (`New booking`) or edits one (`Edit booking`). */
export class BookingFormDialog extends FormDialog {
  readonly room: Locator;
  readonly member: Locator;
  readonly day: Locator;
  readonly from: Locator;
  readonly to: Locator;
  readonly attendees: Locator;
  readonly notes: Locator;
  /** Where a refusal that is about the booking as a whole is told, with the links it names. */
  readonly banner: Locator;

  constructor(page: Page, title: 'New booking' | 'Edit booking') {
    super(page, title);
    this.room = this.combobox('Room');
    this.member = this.combobox('Member');
    this.day = this.textbox('Date');
    this.from = this.combobox('From');
    this.to = this.combobox('To');
    this.attendees = this.dialog.getByRole('spinbutton', { name: 'Attendees' });
    this.notes = this.textbox('Notes');
    // A field's error is itself a paragraph with role alert; the banner is the alert that holds
    // paragraphs of its own (and, for an overlap, a list of links).
    this.banner = this.alerts.filter({ has: page.getByRole('paragraph') });
  }

  protected get initialFocus(): Locator {
    return this.room;
  }

  async fill(fields: BookingFields): Promise<void> {
    if (fields.room) await chooseFromSearch(this.room, fields.room.search, fields.room.option);
    if (fields.member) {
      await chooseFromSearch(this.member, fields.member.search, fields.member.option);
    }
    if (fields.day) await this.day.fill(dayFirst(fields.day));
    if (fields.from) await this.from.fill(fields.from);
    if (fields.to) await this.to.fill(fields.to);
    if (fields.attendees !== undefined) await this.attendees.fill(String(fields.attendees));
    if (fields.notes !== undefined) await this.notes.fill(fields.notes);
  }
}
