import { serializeParams } from './serialize-params';

describe('serializeParams', () => {
  it('stringifies numbers and booleans', () => {
    expect(serializeParams({ page: 2, includeRetired: false })).toEqual({
      includeRetired: 'false',
      page: '2',
    });
  });

  it('turns dates into ISO strings', () => {
    const params = serializeParams({ from: new Date('2026-10-14T09:00:00.000Z') });

    expect(params).toEqual({ from: '2026-10-14T09:00:00.000Z' });
  });

  it('leaves out unset, empty and meaningless values', () => {
    const params = serializeParams({
      a: undefined,
      b: null,
      c: '',
      d: [],
      e: Number.NaN,
      f: Number.POSITIVE_INFINITY,
      g: new Date('not a date'),
      h: [undefined as unknown as string, ''],
    });

    expect(params).toEqual({});
  });

  it('keeps zero and false, which are real values', () => {
    expect(serializeParams({ minCapacity: 0, active: false })).toEqual({
      active: 'false',
      minCapacity: '0',
    });
  });

  it('serializes a list as a repeated key and drops its empty items', () => {
    const params = serializeParams({ status: ['pending', '', 'confirmed'], ids: [3, 4] });

    expect(params).toEqual({ ids: ['3', '4'], status: ['pending', 'confirmed'] });
  });

  it('orders keys alphabetically, so equal parameters give an equal URL', () => {
    const a = serializeParams({ q: 'desk', page: 1 });
    const b = serializeParams({ page: 1, q: 'desk' });

    expect(Object.keys(a)).toEqual(['page', 'q']);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it.each([[undefined], [null]])('accepts %s', (params) => {
    expect(serializeParams(params)).toEqual({});
  });
});
