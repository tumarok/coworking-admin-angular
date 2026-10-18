import { OverlayContainer } from '@angular/cdk/overlay';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { MockInstance } from 'vitest';
import { Notifier } from './notifier';

describe('Notifier', () => {
  let notifier: Notifier;
  let open: MockInstance<MatSnackBar['open']>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    TestBed.configureTestingModule({
      providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    });
    notifier = TestBed.inject(Notifier);
    open = vi.spyOn(TestBed.inject(MatSnackBar), 'open');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the message in a snackbar with a way to dismiss it', async () => {
    await notifier.error('Room not found');
    TestBed.tick();

    const bar = TestBed.inject(OverlayContainer)
      .getContainerElement()
      .querySelector('mat-snack-bar-container');
    expect(bar).toHaveTextContent('Room not found');
    expect(bar?.querySelector('button')).toHaveTextContent('Dismiss');
  });

  it('shows the same message repeated at once only once', async () => {
    await notifier.error('Room not found');
    await notifier.error('Room not found');
    vi.advanceTimersByTime(999);
    await notifier.error('Room not found');

    expect(open).toHaveBeenCalledTimes(1);
  });

  it('shows the message again after a moment', async () => {
    await notifier.error('Room not found');
    vi.advanceTimersByTime(1000);
    await notifier.error('Room not found');

    expect(open).toHaveBeenCalledTimes(2);
  });

  it('forgets old messages, so the map does not grow without bound', async () => {
    await notifier.error('One');
    vi.advanceTimersByTime(1000);
    await notifier.error('Two');

    expect((notifier as unknown as { lastShown: Map<string, number> }).lastShown.size).toBe(1);
  });

  it('logs instead of failing when the snackbar cannot be shown', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    open.mockImplementation(() => {
      throw new Error('chunk failed');
    });

    await expect(notifier.error('Room not found')).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalledWith('Cannot show the notification', expect.any(Error));
    logged.mockRestore();
  });

  it('does not mistake different messages for repeats', async () => {
    await notifier.error('Room not found');
    await notifier.error('Member not found');

    expect(open).toHaveBeenCalledTimes(2);
  });
});
