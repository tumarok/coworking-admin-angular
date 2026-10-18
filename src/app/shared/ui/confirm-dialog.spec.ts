import { ApplicationRef, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fireEvent, render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideTestMaterial } from '@testing/test-providers';
import { ConfirmDialog } from './confirm-dialog';
import type { ConfirmOptions } from './confirm-dialog-content';

@Component({
  template: '<button type="button" (click)="ask()">Delete room</button>',
})
class Opener {
  private readonly dialog = TestBed.inject(ConfirmDialog);
  answer: boolean | undefined;
  options: ConfirmOptions = { title: 'Delete this room?' };

  async ask() {
    this.answer = await this.dialog.confirm(this.options);
  }
}

describe('ConfirmDialog', () => {
  async function open(options: ConfirmOptions) {
    const view = await render(Opener, {
      providers: [provideTestMaterial()],
      componentProperties: { options },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Delete room' }));
    const dialog = await screen.findByRole('alertdialog');
    return { ...view, dialog, opener: view.fixture.componentInstance };
  }

  const settle = () => TestBed.inject(ApplicationRef).whenStable();

  it('is an alert dialog named by its title and described by its message', async () => {
    const { dialog } = await open({
      title: 'Delete this room?',
      message: 'This cannot be undone.',
    });

    expect(dialog).toHaveAccessibleName('Delete this room?');
    expect(dialog).toHaveAccessibleDescription('This cannot be undone.');
  });

  it('answers true when the person confirms', async () => {
    const { opener } = await open({ title: 'Delete this room?', confirmLabel: 'Delete' });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await settle();

    expect(opener.answer).toBe(true);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('answers false on Cancel', async () => {
    const { opener } = await open({ title: 'Delete this room?' });

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await settle();

    expect(opener.answer).toBe(false);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('answers false on Escape', async () => {
    const { opener } = await open({ title: 'Delete this room?' });
    // Escape goes to the focused element, and Material focuses the dialog only once it is open.
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus();
    });

    // The CDK reads the legacy `keyCode`, which `userEvent.keyboard` leaves at 0.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Confirm' }), {
      key: 'Escape',
      keyCode: 27,
    });

    await vi.waitFor(() => {
      expect(opener.answer).toBe(false);
    });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('answers false on a click outside the dialog', async () => {
    const { opener } = await open({ title: 'Delete this room?' });

    const backdrop = document.querySelector('.cdk-overlay-backdrop');
    if (!backdrop) throw new Error('The dialog has no backdrop');
    await userEvent.click(backdrop);
    await settle();

    expect(opener.answer).toBe(false);
  });

  it('uses the labels it is given', async () => {
    await open({ title: 'Keep it?', confirmLabel: 'Yes, keep', cancelLabel: 'No, drop' });

    expect(screen.getByRole('button', { name: 'Yes, keep' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No, drop' })).toBeInTheDocument();
  });

  it('starts on the confirm button for an ordinary question', async () => {
    await open({ title: 'Publish?', confirmLabel: 'Publish' });

    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Publish' })).toHaveFocus();
    });
  });

  it('starts on Cancel for a dangerous question', async () => {
    await open({ title: 'Delete this room?', confirmLabel: 'Delete', danger: true });

    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    });
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('danger');
  });

  it('returns focus to the control that asked', async () => {
    await open({ title: 'Delete this room?' });

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await settle();

    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete room' })).toHaveFocus();
    });
  });

  it('has no message region when there is no message', async () => {
    const { dialog } = await open({ title: 'Delete this room?' });

    expect(dialog.querySelector('mat-dialog-content')).toBeNull();
    expect(dialog).not.toHaveAttribute('aria-describedby');
  });
});
