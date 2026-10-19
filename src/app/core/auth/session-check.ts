import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SessionStore } from './session-store';

/**
 * Shown while a reloaded tab asks the API who it is signed in as. The navigation is held by the
 * guard meanwhile, so no page can say anything yet. Plain markup rather than a Material spinner:
 * it is part of the first load.
 */
@Component({
  selector: 'app-session-check',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="status">
      @if (session.checking()) {
        <p>Checking your session…</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: contents;
    }

    p {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      margin: 0;
      background: var(--mat-sys-surface);
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-title-medium);
    }
  `,
})
export class SessionCheck {
  protected readonly session = inject(SessionStore);
}
