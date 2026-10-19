import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type FieldTree, form, submit } from '@angular/forms/signals';
import type { ApiError } from '@shared/api/api-error';
import { fieldAt, formLevelMessages, hasBlockingErrors, serverErrors } from './server-errors';

const SERVER = 'server';

interface Values {
  name: string;
  hours: { opensAt: string; closesAt: string };
  tags: string[];
}

const apiError = (overrides: Partial<ApiError>): ApiError => ({
  status: 422,
  message: 'Validation failed',
  fieldErrors: {},
  conflicts: [],
  ...overrides,
});

describe('server errors on a form', () => {
  let model: ReturnType<typeof signal<Values>>;
  let f: FieldTree<Values>;

  beforeEach(() => {
    model = signal<Values>({
      name: 'Kyiv',
      hours: { opensAt: '08:00', closesAt: '20:00' },
      tags: ['a'],
    });
    f = TestBed.runInInjectionContext(() => form(model));
  });

  describe('fieldAt', () => {
    it('finds a field by its key, a nested one by its dotted path and an item by its index', () => {
      expect(fieldAt(f, 'name')).toBe(f.name);
      expect(fieldAt(f, 'hours.closesAt')).toBe(f.hours.closesAt);
      expect(fieldAt(f, 'tags.0')).toBe(f.tags[0]);
    });

    it.each([
      'city',
      'hours.city',
      'name.first',
      'tags.3',
      'constructor',
      '__proto__',
      'hours.',
      '',
    ])('has nothing for %j', (path) => {
      expect(fieldAt(f, path)).toBeUndefined();
    });
  });

  describe('serverErrors', () => {
    it('gives one error per field the server named, carrying its message', () => {
      const errors = serverErrors(
        f,
        apiError({ fieldErrors: { name: 'Taken', 'hours.closesAt': 'Too late' } }),
      );

      expect(errors).toEqual([
        { kind: SERVER, message: 'Taken', fieldTree: f.name },
        { kind: SERVER, message: 'Too late', fieldTree: f.hours.closesAt },
        { kind: SERVER, message: undefined, fieldTree: f },
      ]);
    });

    it('puts the key _ and a key without a field on the form itself', () => {
      const errors = serverErrors(
        f,
        apiError({ fieldErrors: { _: 'Something is off', city: 'Unknown city' } }),
      );

      expect(errors.map((e) => [e.message, e.fieldTree])).toEqual([
        ['Something is off', f],
        ['Unknown city', f],
      ]);
    });

    it('adds no empty error on the form when the server already put one there', () => {
      const errors = serverErrors(f, apiError({ fieldErrors: { _: 'Off', name: 'Taken' } }));

      expect(errors.filter((e) => e.fieldTree === f)).toHaveLength(1);
    });

    it('puts a failure without field errors (a 409, no network) on the form itself', () => {
      const errors = serverErrors(f, apiError({ status: 409, message: 'Remove the rooms first' }));

      expect(errors).toEqual([{ kind: SERVER, message: 'Remove the rooms first', fieldTree: f }]);
    });
  });

  describe('as a submit result', () => {
    const fail = (error: ApiError) =>
      submit(f, { action: () => Promise.resolve(serverErrors(f, error)) });

    it('shows each message on its field and the rest on the form', async () => {
      await fail(apiError({ fieldErrors: { name: 'Taken', _: 'Try later' } }));

      expect(
        f
          .name()
          .errors()
          .map((e) => e.message),
      ).toEqual(['Taken']);
      expect(f.hours.opensAt().errors()).toEqual([]);
      expect(formLevelMessages(f)).toEqual(['Try later']);
    });

    it('takes a field error away when that field is edited, and leaves the others', async () => {
      await fail(apiError({ fieldErrors: { name: 'Taken', 'hours.closesAt': 'Too late' } }));

      f.name().value.set('Lviv');

      expect(f.name().errors()).toEqual([]);
      expect(
        f.hours
          .closesAt()
          .errors()
          .map((e) => e.message),
      ).toEqual(['Too late']);
    });

    it('takes the form-level message away when any field is edited', async () => {
      await fail(apiError({ status: 409, message: 'Conflict', fieldErrors: {} }));
      expect(formLevelMessages(f)).toEqual(['Conflict']);

      f.hours.opensAt().value.set('09:00');

      expect(formLevelMessages(f)).toEqual([]);
    });

    it('makes the form invalid until the error is dealt with', async () => {
      await fail(apiError({ fieldErrors: { name: 'Taken' } }));
      expect(f().valid()).toBe(false);

      f.name().value.set('Lviv');

      expect(f().valid()).toBe(true);
    });
  });

  describe('hasBlockingErrors', () => {
    const fail = (error: ApiError) =>
      submit(f, { action: () => Promise.resolve(serverErrors(f, error)), ignoreValidators: 'all' });

    it('is false for a form without errors', () => {
      expect(hasBlockingErrors(f)).toBe(false);
    });

    it('is true while a field has an error from the server', async () => {
      await fail(apiError({ fieldErrors: { name: 'Taken' } }));

      expect(hasBlockingErrors(f)).toBe(true);
    });

    it('is false after a refusal of the whole attempt, which may pass next time', async () => {
      await fail(apiError({ status: 502, message: 'Bad gateway' }));
      expect(f().valid()).toBe(false);

      expect(hasBlockingErrors(f)).toBe(false);
    });

    it('is true for an error of the schema or the page, even on the form itself', async () => {
      await submit(f, {
        action: () => Promise.resolve({ kind: 'custom', message: 'Nope', fieldTree: f }),
        ignoreValidators: 'all',
      });

      expect(hasBlockingErrors(f)).toBe(true);
    });
  });

  describe('formLevelMessages', () => {
    it('is empty for a form with no errors of its own', () => {
      expect(formLevelMessages(f)).toEqual([]);
    });

    it('leaves out an error that has no message to show', async () => {
      await submit(f, {
        action: () =>
          Promise.resolve([
            { kind: 'custom', fieldTree: f },
            { kind: 'custom', message: 'Try later', fieldTree: f },
          ]),
      });

      expect(formLevelMessages(f)).toEqual(['Try later']);
    });
  });
});
