import { OverlayContainer } from '@angular/cdk/overlay';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { installMockApi, signIn } from '@testing/mock-api';
import { provideTestSession } from '@testing/test-providers';
import { injectBulkResultDialog } from './open-bulk-result';

@Component({ template: '<button type="button" (click)="open()">Show result</button>' })
class Opener {
  private readonly openResult = injectBulkResultDialog(() =>
    Promise.reject(new Error('chunk failed')),
  );
  settled = 0;
  async open() {
    await this.openResult({
      action: 'confirm',
      failures: [{ id: 'bk_1', label: 'bk_1', reason: 'Booking not found' }],
    });
    this.settled++;
  }
}

describe('injectBulkResultDialog', () => {
  beforeEach(() => {
    installMockApi();
    signIn();
  });

  it('tells the person, and resolves, when the dialog cannot be downloaded', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { fixture } = await render(Opener, { providers: provideTestSession() });

    await userEvent.click(screen.getByRole('button', { name: 'Show result' }));

    await vi.waitFor(() => {
      expect(fixture.componentInstance.settled).toBe(1);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await vi.waitFor(() => {
      expect(
        TestBed.inject(OverlayContainer)
          .getContainerElement()
          .querySelector('mat-snack-bar-container'),
      ).toHaveTextContent('Could not show which bookings were skipped');
    });
    expect(logged).toHaveBeenCalledWith('Cannot load the bulk result', expect.any(Error));
    logged.mockRestore();
  });
});
