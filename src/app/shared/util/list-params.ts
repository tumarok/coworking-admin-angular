import type { Params } from '@angular/router';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@shared/api/contract/common';

/**
 * How a list's state travels through the URL: `?page=2&limit=50&q=lisbon&status=active`. The URL
 * is the only copy of that state (see `withListParams`), so reading it must never fail: a person
 * can type anything into the address bar.
 */

/** Anything that reads query parameters by name, such as Angular's `ParamMap`. */
export interface ParamSource {
  get(name: string): string | null;
}

/** Reads and writes one filter. A filter that cannot be read is simply off. */
export interface FilterCodec<V> {
  /** The value for a raw URL string, or `undefined` when the string is not a valid value. */
  parse(raw: string): V | undefined;
  /** The URL string for a value, or `undefined` to leave the filter out. */
  format(value: V): string | undefined;
}

export type FilterCodecs = Readonly<Record<string, FilterCodec<unknown>>>;

export type FilterValues<C extends FilterCodecs> = {
  [K in keyof C]?: C[K] extends FilterCodec<infer V> ? V : never;
};

export type ListParams<C extends FilterCodecs> = {
  /** 1-based. */
  page: number;
  limit: number;
  /** Free-text search, trimmed; empty when there is none. */
  q: string;
} & FilterValues<C>;

export interface ListParamsConfig<C extends FilterCodecs> {
  /** Filters by their URL key. */
  filters?: C;
  /** The page size when the URL names none; it is left out of the URL. */
  defaultLimit?: number;
  /** The biggest page size the API accepts; a larger one in the URL is lowered to it. */
  maxLimit?: number;
}

/** Keys the list state owns itself; a filter cannot use them. */
export const RESERVED_KEYS = ['page', 'limit', 'q'] as const;

/** A free-text filter: trimmed, and off when blank. */
export const textFilter: FilterCodec<string> = {
  parse: (raw) => raw.trim() || undefined,
  format: (value) => value.trim() || undefined,
};

/** One of a fixed set of values, for example a status; anything else is off. */
export function enumFilter<const T extends readonly string[]>(values: T): FilterCodec<T[number]> {
  const isMember = (value: string): value is T[number] => values.includes(value);
  return {
    parse: (raw) => (isMember(raw) ? raw : undefined),
    format: (value) => (isMember(value) ? value : undefined),
  };
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isCalendarDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  // `2026-02-31` rolls over to March, so a date that does not survive the round trip is invalid.
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** A calendar date as `YYYY-MM-DD`; a value that is not a real date is off. */
export const dateFilter: FilterCodec<string> = {
  parse: (raw) => (isCalendarDate(raw) ? raw : undefined),
  format: (value) => (isCalendarDate(value) ? value : undefined),
};

function positiveInteger(raw: string | null): number | undefined {
  if (raw === null || !/^\d+$/.test(raw)) return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

interface Limits {
  defaultLimit: number;
  maxLimit: number;
}

function limitsOf(config: ListParamsConfig<FilterCodecs>): Limits {
  return {
    defaultLimit: config.defaultLimit ?? DEFAULT_PAGE_SIZE,
    maxLimit: config.maxLimit ?? MAX_PAGE_SIZE,
  };
}

/** The list state a URL describes. Anything unreadable falls back to the default. */
export function parseListParams<C extends FilterCodecs>(
  source: ParamSource,
  config: ListParamsConfig<C> = {},
): ListParams<C> {
  const { defaultLimit, maxLimit } = limitsOf(config);
  const params: Record<string, unknown> = {
    page: positiveInteger(source.get('page')) ?? 1,
    limit: Math.min(positiveInteger(source.get('limit')) ?? defaultLimit, maxLimit),
    q: (source.get('q') ?? '').trim(),
  };

  for (const [key, codec] of Object.entries(config.filters ?? {})) {
    const raw = source.get(key);
    const value = raw === null ? undefined : codec.parse(raw);
    if (value !== undefined) params[key] = value;
  }
  return params as ListParams<C>;
}

/**
 * The query parameters for a list state, as Angular's router takes them with
 * `queryParamsHandling: 'merge'`: a value that equals its default is `null`, which removes the
 * parameter, so a plain first page stays `/rooms` and the URLs people share stay short.
 */
export function serializeListParams<C extends FilterCodecs>(
  params: Partial<ListParams<C>>,
  config: ListParamsConfig<C> = {},
): Params {
  const { defaultLimit } = limitsOf(config);
  const { page, limit, q } = params;
  const normalizedQ = q?.trim();
  const result: Params = {
    page: page !== undefined && Number.isSafeInteger(page) && page > 1 ? String(page) : null,
    limit:
      limit !== undefined && Number.isSafeInteger(limit) && limit > 0 && limit !== defaultLimit
        ? String(limit)
        : null,
    q: normalizedQ === undefined || normalizedQ === '' ? null : normalizedQ,
  };

  for (const [key, codec] of Object.entries(config.filters ?? {})) {
    const value = (params as Record<string, unknown>)[key];
    result[key] = value === undefined ? null : (codec.format(value) ?? null);
  }
  return result;
}
