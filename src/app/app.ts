import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SessionCheck } from '@core/auth/session-check';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SessionCheck],
  template: `
    <router-outlet />
    <app-session-check />
  `,
})
export class App {}
