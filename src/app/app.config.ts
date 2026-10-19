import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, TitleStrategy, withComponentInputBinding } from '@angular/router';
import { provideApi } from '@core/api/provide-api';
import { provideAuth } from '@core/auth/provide-auth';
import { PageTitleStrategy } from '@core/layout/page-title-strategy';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Route parameters and query parameters arrive as component inputs.
    provideRouter(routes, withComponentInputBinding()),
    { provide: TitleStrategy, useClass: PageTitleStrategy },
    provideApi(),
    provideAuth(),
  ],
};
