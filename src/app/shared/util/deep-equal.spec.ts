import { deepEqual } from './deep-equal';

describe('deepEqual', () => {
  it('compares primitives', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual('a', 'b')).toBe(false);
    expect(deepEqual(1, '1')).toBe(false);
    expect(deepEqual(Number.NaN, Number.NaN)).toBe(true);
  });

  it('tells null from undefined', () => {
    expect(deepEqual(null, undefined)).toBe(false);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(null, {})).toBe(false);
  });

  it('compares dates by the instant they stand for', () => {
    expect(deepEqual(new Date(2026, 0, 1), new Date(2026, 0, 1))).toBe(true);
    expect(deepEqual(new Date(2026, 0, 1), new Date(2026, 0, 2))).toBe(false);
    expect(deepEqual(new Date(2026, 0, 1), new Date(2026, 0, 1).getTime())).toBe(false);
    expect(deepEqual({ at: new Date(5) }, { at: new Date(5) })).toBe(true);
  });

  it('compares objects whatever the order of their keys', () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
  });

  it('treats a key holding undefined as a missing key, but null as a value', () => {
    expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(true);
    expect(deepEqual({ a: 1, b: null }, { a: 1 })).toBe(false);
  });

  it('compares nested data and arrays in order', () => {
    expect(deepEqual({ tags: ['a', 'b'], at: { h: 1 } }, { tags: ['a', 'b'], at: { h: 1 } })).toBe(
      true,
    );
    expect(deepEqual(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(deepEqual(['a'], ['a', 'b'])).toBe(false);
    expect(deepEqual([1], { 0: 1 })).toBe(false);
    expect(deepEqual({ 0: 1 }, [1])).toBe(false);
  });
});
