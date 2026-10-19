import { Component, computed, signal } from '@angular/core';
import { disabled, form, FormField, metadata, REQUIRED, validate } from '@angular/forms/signals';
import { fireEvent, render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideTestMaterial } from '@testing/test-providers';
import { AutocompleteField } from './autocomplete-field';
import { AppFormField } from './form-field';
import { visibleErrors } from './visible-errors';

const ROOMS = [
  { value: 'r1', label: 'Aurora · Riverside Hub' },
  { value: 'r2', label: 'Birch · Riverside Hub' },
  { value: 'r3', label: 'Aurora · Canal Yard' },
];

@Component({
  imports: [AppFormField, AutocompleteField, FormField],
  template: `
    <app-form-field #room label="Room" required [errors]="errors()">
      <app-autocomplete-field
        placeholder="Choose a room"
        [inputId]="room.inputId"
        [describedBy]="room.describedBy()"
        [options]="options()"
        [total]="total()"
        [selectedLabel]="label()"
        [delay]="delay()"
        [initialFocus]="true"
        (searchChange)="searches.push($event); search.set($event)"
        [formField]="f.roomId"
      />
    </app-form-field>
  `,
})
class Host {
  readonly model = signal({ roomId: '' });
  readonly searches: string[] = [];
  readonly search = signal('');
  readonly total = signal<number | undefined>(undefined);
  // Long enough that the keystrokes of one test are never split by a busy machine.
  readonly delay = signal(400);
  readonly off = signal(false);
  readonly options = computed(() =>
    ROOMS.filter((o) => o.label.toLowerCase().includes(this.search().toLowerCase())),
  );
  readonly label = computed(() => ROOMS.find((o) => o.value === this.model().roomId)?.label ?? '');
  readonly f = form(this.model, (path) => {
    metadata(path.roomId, REQUIRED, () => true);
    disabled(path.roomId, { when: () => this.off() });
    validate(path.roomId, ({ value }) =>
      value() ? undefined : { kind: 'required', message: 'Choose a room' },
    );
  });
  protected errors() {
    return visibleErrors(this.f.roomId);
  }
}

describe('AutocompleteField', () => {
  async function open(model = { roomId: '' }) {
    const view = await render(Host, { providers: [provideTestMaterial()] });
    const host = view.fixture.componentInstance;
    if (model.roomId) {
      host.model.set(model);
      await view.fixture.whenStable();
    }
    const input = () => screen.getByRole('combobox', { name: /^Room/ });
    return { ...view, host, input };
  }

  const names = () => screen.getAllByRole('option').map((o) => o.textContent.trim());

  it('is a combobox named by its label, required, with a placeholder', async () => {
    const { input } = await open();

    expect(input()).toBeRequired();
    expect(input()).toHaveAttribute('placeholder', 'Choose a room');
    expect(input()).toHaveValue('');
    expect(input()).toHaveAttribute('data-autofocus');
  });

  it('shows the text of the chosen record, even when the options do not list it', async () => {
    const { input, host } = await open({ roomId: 'r2' });
    host.search.set('zzz');

    expect(input()).toHaveValue('Birch · Riverside Hub');
    expect(host.options()).toEqual([]);
  });

  it('lists the options when it is clicked, as a listbox of options', async () => {
    const { input } = await open();

    await userEvent.click(input());

    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(names()).toEqual(ROOMS.map((o) => o.label));
    expect(input()).toHaveAttribute('aria-expanded', 'true');
  });

  it('chooses a listed record: its id goes to the form and its text into the box', async () => {
    const { input, host } = await open();

    await userEvent.click(input());
    await userEvent.click(await screen.findByRole('option', { name: 'Birch · Riverside Hub' }));

    expect(host.model().roomId).toBe('r2');
    expect(input()).toHaveValue('Birch · Riverside Hub');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('chooses with the keyboard', async () => {
    const { input, host } = await open();

    await userEvent.click(input());
    await screen.findByRole('listbox');
    // The CDK reads the legacy `keyCode`, which `userEvent.keyboard` leaves at 0.
    fireEvent.keyDown(input(), { key: 'ArrowDown', keyCode: 40 });
    fireEvent.keyDown(input(), { key: 'ArrowDown', keyCode: 40 });
    fireEvent.keyDown(input(), { key: 'Enter', keyCode: 13 });

    expect(host.model().roomId).toBe('r2');
  });

  it('reports the text typed once, after typing pauses', async () => {
    const { input, host } = await open();

    await userEvent.type(input(), 'aur');

    await vi.waitFor(() => {
      expect(host.searches).toEqual(['aur']);
    });
    expect(names()).toEqual(['Aurora · Riverside Hub', 'Aurora · Canal Yard']);
  });

  it('waits 300 ms by default before reporting', async () => {
    const { input, host, fixture } = await open();
    host.delay.set(300);
    await fixture.whenStable();

    await userEvent.type(input(), 'a');
    expect(host.searches).toEqual([]);

    await vi.waitFor(() => {
      expect(host.searches).toEqual(['a']);
    });
  });

  it('trims the text it reports, and reports an emptied box as no search', async () => {
    const { input, host } = await open();

    await userEvent.type(input(), ' bir ');
    await vi.waitFor(() => {
      expect(host.searches).toEqual(['bir']);
    });
    await userEvent.clear(input());

    await vi.waitFor(() => {
      expect(host.searches).toEqual(['bir', '']);
    });
  });

  it('takes the choice back as soon as the text is edited, keeping the text', async () => {
    const { input, host } = await open({ roomId: 'r1' });

    await userEvent.type(input(), '!');

    expect(host.model().roomId).toBe('');
    expect(input()).toHaveValue('Aurora · Riverside Hub!');
  });

  it('reports nothing for a record that was chosen before the pause ended', async () => {
    const { input, host } = await open();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });

      await user.type(input(), 'bir');
      await user.click(screen.getByRole('option', { name: 'Birch · Riverside Hub' }));
      await vi.advanceTimersByTimeAsync(host.delay() * 2);

      expect(host.searches).toEqual([]);
      expect(host.model().roomId).toBe('r2');
    } finally {
      vi.useRealTimers();
    }
  });

  it('says there are no matches, in the list and to a screen reader', async () => {
    const { input } = await open();

    await userEvent.type(input(), 'zzz');

    expect(await screen.findByRole('option', { name: 'No matches' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('status')).toHaveTextContent('No matches');
  });

  it('announces how many records were found while it has focus', async () => {
    const { input } = await open();

    expect(screen.getByRole('status')).toHaveTextContent('');
    await userEvent.click(input());

    await vi.waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('3 matches');
    });
    await userEvent.type(input(), 'birch');
    await vi.waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('1 match');
    });
  });

  it('says when the server found more than it lists', async () => {
    const { input, host, fixture } = await open();
    host.total.set(57);
    await fixture.whenStable();

    await userEvent.click(input());

    await vi.waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('57 matches, showing the first 3');
    });
  });

  it('goes quiet when the focus leaves', async () => {
    const { input } = await open();
    await userEvent.click(input());
    await vi.waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('3 matches');
    });

    await userEvent.tab();

    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('is touched when focus leaves, and then shows the form’s error for an empty choice', async () => {
    const { input, host } = await open();
    expect(screen.queryByText('Choose a room')).not.toBeInTheDocument();

    await userEvent.type(input(), 'aur');
    await userEvent.tab();

    expect(host.f.roomId().touched()).toBe(true);
    expect(screen.getByText('Choose a room')).toBeInTheDocument();
    expect(input()).toBeInvalid();
    expect(input()).toHaveAccessibleDescription('Choose a room');
  });

  it('cannot be used while the form disables it', async () => {
    const { input, host, fixture } = await open();

    host.off.set(true);
    await fixture.whenStable();

    expect(input()).toBeDisabled();
  });

  it('takes focus when the form asks for it', async () => {
    const { input, host } = await open();

    host.f.roomId().focusBoundControl();

    expect(input()).toHaveFocus();
  });
});
