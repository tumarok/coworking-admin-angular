import { HttpErrorResponse } from '@angular/common/http';
import { GENERIC_ERROR_MESSAGE, NETWORK_ERROR_MESSAGE, parseApiError } from './api-error';

const failure = (status: number, error: unknown) => new HttpErrorResponse({ status, error });

describe('parseApiError', () => {
  it('reads the message of the contract error body', () => {
    const error = parseApiError(failure(404, { message: 'Room not found' }));

    expect(error).toEqual({
      status: 404,
      message: 'Room not found',
      fieldErrors: {},
      conflicts: [],
    });
  });

  it('keeps the field errors of a 422, including the form-wide `_` key', () => {
    const error = parseApiError(
      failure(422, {
        message: 'Validation failed',
        fieldErrors: { email: 'Enter a valid email', _: 'Fix the highlighted fields' },
      }),
    );

    expect(error.status).toBe(422);
    expect(error.fieldErrors).toEqual({
      email: 'Enter a valid email',
      _: 'Fix the highlighted fields',
    });
  });

  it('keeps the booking conflicts of a 409', () => {
    const conflicts = [
      { id: 'bk_1', startsAt: '2026-10-14T09:00:00.000Z', endsAt: '2026-10-14T10:00:00.000Z' },
    ];

    const error = parseApiError(failure(409, { message: 'Already booked', conflicts }));

    expect(error.conflicts).toEqual(conflicts);
  });

  it('parses a body that arrived as JSON text', () => {
    const error = parseApiError(failure(409, '{"message":"Cannot delete"}'));

    expect(error.message).toBe('Cannot delete');
  });

  it('drops the parts of the body that break the contract and keeps the rest', () => {
    const goodConflict = {
      id: 'bk_1',
      startsAt: '2026-10-14T09:00:00.000Z',
      endsAt: '2026-10-14T10:00:00.000Z',
    };

    const error = parseApiError(
      failure(409, {
        message: 'Already booked',
        fieldErrors: { name: 'Required', age: 7 },
        conflicts: [goodConflict, { id: 'bk_2' }, null, 'bk_3'],
      }),
    );

    expect(error.message).toBe('Already booked');
    expect(error.fieldErrors).toEqual({ name: 'Required' });
    expect(error.conflicts).toEqual([goodConflict]);
  });

  it.each([
    ['a list', []],
    ['text', 'name'],
  ])('ignores field errors and conflicts that are %s', (_, value) => {
    const error = parseApiError(
      failure(422, { message: 'Validation failed', fieldErrors: value, conflicts: value }),
    );

    expect(error.fieldErrors).toEqual({});
    expect(error.conflicts).toEqual([]);
  });

  it.each([
    ['plain text', 'Bad gateway'],
    ['an empty body', null],
    ['an object without a message', { detail: 'oops' }],
    ['an empty message', { message: '' }],
    ['a message that is not text', { message: 42 }],
  ])('falls back to the generic text for %s', (_, body) => {
    expect(parseApiError(failure(502, body)).message).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('explains a request that never got an answer', () => {
    const error = parseApiError(failure(0, new ProgressEvent('error')));

    expect(error.status).toBe(0);
    expect(error.message).toBe(NETWORK_ERROR_MESSAGE);
  });

  it.each([
    ['an error that is not an HTTP failure', new Error('boom')],
    ['a value that is not an error', 'boom'],
  ])('treats %s as a generic failure', (_, thrown) => {
    expect(parseApiError(thrown)).toEqual({
      status: 0,
      message: GENERIC_ERROR_MESSAGE,
      fieldErrors: {},
      conflicts: [],
    });
  });
});
