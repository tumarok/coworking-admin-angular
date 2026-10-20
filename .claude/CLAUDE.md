# Coworking Admin (Angular)

Admin console for coworking spaces: an Angular 22 SPA (standalone, zoneless, signals) over a REST
API (`/api/v1`) served by a mock backend. `README.md` describes the product and stack; this file
holds the working rules.

## Before every commit

All of these must pass; CI runs the same set.

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
npm run e2e   # when routes, forms or API behaviour change; builds the app first, Chromium and Firefox
```

`npm test` is one-shot and enforces coverage thresholds (lines and branches >= 90 % for `src/app`,
bootstrap files excluded). `npm run test:watch` is for iterating. `npm run dev` starts the mock API
(`:4010`) and `ng serve` (`:4200`, `/api` proxied to the mock); `npm run mock` starts the mock alone.

## Architecture and layer boundaries

```
src/app/
  *.ts        app.ts, app.config.ts, app.routes.ts: assemble the application
  core/       one instance per app: data layer, HTTP interceptors, auth/session, layout shell
  shared/     reusable and app-agnostic: UI, forms adapters, utils; shared/api/contract = Zod contract
  features/   one folder per slice (auth, dashboard, locations, rooms, members, bookings)
src/testing/  test setup and helpers, imported by *.spec.ts only
server/       mock API; may import only shared/api/contract
e2e/          Playwright suite; drives the built app from outside, imports nothing of it
```

Outside the code: `docker/` and `compose.yaml` (images, nginx), `.github/workflows/ci.yml`, `docs/`
(the screenshots `README.md` shows; retake them when the screens change visibly).

- Allowed imports: app files to anything; `features/*` to `core` and `shared`; `core` to `shared`;
  `shared` to `shared`; `server` to `shared/api/contract`. A feature never imports another feature:
  lift what both need into `shared` (UI, helpers) or `core` (state, data).
- `shared/api/contract` imports nothing but itself (and Zod): the mock server runs it in Node.
- ESLint enforces this (`eslint-plugin-boundaries`, `eslint.config.js`), with `default: 'disallow'`
  and `no-unknown-files`, so a new top-level folder must be added to the layer map on purpose.
- Cross a folder boundary through the aliases `@core/*`, `@shared/*`, `@features/*`; relative
  imports are `./` or one `../`. No barrel `index.ts` files: import the file you need. The one exception is
  `shared/api/contract/index.ts`, the contract's single entry (`@shared/api/contract`).
- Naming: kebab-case files named after their class, `app-` selector prefix, one concept per file,
  spec next to the code.

## API and data

- Contract first: the Zod schemas in `src/app/shared/api/contract` are the single source of truth.
  Change them first, then the mock server, then the client.
- HTTP: `provideHttpClient(withInterceptors([...]))`, no `withFetch()` (deprecated in v22, fetch is
  the default backend). Errors: 401 ends the session, 404 shows "not found", 409 and 422 are handled
  in the form (the request is marked "silent"), everything else becomes a snackbar.

## Data layer

Everything that talks to the API lives in `core/api` and `core/http`; features only declare what
they need.

- **Query.** `createQuery({ request, tags, parse })` wraps `httpResource`; `tags` is required (`() => []` when
  there is nothing to invalidate). `request` is a function
  over signals (`undefined` skips the request), `url` is an endpoint path (`/rooms`, the base URL is
  added by an interceptor), `params` go through `serializeParams` (unset, empty and `''` values are
  dropped, arrays repeat the key, dates become ISO). `value()` keeps the last result while the same
  endpoint reloads (paging, refresh, invalidation) but is `undefined` for a different URL, so a
  detail page never shows the previous record; `error()` is an `ApiError` (`status`, `message`, `fieldErrors`, `conflicts`);
  `refresh()` skips the cache once.
- **Tags.** A query names what it shows, derived from its inputs and never from the response:
  `[idTag('Room', id())]` for a detail, `[listTag('Room')]` for a list. A mutation names what it
  makes stale: `savedTags(type, ...ids)` after create/update (no ids for create) and
  `removedTags(type)` after delete. Both add the entities that embed the changed one (a room change
  also reloads bookings, locations and the dashboard), so a new entity relation is one line in
  `EMBEDDED_IN` in `tags.ts`.
- **Mutation.** `createMutation({ request, invalidates, parse })`: `run(arg)` resolves with the result and
  rejects with the `HttpErrorResponse`; `isPending()` and `error()` are signals. Tags are invalidated
  only after a success.
- **Contract check.** `parse: parseResponse(schema, 'GET /rooms')`, on queries and mutations. A mismatch is logged with
  `console.error` and the raw data is still returned: contract drift must not become an outage.
- **Cache.** `CacheStore` keeps API GET responses for 60 s, keyed by URL and reused only by a
  request with the same tags; JSON answers only. An entry is dropped when one of its tags is
  invalidated or the TTL ends; identical requests in flight share one call.
  Sign-out must call `CacheStore.clear()`; a 401 must not.
- **Errors.** The error interceptor shows a snackbar (`Notifier`) for every failed API request,
  except a 401 outside the sign-in: that belongs to the session, which says "session expired" once.
  Mark a call `silent: true` in `createMutation` (or the `SILENT` context token) when its UI shows
  the error itself: the sign-in form, 409 and 422 in dialogs. Deletes and status changes stay
  non-silent, so a 409 on delete reaches the user as a snackbar.
- **Endpoint paths.** Queries and mutations pass paths like `/rooms`; they are marked with
  `API_ENDPOINT`, which is what makes the base-URL interceptor prefix them. Other `HttpClient` calls
  (assets, third-party hosts) are never touched by the interceptors.
- **Session hooks.** `ACCESS_TOKEN` (returns `string | null`) and `ON_UNAUTHORIZED` are injection
  tokens; the session store provides both. The hook receives the token the failed request carried
  and runs once per failed request, so it must be idempotent and must ignore a token that is no
  longer the current one (a late answer after a sign-out or a new sign-in).
- **Tests.** `HttpTestingController` with `provideApi()` for counting requests; `installMockApi()`
  with `provideTestApi()` for the real pipeline against the mock. Zoneless: `TestBed.tick()` starts a
  resource's request, `ApplicationRef.whenStable()` waits for its answer, `vi.waitFor` for MSW.

## Shell, theme, list state

- **Theme.** `src/styles/global.scss` is the single style entry (`_theme.scss`, `_tokens.scss`,
  globals). Material 3 through `mat.theme(...)` on `html` with `theme-type: color-scheme` and
  `color-scheme: light dark`: every `--mat-sys-*` colour is `light-dark(...)`, so the system
  preference picks the scheme with no class and no second stylesheet. Use `--mat-sys-*` tokens in
  component styles, never raw colours. System font stack, no webfont. Heavy component tokens
  (`--mat-table-*`, `--mat-toolbar-*`, `--mat-sidenav-*`) are set in the component that uses them,
  not in the root theme.
- **Status colours.** `--status-<tone>-clr|bg|brd|txt` in `_tokens.scss`, tones `success`, `info`,
  `warning`, `danger`, `contrast`, `neutral`. `shared/ui/status-tone.ts` maps a status value to its
  tone; `app-status-chip` draws it. Text contrast on the chip is at least 4.5:1 in both schemes
  (computed, stated in `_tokens.scss`); recompute when a colour changes.
- **Icons.** `app-icon` draws inline Material Symbols paths (`shared/ui/icon-paths.ts`): no font,
  no request. Add an icon by adding its path there. Icons are decorative: the label or the
  button's `aria-label` carries the meaning. Size with `<app-icon size="1.125rem">`, not styles.
- **Material in the first load.** Do not import a Material module's tokens or providers in
  `app.config.ts`: it pulls the whole module into `main`. A root `MAT_DIALOG_DEFAULT_OPTIONS` alone
  cost about 70 kB, so dialogs get their config where they open (see `ConfirmDialog`). If a default
  is ever needed, build it from `new MatDialogConfig()`: the token replaces Material's defaults
  instead of merging with them. The snackbar loads lazily inside `Notifier`.
- **Shell.** `core/layout/shell` is the lazy parent route of every signed-in page: top bar (with
  the account menu), sidenav (side on wide screens, a drawer below 960 px), skip link, `<main id="main">`. The page
  scrolls inside the sidenav content, so on a path change the shell resets scroll and moves focus to
  `<main>` itself (a query-only change does neither). The drawer starts closed again when the
  screen crosses the 960 px breakpoint. Nav
  entries live in `nav-items.ts`. `PageTitleStrategy` sets `<title>` to `Page · Coworking Admin`
  from each route's static `title`: give every route a `title`.
- **Routes.** Lazy everywhere (`loadComponent` / `loadChildren`), inputs bound from route and
  query params (`withComponentInputBinding`). `**` is the real 404 page inside the shell.
- **List state.** `withListParams({ filters: { status: enumFilter(STATUSES) } })` is an NgRx
  SignalStore feature: `page`, `limit`, `q` and typed filters live in the URL query and nowhere
  else. `params()` is computed from the URL (garbage falls back to defaults, `limit` is capped at
  the API maximum); `setPage`, `setLimit`, `setSearch`, `setFilter`, `paginate`, `reset`, `patch`
  only navigate (`replaceUrl`, `merge`), and any change but the page resets to page 1. Calls made
  before a navigation ends compose, because writes build on the state last requested, not on the
  URL that has not caught up yet. Provide the
  store on the page component (`providers: [ListStore]`), not in root, or it reads the root route.
  Feed `params()` to `createQuery`; it compares by value, so one change is one request.
  Filter codecs: `textFilter`, `enumFilter(values)`, `dateFilter`.
- **Table.** `app-data-table` takes `caption`, `columns`, `rows` (`undefined` while loading),
  `total`, `page`, `limit`, `fetching`, `error`, optional `selection` (a CDK `SelectionModel` the
  page owns). Loading, error with retry and empty each draw in the table body, and the page words
  the empty one with `emptyMessage` (the default says only "Nothing to show."; say "filters" only
  when filters can be the reason); a progress bar shows for refreshes of rows already on screen; `(pageChange)` goes
  straight to `store.paginate`. A column's `link` may return `undefined` for a row, which then reads as plain text. Custom cells: `<ng-template appCell="key" let-row>`.
- **Confirm.** `ConfirmDialog.confirm({ title, message?, confirmLabel?, danger? })` resolves
  `true` only on confirm. `danger` starts focus on Cancel; the message is the dialog's accessible description.
- **Formatting.** `shared/util/format.ts`: money is cents -> EUR; dates always take an explicit
  IANA zone (default UTC, never the browser's). Pipes: `money`, `zoned`, `timeRange`.
- **jsdom.** `Element.scrollTo` and `scrollIntoView` are stubbed in `src/testing/setup.ts`. The CDK reads the legacy
  `keyCode`, which `userEvent.keyboard('{Escape}')` leaves at 0: use
  `fireEvent.keyDown(el, { key: 'Escape', keyCode: 27 })` to close dialogs and drawers.
  `provideTestApp()` and `provideTestApi()` switch Material animations off.
- **Spec that crosses layers.** A spec may only import its own layer, so the check that a real
  page works (list state + query + table against the mock API) lives next to the app files:
  `src/app/list-page.integration.spec.ts`; so do the specs that run a section inside the real
  routes, guard and shell (`src/app/locations.integration.spec.ts`).

## Auth and forms

- **Session.** `core/auth/SessionStore` (root NgRx SignalStore): `token`, `user`, `checking`,
  `isAuthenticated`, `loginPending`; `login(credentials)` (rejects with the `HttpErrorResponse`, the
  form words it), `loadUser()`, `logout()`, `expire()`. The token lives in `sessionStorage`
  (`coworking-admin.token`, per tab) and is read synchronously when the store is created, so the first
  navigation already sees a reloaded tab as signed in; the user comes from `GET /auth/me`.
  `provideAuth()` (not `app.config.ts`, which is coverage-excluded) wires the store to
  `ACCESS_TOKEN` and `ON_UNAUTHORIZED`. The store is in the first load, so it types the `login` and
  `me` responses without the Zod schemas (they would more than double the initial bundle).
- **Sign-out vs expiry.** `logout()` clears token, user and the whole `CacheStore`, then goes to `/login`
  (replace). A successful `login()` also clears the cache (the previous session may have been
  another user's). `expire(sentToken)` (a 401 outside the login URL) acts only when `sentToken` is
  the current token: it clears token and user only, shows "session expired" once and goes to
  `/login` keeping the page; a stale 401 (earlier token, none, after sign-out) does nothing. Do not
  clear the cache there: live queries would restart and fail again.
- **Guards.** `authGuard` is on the shell route: no token goes to `/login` (`RedirectCommand`, replace),
  a token without a user waits for `loadUser()` while the app root shows "Checking your session…"
  (`app-session-check`), a non-401 failure of `me` lets the visitor in. `guestGuard` on `/login` sends a
  signed-in visitor to the return page or `/`. `/login` sits outside the shell.
- **Return path.** Travels in navigation state and in the `?from=` query (the query survives a copied
  link). Only `safeReturnUrl()` values are used: `/…` inside the app, never `//…`, a backslash,
  control characters or `/login`. Read it with `readReturnUrl(state, query)`; build redirects with
  `loginRedirect()`.
- **Forms.** Signal Forms (`@angular/forms/signals`, stable in 22.2) with Zod through Standard Schema:
  `form(model, (path) => { validateStandardSchema(path, schema); }, { submission: { action } })`,
  `<form [formRoot]="f">`, `[formField]="f.name"` on a `matInput`. No adapter: use the contract's
  schema, or one derived from it, so the form and the API agree. Show field errors only after
  `touched()`. Use `disabled(path, { when })` (a bare function is deprecated), and `metadata(path.x,
REQUIRED, () => true)` to mark a field required without a second validator. Import `MatSuffix`
  when a button sits in a form field's suffix, or it is not rendered.
- **`app-form-field`** (`shared/forms`): label, required marker, hint, error. Pass the errors to show
  (`f.x().touched() ? f.x().errors() : []`), bind the control through a template reference:
  `[id]="ref.inputId"` and `[aria-describedby]="ref.describedBy()"` (an input of `matInput`; Material
  owns the attribute). The error is a `role="alert"` so a blur-time error is announced.
- **Server errors on a page form.** Catch the rejected `run()`, keep the message in
  `linkedSignal({ source: model, computation: () => null })` so the first edit clears it, and show it
  in a `role="alert"` block above the fields. Mark the request `silent` so no snackbar duplicates it.
- **Login page.** Lazy chunk (Zod and the form code stay out of the first load); the form is disabled
  while the request runs (so focus returns to the password after a refusal) and the button waits for
  a valid form. A browser does not submit through a disabled button, so Enter in a field of an
  invalid form marks the fields touched to show what is wrong.
- **Dialogs.** Money is integer cents in the API and euros in the form. Booking times are
  wall-clock in the location's time zone. Dialogs stay open on 409/422 (see Features).

## Features

A feature is a vertical slice, `features/<name>`, modelled on `locations`; the `add-feature` skill
has the checklist.

```
<name>.routes.ts   lazy routes, a `title` on each, one `loadChildren` entry in app.routes.ts
data/              inject<Entity>sQuery / inject<Entity>Query / injectCreate / injectUpdate / injectDelete
store/             list state: signalStore(withListParams(...)), provided on the list page
pages/             list page and details page
dialogs/           form dialog (lazy), its opener, its form values
```

- **Data factories** are functions that call `createQuery` / `createMutation` in an injection
  context and take signals as functions (`params: () => ...`). Tags come from the inputs; create and
  update are `silent` (the dialog words the refusal), delete is not (a 409 is a snackbar).
- **List page.** `app-page-header`, `app-list-toolbar` with `app-search-input` (300 ms debounce, Enter
  and blur send at once; it follows the URL, so Back restores the text) and `app-filter-select`,
  `app-data-table`. One change of state is one request. "Clear filters" moves focus to the first
  control, as the button leaves. Dropdown options are `SelectOption` (`shared/ui/select-option.ts`).
- **Details page.** `app-page-header` with a back link, `app-details-list`, and the four states:
  record, loading (`role="status"`), 404 (`app-empty-state`, link to the list), other failure
  (message and retry). Delete: `ConfirmDialog`, then the mutation, a success snackbar naming the
  record, and `navigate(..., { replaceUrl: true })`. Another feature's data is a count and a link.
- **Form dialog.** Opened by `open-<entity>-form.ts` with a dynamic `import()`, so the select, time
  picker and date-fns stay out of the page's chunk; the whole `MatDialog` config is passed there
  (no defaults are merged) with `autoFocus: '[data-autofocus]'`, and `restoreFocus` returns focus to
  the button that opened it. The form is Signal Forms with the contract's input schema, submitted
  with `submission: { action, ignoreValidators: 'all' }`. Save needs `!hasBlockingErrors(form)`, a
  changed form (`deepEqual`) and no save in flight, not `form().valid()`; the fields are disabled
  while it saves. The action itself checks `hasBlockingErrors` and, if it is true, shows the
  problems (`markAsTouched`, `focusFirstInvalid`) instead of sending.
- **Server errors in a form.** The save is silent and its action returns
  `serverErrors(form, parseApiError(error))` (`shared/forms/server-errors.ts`): a 422's `fieldErrors`
  become errors on the fields named by their keys (dotted paths work), and the key `_`, an unknown
  key and every other failure become errors on the form itself, shown by `app-form-banner` through
  `formLevelMessages(form)`. Signal Forms drops a field's error when its value changes and the
  form's own errors when anything changes, so nothing is cleared by hand. Errors on a field block
  Save until that field is edited; errors on the form itself (a 409, a 502, a lost connection) do
  not, so the same form can be sent again with no pointless edit (`hasBlockingErrors`). After the
  next render `focusFirstInvalid(form)` focuses the first field with an error, or the form's first
  control when only the banner has one. `visibleErrors(field, ...dependsOn)` is what `app-form-field`
  shows: after the field was touched, or any field it is compared with (`visibleErrors(form.closesAt,
form.opensAt)`; use it for booking start and end).
- **`app-time-field`** (`shared/forms`) is a `FormValueControl<string>` for `"HH:mm"` (touched on blur
  and when the list closes) over
  `mat-timepicker` and the date-fns adapter (`@angular/material-date-fns-adapter`, provided on the
  component with the `en-GB` locale and a 24-hour format, so only forms with a time field load
  date-fns). `shared/util/time-of-day.ts` converts between the string and the `Date` the picker
  needs. Bind `[inputId]` and `[describedBy]` from the `app-form-field` around it.
- **`app-date-field`** (`shared/forms`) is the same for a calendar day (`"YYYY-MM-DD"`, `''` for none) over
  `mat-datepicker` and the date-fns adapter: typed day-first (`14/10/2026`) or year-first, or picked. A year
  not typed in full counts as no day, so a form or a list filter does not chase every keystroke. Name it with
  `app-form-field` (`[inputId]`) or, as a list filter, with `ariaLabel`; `earliest`/`latest` bound the
  calendar (`min`/`max` are Signal Forms' own inputs and NG8022 on `[formField]`).
- **`app-autocomplete-field`** (`shared/forms`) chooses one record among too many for a dropdown: the page runs
  the server-side search (`(searchChange)`, 300 ms debounce, trimmed text) and passes `options`; the value is the
  chosen id and editing the text clears it. `selectedLabel` shows a choice the options do not hold (an edit, a
  prefill); `total` makes the live region say "57 matches, showing the first 20". Mark the first field with
  `[initialFocus]` (it puts `data-autofocus` on the inner input). Look-ups are the feature's own queries in
  `data/` (`bookings/data/room-lookups.ts`), one for the search and one by id.
- **Times and zones.** `shared/util/timezone.ts`: `zonedToUtcIso(date, time, zone)` and `utcToZoned(iso, zone)`.
  A booking form reads the day and the times on the chosen room's location's clock; the 8-hour rule is judged
  on the instants, so the night the clock changes counts its real hours (`slotProblem` asks the contract's own
  schema). A location's zone comes from a query of the feature (`injectLocationById`), and Save waits for it.
  Lists draw no time before the zones are known, and say "UTC" for a booking whose location is gone.
- **Banner with links.** `app-form-banner` takes `links` (records the message is about, opened in a new tab; the
  messages then read bold). `serverErrors(form, error, rename)` maps API keys to differently named fields
  (`startsAt` -> `startTime`).
- **Filters from the address that name a record** (`?memberId=`, `?roomId=`) show as a removable `mat-chip` with
  the record's name (looked up by id; "Unknown member" when that fails), count for `hasActiveFilters`, and
  removing one moves focus to the toolbar (`ListToolbar.focusFirst()`). A filter value that the options do not
  list is added by `withCurrentOption` (`shared/ui/select-option.ts`).
- **Selects in forms.** `mat-select` takes `[aria-labelledby]="field.labelId"`: a label's `for` only
  names native controls.
- **Numbers in forms.** A native `type="number"` input holds `number | null` (empty is `null`), so the
  form's type is the schema's _input_ type (`z.input`) and the schema words the empty case
  (`z.number().nullable().pipe(z.number({ error: 'Enter a rate' }))`). `min`/`max` attributes on a
  `[formField]` input are NG8022; leave them to the schema. An amount in euros is checked in euros
  and turned into cents by the schema itself (`.transform(eurosToCents)`), so `schema.parse(model)` is
  the API input (`rooms/dialogs/room-form-values.ts`).
- **Dialog layout.** Every form dialog uses `styleUrl: '../../../shared/forms/form-dialog.scss'`
  (grid of fields, `.wide`, banner, number inputs).
- **A dropdown of another feature's records** (rooms need locations) is a query of the feature's own
  in `data/` (`rooms/data/location-options.ts`), as features do not import each other.
- **Tests with `mat-select`.** jsdom drops the `tabindex` of a `mat-select` once it is used, so
  `.focus()` on it does nothing there; assert focus moves to a text field, and look at the select in a
  browser.
- **Bulk actions on a list** (`bookings`). The page owns a `SelectionModel<Booking>` (compared by `id`) and passes it
  to `app-data-table` with `rowLabel`; it is cleared when `params()` changes and loses a row a reload took away. With
  rows ticked, `app-bulk-actions-bar` (a live "{n} selected", Confirm, Cancel) reports the action and the page sends
  `injectBulkBookings()`; cancelling asks `ConfirmDialog` first. The mutation is not silent (a request that fails as a
  whole is a snackbar and keeps the selection); `failed` entries of a success are the partial-failure path:
  `injectBulkResultDialog()` (`open-bulk-result.ts`, lazy) lists them as links with the server's reason, worded by
  labels read before the request. Afterwards the selection is cleared and focus goes to the toolbar's first control
  (the bar is gone), before the dialog opens, so closing it returns focus there. Only `updated` ids invalidate.
- **Dashboard** (`features/dashboard`, the page at `/`). Not a list, so no `withListParams`: `DashboardStore` (provided
  on the page) holds the day from `?date=YYYY-MM-DD` (garbage and none are today in UTC; today and a cleared box
  take the parameter off, `replaceUrl`). `injectDashboardQuery(date)` is tagged `listTag('Dashboard')`, so any booking,
  room, location or member change reloads it. Another day keeps the last figures on screen, dimmed (`aria-busy`),
  because the endpoint is the same; a failed day shows the error, never the previous day's figures. The date box
  commits a cleared or unfinished text when it is left, not while typed (it would snap back to today under the
  cursor). The next bookings carry no time zone, so they read in UTC with the suffix (`shared/util/time-span.ts`,
  shared with the bookings list). Charts are CSS and `mat-progress-bar`, no library.
- **Notifier.** `success(message)` is a polite snackbar of 4 s, `error(message)` an assertive one of
  6 s; the same text twice within a second shows once.

## Tests

- Unit and component tests: Vitest through `ng test` (`@angular/build:unit-test`, jsdom), no
  separate Vitest config; options live in `angular.json`. Globals (`describe`, `it`, `expect`) and
  jest-dom matchers need no imports.
- Render with Testing Library (`render`, `screen`); query by role and accessible name, not by CSS.
  Use `userEvent` for interaction.
- Specs that need the router or HTTP use `provideTestApp()` from `@testing/test-providers`. HTTP is
  answered through `HttpTestingController`.
- Zoneless: there is no zone.js, so use `TestBed.tick()`, `fixture.whenStable()`, `findBy*` and
  `waitFor`, never `fakeAsync`. Fake only `Date` when time matters
  (`vi.useFakeTimers({ toFake: ['Date'] })`).

## E2E (Playwright)

- **Run.** `npm run e2e` is `playwright test`: the `webServer` entries start the mock (`npm run mock`,
  `:4010`, no latency) and build the production app, which `e2e/support/serve-dist.ts` serves on `:4173`
  (static files, `index.html` for app routes, `/api` forwarded to the mock; `node:http` only). Chromium and
  Firefox, one worker (the mock has one database), 0 retries locally and 1 in CI. Locally a server already
  on those ports is reused, so a stale build means: stop it. Install the browsers once with
  `npx playwright install chromium firefox` (CI adds `--with-deps`). Narrow a run with
  `npx playwright test -g "title" --project=chromium`.
- **Isolation.** The auto fixture `api` (`e2e/fixtures.ts`) calls `POST /api/v1/__reset` before every test and
  signs in as the admin through the API. `signedInPage` is a page that already holds the token (in
  `sessionStorage`, once per tab, so a sign-out is not undone by the next navigation); auth specs use the
  plain `page`. Test data comes from `api` and `support/data.ts` (`createLocation`, `createRoom`,
  `createMember`, `createBooking`), not from clicks, except for the flow the test is about. The seed depends
  on today's date: read figures from the API, never hard-code them.
- **Page objects** (`e2e/pages/`): one class per page or dialog, built on a `Page`, exposing locators and
  intent-level methods (`openNewBookingForm()`, `submitAndClose()`), no assertions that belong to a
  scenario. Locate by role and accessible name; the few exceptions are named in the class (the snack bar
  has no role, so `Notifications` uses the `mat-snack-bar-container` tag; the details list finds a value by
  its term). Shared pieces: `DataTable`, `ListToolbar`, `ConfirmDialog`, `FormDialog`, `DetailsList`,
  `controls.ts` (`chooseOption` for `mat-select`, `chooseFromSearch` for `app-autocomplete-field`).
- **Waiting.** Only web-first assertions (`toBeVisible`, `toHaveText`, `toHaveURL`, `toHaveCount`); no
  `waitForTimeout`, no `force`, no `networkidle`. After a navigation wait for the page's heading before
  typing: a lazy route replaces the component, and text typed into the old one is lost. A negative check
  (`toHaveCount(0)`) passes at once, so assert the positive state first.
- **Boundaries.** `e2e/` is its own ESLint element: it may import itself, `@playwright/test`,
  `@axe-core/playwright` and Node, nothing of `src/` or `server/`. It has its own `tsconfig.e2e.json` (no
  path aliases), which `npm run typecheck` includes. API shapes are small local interfaces.
- **Accessibility.** `expectAccessible(page)` (`support/a11y.ts`) runs axe with the WCAG 2.0/2.1 A and AA
  tags plus best practices and fails with each rule and its selectors. Tests whose title has `@a11y` cover
  every screen and the open dialogs, the dashboard, the bookings list and the booking form in light and
  dark (`page.emulateMedia({ colorScheme })`); run them alone with `--grep @a11y`. Fix the app for a
  violation; exclude a rule only with a one-line reason next to the call.
- **Debugging.** `npx playwright test --ui` (watch mode with a timeline), `--headed`, `--debug`;
  a failure leaves `test-results/<test>/trace.zip` and a screenshot: `npx playwright show-trace <zip>`.
  CI writes `playwright-report/`: `npx playwright show-report`. Both folders are git-ignored.
- **A new screen** gets a page object, a spec for its flows and an `@a11y` check (see `add-feature`).

## CI and containers

- **Workflow** `.github/workflows/ci.yml` (`CI`, on push to `main`, `v*` tags and pull requests; one run per
  ref, a newer push cancels the older). `checks`: typecheck, lint, format:check, `npm test`, build, on the
  Node of `.nvmrc`. `e2e` (after `checks`): Chromium and Firefox with `--with-deps`, and the
  `playwright-report` artifact (7 days) when it fails. `images` (after both, pushes only, never a pull
  request): builds the two images below and pushes them to GHCR with `GITHUB_TOKEN`; tags are `latest`
  (`main` only), `sha-<commit>` and, for a `v1.2.3` tag, `1.2.3` and `1.2`; the build cache is kept per image.
- **Images.** `ghcr.io/<owner>/coworking-admin-angular` (`docker/web.Dockerfile`: `npm run build`, then the
  official `nginxinc/nginx-unprivileged` image, user `nginx`, port **8080**) and
  `ghcr.io/<owner>/coworking-admin-angular-api` (`docker/api.Dockerfile`: `npm run build:mock` bundles
  `server/index.ts` with esbuild into one `mock.mjs`, with the contract, zod and faker; the final stage is
  `node:24-alpine` with that file only, user `node`, port 4010).
- **nginx** (`docker/nginx/`): the official image renders `default.conf.template` at start with
  `API_UPSTREAM` (default `http://api:4010`; nginx resolves the host once at start, so the API must be
  reachable then). `/api/` is proxied, a route falls back to `index.html` (`no-cache`), built files with a
  content hash in the name are `immutable` for a year and a missing one is a 404 (never the shell), other files
  of `public/` cache for a day. `add_header` in a location replaces the server's, so each location includes
  `security-headers.conf`. No CSP on purpose: Material injects inline styles, so one needs a browser check.
- **Compose** (`compose.yaml`, project `coworking-admin-angular`): `docker compose up --build` serves the app
  on `http://localhost:8080` (`web` waits for the API's healthcheck; the API port is not published).
  `MOCK_LATENCY_MS` (default 150) and `GHCR_OWNER` can be set in the environment. `docker compose down`
  stops it.
- **E2E against the containers.** `E2E_BASE_URL=http://localhost:8080 npm run e2e` uses that address as
  `baseURL`, starts no web server and reaches the API through the same origin (`/api/v1`, proxied by nginx),
  so it tests the images, not the working tree. The suite must pass with the compose latency: assert a
  state that ends, not one that a loading table also passes through.

## Decisions and reasons

- Angular 22, no zone.js: change detection is zoneless by default, in the app and in TestBed.
- TypeScript ~6.0: typescript-eslint 8.71 supports TypeScript below 6.1.
- ESLint 10 with flat config; `"type": "module"` in `package.json` so `eslint.config.js` loads as
  an ES module without a reparse warning.
- `eslint-import-resolver-typescript` lets `eslint-plugin-boundaries` resolve the `@core/*` style
  aliases from `tsconfig.json`. Install it in its own `npm install -D` call: its optional peer
  `eslint-plugin-import` caps ESLint at 9, which makes a combined install fail to resolve.
- `eslint-plugin-boundaries` 7 has a new policy syntax (`boundaries/dependencies`). Elements are
  matched by folder; the files directly in `src/app` are a file category (`app-root`), because a
  folder element for `src/app` would swallow `core`, `shared` and `features`.
- `date-fns` 4 and `@angular/material-date-fns-adapter`: the date adapter `mat-timepicker` needs;
  the adapter's `MAT_DATE_LOCALE` must be a date-fns locale object (`date-fns/locale/en-GB`), not
  a string.
- Node 24 and npm 11 locally and in CI, so the lockfile is the same everywhere (`.nvmrc` = 24);
  `engines` allows Node >= 22.12, the Angular 22 minimum.
- Query and mutation factories on `httpResource` with an own tag cache (`core/api`, about 500 lines) rather
  than a query library: `httpResource` gives signals and cancellation, and the missing piece is invalidation
  across screens (a room edit reloads the bookings that embed it), which `EMBEDDED_IN` states in one place.
- The mock server is in the repo and runs the contract in Node: the e2e suite and the Docker demo use it
  as it is, and component tests mount the same core as MSW handlers, so they run the real HTTP pipeline.
- The session store types the `login` and `me` responses by hand: the Zod schemas would more than double
  the initial bundle. Everything else is parsed by the contract (non-blocking).
- `e2e/` imports nothing of `src/` or `server/`, so the suite tests the built app as a user sees it;
  API shapes there are small local interfaces.
- The mock image is one esbuild bundle (`npm run build:mock`) on `node:alpine`, not a copy of
  `node_modules`; the web image is `nginx-unprivileged`, which needs no root and no capabilities.

## Conventions

- UI text, code, comments and docs in English.
- Commits: Conventional Commits (`feat(bookings): …`, `fix`, `test`, `ci`, `docs`, `chore`), a subject
  of at most about 72 characters, a body explaining why the change was made; no trailers of any kind
  (no `Co-Authored-By`, no session links).
- Prettier formats everything (`npm run format`); the hook in `.claude/hooks/format.mjs` runs it on
  every file Claude edits or writes.
- Skill `verify` runs the gates and explains typical failures. Skill `add-feature` is the checklist
  for a new entity screen, and agent `feature-builder` follows it; agent `reviewer` reads a pending diff
  against these rules. `.mcp.json` registers the Playwright MCP server for looking at a screen in a
  browser (its output goes to `.playwright-mcp/`, git-ignored). Personal overrides go to
  `.claude/settings.local.json` (git-ignored).
