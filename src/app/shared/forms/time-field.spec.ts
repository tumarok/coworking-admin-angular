import { Component, signal } from '@angular/core';
import { form, FormField, metadata, REQUIRED, validate } from '@angular/forms/signals';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideTestMaterial } from '@testing/test-providers';
import { AppFormField } from './form-field';
import { TimeField } from './time-field';
import { visibleErrors } from './visible-errors';

@Component({
  imports: [AppFormField, FormField, TimeField],
  template: `
    <app-form-field #opens label="Opens at" required [errors]="errors()">
      <app-time-field
        pickerLabel="Choose the opening time"
        [inputId]="opens.inputId"
        [describedBy]="opens.describedBy()"
        [formField]="f.opensAt"
      />
    </app-form-field>
  `,
})
class Host {
  readonly model = signal({ opensAt: '08:00' });
  readonly f = form(this.model, (path) => {
    metadata(path.opensAt, REQUIRED, () => true);
    validate(path.opensAt, ({ value }) =>
      /^\d\d:\d\d$/.test(value()) ? undefined : { kind: 'time', message: 'Use the HH:mm format' },
    );
  });
  protected errors() {
    return visibleErrors(this.f.opensAt);
  }
}

describe('TimeField', () => {
  async function open() {
    const view = await render(Host, { providers: [provideTestMaterial()] });
    const host = view.fixture.componentInstance;
    const input = () => screen.getByRole('combobox', { name: 'Opens at' });
    return { ...view, host, input };
  }

  it('shows the time on a 24-hour clock, named by its label', async () => {
    const { input } = await open();

    expect(input()).toHaveValue('08:00');
    expect(input()).toBeRequired();
  });

  it('follows the form when the value changes elsewhere', async () => {
    const { host, input, fixture } = await open();

    host.f.opensAt().value.set('13:45');
    await fixture.whenStable();

    expect(input()).toHaveValue('13:45');
  });

  it('puts the typed time in the form as HH:mm', async () => {
    const { host, input } = await open();

    await userEvent.clear(input());
    await userEvent.type(input(), '9:30');

    expect(host.model().opensAt).toBe('09:30');
  });

  it('puts an empty value in the form for text that is not a time, so the schema can word it', async () => {
    const { host, input } = await open();

    await userEvent.clear(input());
    await userEvent.type(input(), 'soon');
    await userEvent.tab();

    expect(host.model().opensAt).toBe('');
    expect(screen.getByText('Use the HH:mm format')).toBeInTheDocument();
    expect(input()).toBeInvalid();
  });

  it('does not mark the field invalid before it was touched', async () => {
    const { host, input, fixture } = await open();

    host.f.opensAt().value.set('');
    await fixture.whenStable();

    expect(input()).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('Use the HH:mm format')).not.toBeInTheDocument();
  });

  it('offers times in steps of 15 minutes', async () => {
    const { input } = await open();

    await userEvent.click(screen.getByRole('button', { name: 'Choose the opening time' }));
    const options = await screen.findAllByRole('option');

    expect(options.slice(0, 5).map((o) => o.textContent.trim())).toEqual([
      '00:00',
      '00:15',
      '00:30',
      '00:45',
      '01:00',
    ]);
    expect(options).toHaveLength(96);
    expect(input()).toHaveAttribute('aria-expanded', 'true');
  });

  it('takes the time picked from the list', async () => {
    const { host } = await open();

    await userEvent.click(screen.getByRole('button', { name: 'Choose the opening time' }));
    await userEvent.click(await screen.findByRole('option', { name: '17:15' }));

    expect(host.model().opensAt).toBe('17:15');
    expect(screen.getByRole('combobox', { name: 'Opens at' })).toHaveValue('17:15');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('marks the field touched when focus leaves it', async () => {
    const { host, input } = await open();
    expect(host.f.opensAt().touched()).toBe(false);

    await userEvent.click(input());
    await userEvent.tab();

    expect(host.f.opensAt().touched()).toBe(true);
  });

  it('marks the field touched when a time is picked from the list', async () => {
    const { host } = await open();
    expect(host.f.opensAt().touched()).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Choose the opening time' }));
    await userEvent.click(await screen.findByRole('option', { name: '17:15' }));

    expect(host.f.opensAt().touched()).toBe(true);
  });

  it('takes focus when the form asks for it', async () => {
    const { host, input } = await open();

    host.f.opensAt().focusBoundControl();

    expect(input()).toHaveFocus();
  });
});
