import { inject, Injectable, Injector } from '@angular/core';

const ERROR_DURATION_MS = 6000;

/** Parallel requests often fail for one reason; the same text inside this window shows once. */
const DUPLICATE_WINDOW_MS = 1000;

/**
 * The single place that talks to the snackbar, so the rest of the app never imports Material for
 * it. Material is loaded on the first message: the snackbar and the overlay machinery behind it
 * would otherwise weigh on every page load for something most sessions never show.
 */
@Injectable({ providedIn: 'root' })
export class Notifier {
  private readonly injector = inject(Injector);
  private readonly lastShown = new Map<string, number>();

  async error(message: string): Promise<void> {
    const now = Date.now();
    this.forgetOld(now);
    if (this.lastShown.has(message)) return;
    this.lastShown.set(message, now);

    try {
      const { MatSnackBar } = await import('@angular/material/snack-bar');
      this.injector.get(MatSnackBar).open(message, 'Dismiss', { duration: ERROR_DURATION_MS });
    } catch (e) {
      // The chunk can fail to load (offline): the request error is already in the caller's hands.
      console.error('Cannot show the notification', e);
    }
  }

  /** Keeps the map as small as the number of messages shown within the window. */
  private forgetOld(now: number): void {
    for (const [message, shownAt] of this.lastShown) {
      if (now - shownAt >= DUPLICATE_WINDOW_MS) this.lastShown.delete(message);
    }
  }
}
