import { HttpContextToken } from '@angular/common/http';

/**
 * Marks a request whose failure the caller reports itself, so no snackbar appears: the sign-in form
 * showing "wrong password", a dialog showing a 409 banner or 422 field errors.
 */
export const SILENT = new HttpContextToken<boolean>(() => false);
