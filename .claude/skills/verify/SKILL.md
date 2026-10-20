---
name: verify
description: Run the quality gates of this repo in order and read their failures (layer boundaries, zoneless tests, coverage thresholds, lockfile). Use before reporting a change as done, after editing code, tests or dependencies, and when a gate fails.
---

# Verify

CI runs the same gates. Run them in this order and stop at the first failure: the cheap static
checks come first, so a failure points at the real cause.

```bash
npm run typecheck      # ngc (templates, strict) over the app, tsc over specs, server and e2e
npm run lint           # ESLint: typescript-eslint, angular-eslint, layer boundaries
npm run format:check   # fix with: npm run format
npm test               # app tests (Vitest through `ng test`, coverage thresholds), then server tests
npm run build
npm run e2e            # builds the app, runs Chromium and Firefox; see below
```

Narrow runs while iterating: `npm test -- --include 'src/app/core/**/*.spec.ts'`,
`npm run lint -- src/app/features`. The last full run must still be the whole list above.

## When `npm run e2e` is required

Run it when the change touches routes, guards or layouts, forms and dialogs, API behaviour (the
contract, the mock server, seed data, the data layer) or list state in the URL. Component tests do
not cover the real build. A build error shows up as a web-server timeout: run `npm run build` to
see the message. A server already listening on 4010 or 4173 is reused (a stale build or mock), so
stop it first. Failure traces and screenshots land in `test-results/`: `npx playwright show-trace
<zip>`; `npx playwright test --ui` to iterate. `--grep @a11y` runs the accessibility checks alone.

## Reading failures

**ESLint `boundaries/dependencies`**

- `from elements of type "feature" ... to ... "feature"`: two features import each other. Move the
  shared piece to `shared` (UI, pure helpers) or `core` (state, data), or compose both in a parent.
- `core` to `feature`, `shared` to `core`, `contract` to anything but `contract`: the import points
  upward. Invert the dependency or move the code down a layer.
- `no policy allowing ... to elements of type "testing"`: only `*.spec.ts` files may import
  `@testing/*`.
- `boundaries/no-unknown-files`: a file lives outside every known folder. Put it in `core`,
  `shared`, `features/<name>` or add a layer to `eslint.config.js` on purpose.
- `no-restricted-imports` on `../../x`: cross a folder boundary through `@core/*`, `@shared/*`,
  `@features/*`.

**Coverage threshold** (`Coverage for lines (..%) does not meet global threshold (90%)`)

The report above the error lists files with uncovered lines. Add a test for the behaviour; do not
widen `coverageExclude` in `angular.json` or lower the threshold. Only bootstrap files
(`app.config.ts`, `app.routes.ts`) are excluded.

**Tests hang or miss an update** (zoneless)

There is no zone.js: nothing triggers change detection by itself. Call `TestBed.tick()`, await
`fixture.whenStable()` or use Testing Library's `findBy*` / `waitFor`. Call
`HttpTestingController.expectOne` for a `httpResource` only after `TestBed.tick()`.

**`typecheck` passes for the app but fails for the specs** (or the reverse)

`tsconfig.app.json` excludes `*.spec.ts` and `src/testing`; `tsconfig.spec.json` adds Vitest and
jest-dom types. A global such as `describe` missing in a spec means the file is outside the spec
tsconfig's `include`.

**Lockfile** (`npm ci` fails in CI)

Node 24 and npm 11 are used locally and in CI, so the lockfile matches. After a dependency change
run `npm install`, never edit the lockfile by hand. `eslint-import-resolver-typescript` must be
installed in a separate `npm install -D` call: its optional peer `eslint-plugin-import` caps ESLint
at 9 and makes a combined install fail to resolve.

## Report

State which gates ran and their result. Name any gate you skipped and why. Do not call the work done
with a failing gate.
