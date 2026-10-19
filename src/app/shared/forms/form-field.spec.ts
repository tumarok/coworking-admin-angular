import { Component, signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import { AppFormField, type FieldError } from './form-field';

@Component({
  imports: [AppFormField],
  template: `
    <app-form-field #name label="Name" [required]="required()" [hint]="hint()" [errors]="errors()">
      <input [id]="name.inputId" [attr.aria-describedby]="name.describedBy() || null" />
    </app-form-field>
    <div role="group" [attr.aria-labelledby]="name.labelId">A control that is not an input</div>
  `,
})
class Host {
  readonly required = signal(false);
  readonly hint = signal<string | undefined>(undefined);
  readonly errors = signal<readonly FieldError[]>([]);
}

describe('AppFormField', () => {
  async function open() {
    const view = await render(Host);
    const host = view.fixture.componentInstance;
    const update = async (change: () => void) => {
      change();
      await view.fixture.whenStable();
    };
    return { host, update };
  }

  it('labels the control it wraps', async () => {
    await open();

    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument();
  });

  it('gives the label an id, for controls that cannot be named by `for`', async () => {
    await open();

    expect(screen.getByRole('group', { name: 'Name' })).toBeInTheDocument();
  });

  it('marks a required field visually without adding to its accessible name', async () => {
    const { host, update } = await open();
    expect(screen.queryByText('*')).not.toBeInTheDocument();

    await update(() => {
      host.required.set(true);
    });

    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument();
  });

  it('shows the hint and describes the control with it', async () => {
    const { host, update } = await open();
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-describedby');

    await update(() => {
      host.hint.set('As on your badge');
    });

    expect(screen.getByRole('textbox')).toHaveAccessibleDescription('As on your badge');
  });

  it('shows the first error with a message instead of the hint and describes the control with it', async () => {
    const { host, update } = await open();
    await update(() => {
      host.hint.set('As on your badge');
      host.errors.set([{}, { message: 'Enter a name' }, { message: 'Too short' }]);
    });

    expect(screen.getByText('Enter a name')).toBeInTheDocument();
    expect(screen.queryByText('Too short')).not.toBeInTheDocument();
    expect(screen.queryByText('As on your badge')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveAccessibleDescription('Enter a name');
  });

  it('announces an error that appears, so a screen reader hears it without moving to the field', async () => {
    const { host, update } = await open();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await update(() => {
      host.errors.set([{ message: 'Enter a name' }]);
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name');
  });

  it('brings the hint back when the errors go away', async () => {
    const { host, update } = await open();
    await update(() => {
      host.hint.set('As on your badge');
      host.errors.set([{ message: 'Enter a name' }]);
    });

    await update(() => {
      host.errors.set([]);
    });

    expect(screen.queryByText('Enter a name')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveAccessibleDescription('As on your badge');
  });

  it('gives every field its own ids', async () => {
    const view = await render(
      `<app-form-field #a label="A"><input [id]="a.inputId" /></app-form-field>
       <app-form-field #b label="B"><input [id]="b.inputId" /></app-form-field>`,
      { imports: [AppFormField] },
    );

    const [a, b] = view.getAllByRole('textbox');
    expect(a.id).not.toBe(b.id);
  });
});
