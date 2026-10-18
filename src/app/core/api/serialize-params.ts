type Scalar = string | number | boolean | Date;

/** Query parameters as the code holds them: filters that may be unset, dates, lists. */
export type QueryParams = Readonly<Record<string, Scalar | readonly Scalar[] | null | undefined>>;

export type SerializedParams = Record<string, string | string[]>;

/**
 * Turns parameters into what goes on the URL. Unset values, empty strings and empty lists are
 * left out (the API treats `?q=` like no filter anyway), dates become ISO strings, a list becomes a
 * repeated key. Keys are sorted, so equal parameters always give an equal URL and an equal cache key.
 */
export function serializeParams(params: QueryParams | null | undefined): SerializedParams {
  const result: SerializedParams = {};
  if (!params) return result;

  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (Array.isArray(value)) {
      const items = (value as readonly Scalar[]).map(serializeScalar).filter(isPresent);
      if (items.length > 0) result[key] = items;
    } else {
      const text = serializeScalar(value as Scalar | null | undefined);
      if (text !== undefined) result[key] = text;
    }
  }
  return result;
}

function serializeScalar(value: Scalar | null | undefined): string | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined;
  if (typeof value === 'boolean') return String(value);
  return value === undefined || value === null || value === '' ? undefined : value;
}

const isPresent = (value: string | undefined): value is string => value !== undefined;
