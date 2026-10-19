import { Component, signal } from '@angular/core';
import { disabled, form, FormField, metadata, REQUIRED, validate } from '@angular/forms/signals';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideTestMaterial } from '@testing/test-providers';
import { DateField } from './date-field';
import { AppFormField } from './form-field';
import { visibleErrors } from './visible-errors';

@Component({
  imports: [AppFormField, DateField, FormField],
  template: `
    <app-form-field #day label="Date" required [errors]="errors()">
      <app-date-field
        pickerLabel="Choose the booking date"
        [inputId]="day.inputId"
        [describedBy]="day.describedBy()"
        [earliest]="min()"
        [latest]="max()"
        [formField]="f.day"
      />
    </app-form-field>
  `,
})
class Host {
  readonly model = signal({ day: '2026-10-14' });
  readonly min = signal('');
  readonly max = signal('');
  readonly off = signal(false);
  readonly f = form(this.model, (path) => {
    metadata(path.day, REQUIRED, () => true);
    disabled(path.day, { when: () => this.off() });
    validate(path.day, ({ value }) =>
      value() ? undefined : { kind: 'date', message: 'Pick a date' },
    );
  });
  protected errors() {
    return visibleErrors(this.f.day);
  }
}

@Component({
  imports: [DateField],
  template: `<app-date-field ariaLabel="From date" placeholder="From date" />`,
})
class Bare {}

describe('DateField', () => {
  async function open() {
    const view = await render(Host, { providers: [provideTestMaterial()] });
    const host = view.fixture.componentInstance;
    const input = () => screen.getByRole('textbox', { name: 'Date' });
    return { ...view, host, input };
  }

  it('shows the day as day, month, year, named by its label', async () => {
    const { input } = await open();

    expect(input()).toHaveValue('14/10/2026');
    expect(input()).toBeRequired();
  });

  it('follows the form when the value changes elsewhere', async () => {
    const { host, input, fixture } = await open();

    host.f.day().value.set('2026-12-01');
    await fixture.whenStable();

    expect(input()).toHaveValue('01/12/2026');
  });

  it('empties the box when the form clears the value', async () => {
    const { host, input, fixture } = await open();

    host.f.day().value.set('');
    await fixture.whenStable();

    expect(input()).toHaveValue('');
  });

  it('puts the typed date in the form as YYYY-MM-DD', async () => {
    const { host, input } = await open();

    await userEvent.clear(input());
    await userEvent.type(input(), '05/11/2026');

    expect(host.model().day).toBe('2026-11-05');
  });

  it('takes a date typed year first, as the API writes it', async () => {
    const { host, input } = await open();

    await userEvent.clear(input());
    await userEvent.type(input(), '2026-11-05');

    expect(host.model().day).toBe('2026-11-05');
  });

  it('puts an empty value in the form for text that is not a date, so the schema can word it', async () => {
    const { host, input } = await open();

    await userEvent.clear(input());
    await userEvent.type(input(), 'soon');
    await userEvent.tab();

    expect(host.model().day).toBe('');
    expect(screen.getByText('Pick a date')).toBeInTheDocument();
    expect(input()).toBeInvalid();
  });

  it('keeps the text being typed when a full date is edited into half of one', async () => {
    const { host, input } = await open();

    await userEvent.type(input(), '{Backspace}');

    expect(host.model().day).toBe('');
    expect(input()).toHaveValue('14/10/202');
  });

  it('waits for the four digits of the year before it reports a day', async () => {
    const { host, input } = await open();
    const reported: string[] = [];
    await userEvent.clear(input());

    for (const typed of [
      '1',
      '12',
      '12/',
      '12/1',
      '12/11',
      '12/11/',
      '12/11/2',
      '12/11/20',
      '12/11/202',
    ]) {
      await userEvent.clear(input());
      await userEvent.type(input(), typed);
      reported.push(host.model().day);
    }
    expect(reported).toEqual(reported.map(() => ''));

    await userEvent.clear(input());
    await userEvent.type(input(), '12/11/2026');
    expect(host.model().day).toBe('2026-11-12');
  });

  it('shows a date picked from the calendar and puts it in the form', async () => {
    const { host, input } = await open();

    await userEvent.click(screen.getByRole('button', { name: 'Choose the booking date' }));
    await userEvent.click(await screen.findByRole('button', { name: '20 Oct 2026' }));

    expect(host.model().day).toBe('2026-10-20');
    expect(input()).toHaveValue('20/10/2026');
    expect(host.f.day().touched()).toBe(true);
  });

  it('offers only the days between min and max in the calendar', async () => {
    const { host, fixture } = await open();
    host.min.set('2026-10-10');
    host.max.set('2026-10-20');
    await fixture.whenStable();

    await userEvent.click(screen.getByRole('button', { name: 'Choose the booking date' }));

    const day = async (name: string) => screen.findByRole('button', { name });
    expect(await day('9 Oct 2026')).toHaveAttribute('aria-disabled', 'true');
    expect(await day('10 Oct 2026')).not.toHaveAttribute('aria-disabled', 'true');
    expect(await day('20 Oct 2026')).not.toHaveAttribute('aria-disabled', 'true');
    expect(await day('21 Oct 2026')).toHaveAttribute('aria-disabled', 'true');
  });

  it('does not mark the field invalid before it was touched', async () => {
    const { host, input, fixture } = await open();

    host.f.day().value.set('');
    await fixture.whenStable();

    expect(input()).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('Pick a date')).not.toBeInTheDocument();
  });

  it('marks the field touched when focus leaves it', async () => {
    const { host, input } = await open();
    expect(host.f.day().touched()).toBe(false);

    await userEvent.click(input());
    await userEvent.tab();

    expect(host.f.day().touched()).toBe(true);
  });

  it('cannot be typed in while the form disables it', async () => {
    const { host, input, fixture } = await open();

    host.off.set(true);
    await fixture.whenStable();

    expect(input()).toBeDisabled();
  });

  it('takes focus when the form asks for it', async () => {
    const { host, input } = await open();

    host.f.day().focusBoundControl();

    expect(input()).toHaveFocus();
  });

  it('can be named by an aria-label instead of a visible label', async () => {
    await render(Bare, { providers: [provideTestMaterial()] });

    const box = screen.getByRole('textbox', { name: 'From date' });
    expect(box).toHaveAttribute('placeholder', 'From date');
    expect(screen.queryByText('From date')).not.toBeInTheDocument();
  });
});
