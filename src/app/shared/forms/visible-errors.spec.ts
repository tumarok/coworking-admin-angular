import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, validate } from '@angular/forms/signals';
import { visibleErrors } from './visible-errors';

describe('visibleErrors', () => {
  const setup = () =>
    TestBed.runInInjectionContext(() =>
      form(signal({ name: '' }), (path) => {
        validate(path.name, ({ value }) =>
          value() ? undefined : { kind: 'required', message: 'Required' },
        );
      }),
    );

  it('hides the errors of a field the person has not been in', () => {
    const f = setup();

    expect(f.name().errors()).toHaveLength(1);
    expect(visibleErrors(f.name)).toEqual([]);
  });

  it('shows them once the field was touched', () => {
    const f = setup();

    f.name().markAsTouched();

    expect(visibleErrors(f.name).map((e) => e.message)).toEqual(['Required']);
  });

  it('shows nothing for a touched field that is fine', () => {
    const f = setup();
    f.name().value.set('Kyiv');

    f.name().markAsTouched();

    expect(visibleErrors(f.name)).toEqual([]);
  });

  describe('for an error that compares fields', () => {
    const setupPair = () =>
      TestBed.runInInjectionContext(() =>
        form(signal({ opens: '09:00', closes: '08:00' }), (path) => {
          validate(path.closes, (ctx) =>
            ctx.value() > ctx.valueOf(path.opens)
              ? undefined
              : { kind: 'order', message: 'Close after open' },
          );
        }),
      );

    it('stays hidden while neither field was touched', () => {
      const f = setupPair();

      expect(visibleErrors(f.closes, f.opens)).toEqual([]);
    });

    it('shows once the field it depends on was touched, though its own was not', () => {
      const f = setupPair();

      f.opens().markAsTouched();

      expect(visibleErrors(f.closes, f.opens).map((e) => e.message)).toEqual(['Close after open']);
      expect(visibleErrors(f.closes)).toEqual([]);
    });

    it('shows once its own field was touched', () => {
      const f = setupPair();

      f.closes().markAsTouched();

      expect(visibleErrors(f.closes, f.opens)).toHaveLength(1);
    });
  });
});
