import type { Locator, Page } from '@playwright/test';
import { chooseOption } from './controls';
import { FormDialog } from './form-dialog';

export interface RoomFields {
  /** The location's name. */
  location?: string;
  name?: string;
  /** `Meeting room`, `Private office`, `Hot desk` or `Event space`. */
  type?: string;
  capacity?: number;
  /** In euros. */
  hourlyRate?: number;
  /** `Available`, `Maintenance` or `Retired`. */
  status?: string;
}

/** The dialog that creates a room (`New room`) or edits one (`Edit <name>`). */
export class RoomFormDialog extends FormDialog {
  readonly name: Locator;
  readonly capacity: Locator;
  readonly hourlyRate: Locator;

  constructor(page: Page, title: string | RegExp) {
    super(page, title);
    this.name = this.textbox('Name');
    this.capacity = this.dialog.getByRole('spinbutton', { name: 'Capacity' });
    this.hourlyRate = this.dialog.getByRole('spinbutton', { name: 'Hourly rate (EUR)' });
  }

  protected get initialFocus(): Locator {
    return this.combobox('Location');
  }

  async fill(fields: RoomFields): Promise<void> {
    if (fields.location) await chooseOption(this.combobox('Location'), fields.location);
    if (fields.name !== undefined) await this.name.fill(fields.name);
    if (fields.type) await chooseOption(this.combobox('Type'), fields.type);
    if (fields.capacity !== undefined) await this.capacity.fill(String(fields.capacity));
    if (fields.hourlyRate !== undefined) await this.hourlyRate.fill(String(fields.hourlyRate));
    if (fields.status) await chooseOption(this.combobox('Status'), fields.status);
  }
}
