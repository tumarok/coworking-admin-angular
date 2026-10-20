---
name: add-feature
description: Checklist for adding a feature slice (list, details, create/edit dialog) to this app by the model of `locations`. Use when building a screen for a new entity, before writing code.
---

# Add a feature

`src/app/features/locations` is the model: copy its structure, not its words. Read it first, then
follow the order below; each step is small enough to check before the next.

```
features/<name>/
  <name>.routes.ts          lazy routes, every one with a `title`
  <name>-options.ts         option lists the pages and the dialog share
  data/                     <entity>-queries.ts, <entity>-mutations.ts (+ specs)
  store/                    <entity>-list-store.ts: withListParams, provided on the page
  pages/                    <entity>s-page (list), <entity>-details-page (.ts .html .scss .spec.ts)
  dialogs/                  <entity>-form-dialog (lazy), open-<entity>-form.ts, <entity>-form-values.ts
```

## 1. Contract and mock

The entity's schemas live in `src/app/shared/api/contract/<entity>.ts` and the mock in
`server/core/api.ts`. A new entity starts here: add the schemas, the seed data and the routes to
the mock (with tests in `server/core/api.test.ts`), then the client. For an entity that exists
already, check the input schema's messages and the delete rule (409 text), because the form and the
tests quote them. Always change the contract first, then the mock, then the client.

## 2. Data (`data/`)

- `inject<Entity>sQuery(params)` and `inject<Entity>Query(id)` over `createQuery`: tags from the
  inputs (`listTag`, `idTag`), `parse: parseResponse(schema, 'GET /x')`. Send only the API's params
  (see `location-queries.ts`).
- `injectCreate…`, `injectUpdate…` (both `silent: true`, the form shows the refusal) and
  `injectDelete…` (not silent: a 409 becomes a snackbar). `invalidates` uses `savedTags` /
  `removedTags`; a new relation between entities is one line in `EMBEDDED_IN` (`core/api/tags.ts`).
- Specs follow `location-mutations.spec.ts`: requests, what reloads after each write, what must
  not, the silent and non-silent failures.

## 3. List state (`store/`)

`signalStore(withListParams({ filters: { … } }))` with a filter codec per URL filter. Provide it
in the page's `providers`, never in root.

## 4. Pages (`pages/`)

- **List:** `app-page-header` (title, subtitle, "New …"), `app-list-toolbar` with
  `app-search-input` and `app-filter-select`, `app-data-table` with the query's `value`, `error`
  and `refresh`. Word the empty state yourself (`hasActiveFilters()` decides). Creating navigates to
  the new record's page.
- **Details:** `id = input.required<string>()`, `app-page-header` with a back link, Edit and
  Delete, `app-details-list` (+ `appDetailValue` templates), then three other states: 404 is an
  `app-empty-state` "… not found" with a link to the list, another error is "Could not load …"
  with a retry, loading is a `role="status"` line. Delete asks `ConfirmDialog` (danger), runs the
  non-silent mutation, then `Notifier.success` and `navigate([...], { replaceUrl: true })`.
- A feature never imports another feature. What belongs to another entity (a location's rooms) is a
  count and a link with query parameters, until a shared piece exists.

## 5. Dialog (`dialogs/`)

- Values file: the form's model type is the contract's input type; `to<Entity>FormValues(record?)`
  gives the defaults or the record's values.
- Component: Signal Forms with the contract's schema (`validateStandardSchema`), `[formRoot]` with
  `submission: { action, ignoreValidators: 'all' }`, `app-form-field` + `visibleErrors(field,
...dependsOn)` for each field (name the other field of a comparison, such as start for end),
  `app-form-banner` for `formLevelMessages(form)`, `app-time-field` for `HH:mm`.
- Save is enabled when `!hasBlockingErrors(form)`, the form is changed (`deepEqual` against the
  starting values) and no save is pending; never `form().valid()`, which a 409 or a dropped
  connection would keep false until a pointless edit. The action re-checks `hasBlockingErrors` and
  reveals the problems instead of sending. It returns `serverErrors(form, parseApiError(error))`, and
  `focusFirstInvalid` runs after the next render (the fields were disabled while saving).
  Success: `Notifier.success`, `ref.close(saved)`.
- Styles: `styleUrl: '../../../shared/forms/form-dialog.scss'`, shared by every form dialog. Choices
  from another feature's records (a location for a room) come from a query of your own in `data/`.
  Numbers: see "Numbers in forms" in `CLAUDE.md`.
- A choice among many records (a room, a member) is `app-autocomplete-field` with a server-side search and a
  look-up by id of your own in `data/`; a calendar day is `app-date-field`; a time that belongs to a place is
  read on that place's clock (`shared/util/timezone.ts`). See "Features" in `CLAUDE.md`.
- `open-<entity>-form.ts` loads the component with a dynamic `import()` and passes the whole dialog
  config (width, `autoFocus: '[data-autofocus]'`, `restoreFocus`): Material does not merge it with
  defaults. Mark the first field `data-autofocus`.

## 6. Routes and navigation

Add `<name>.routes.ts` (lazy `loadComponent`, a `title` on each route) and one `loadChildren`
entry in `src/app/app.routes.ts`, above the `**` route. The nav entry already exists in
`core/layout/nav-items.ts`; the new section's entry must show as current on sub-pages.

## 7. Tests

Testing Library, `installMockApi()` + `signIn()` + `provideTestSession(routes)`, queries by role and
name. Per feature: the list (rows, search to URL with one request, each filter, pagination, empty,
error and retry), the details (facts, 404, error and retry, delete confirmed, cancelled and refused
with a 409, edit), the dialog (create, edit, unchanged disables Save, client validation, 422 under
the fields, 409 and network banners that leave Save usable, the dialog stays open, focus on the
first problem and, after a banner, on the first field; focus back on the opener; busy state), the routes, and an app-level spec (`src/app/<name>.integration.spec.ts`: guard, shell,
titles). Coverage stays above 90 % overall and 95 % for the feature.

## 8. End to end

Page objects for the list, the details and the dialog in `e2e/pages/` (roles and accessible names,
built on the shared `DataTable`, `ListToolbar`, `FormDialog`, `ConfirmDialog`), and a spec
`e2e/<name>.spec.ts` on the model of `locations.spec.ts`: create (through the UI), edit, delete, the
refusal (409 snack bar, 422 under the field), the list's search and filters in the URL. Prepare data
through the `api` fixture and `support/data.ts`. Add an `@a11y` check of the list, the details and the
open dialog to `e2e/a11y.spec.ts`, and look at the screens once in a browser (light and dark scheme, a
narrow screen, console clean). See "E2E" in `CLAUDE.md`.

## 9. Gates

Run the `verify` skill. Do not commit; leave the diff for review.
