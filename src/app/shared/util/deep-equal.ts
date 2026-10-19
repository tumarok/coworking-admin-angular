/**
 * Whether two values hold the same data, for deciding if a form was changed. `JSON.stringify`
 * cannot do it: it turns a `Date` into text, depends on the order of keys and drops `undefined`.
 *
 * - dates are equal when they are the same instant;
 * - arrays are equal item by item, in order;
 * - objects are equal key by key whatever the order, and a key holding `undefined` counts as
 *   missing, but `null` is a value: `{ a: null }` is not `{}`;
 * - `NaN` equals `NaN`.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b || (Number.isNaN(a) && Number.isNaN(b))) return true;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => deepEqual(item, b[index]))
    );
  }
  if (isObject(a) && isObject(b)) {
    const keys = new Set([...definedKeys(a), ...definedKeys(b)]);
    return [...keys].every((key) => deepEqual(a[key], b[key]));
  }
  return false;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const definedKeys = (value: Record<string, unknown>) =>
  Object.keys(value).filter((key) => value[key] !== undefined);
