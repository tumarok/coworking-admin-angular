import { OverlayContainer } from '@angular/cdk/overlay';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { installMockApi, signIn } from '@testing/mock-api';
import { provideTestSession } from '@testing/test-providers';
import { injectBookingFormDialog } from './open-booking-form';

@Component({ template: '<button type="button" (click)="open()">Open form</button>' })
class Opener {
  private readonly openForm = injectBookingFormDialog(() =>
    Promise.reject(new Error('chunk failed')),
  );
  results: unknown[] = [];
  async open() {
    this.results.push(await this.openForm());
  }
}

describe('injectBookingFormDialog', () => {
  beforeEach(() => {
    installMockApi();
    signIn();
  });

  it('tells the person, and resolves with nothing, when the form cannot be downloaded', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { fixture } = await render(Opener, { providers: provideTestSession() });

    await userEvent.click(screen.getByRole('button', { name: 'Open form' }));

    await vi.waitFor(() => {
      expect(fixture.componentInstance.results).toEqual([undefined]);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await vi.waitFor(() => {
      expect(
        TestBed.inject(OverlayContainer)
          .getContainerElement()
          .querySelector('mat-snack-bar-container'),
      ).toHaveTextContent('Could not open the form');
    });
    expect(logged).toHaveBeenCalledWith('Cannot load the booking form', expect.any(Error));
    logged.mockRestore();
  });
});
