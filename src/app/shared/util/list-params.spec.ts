import { convertToParamMap } from '@angular/router';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@shared/api/contract/common';
import {
  dateFilter,
  enumFilter,
  parseListParams,
  serializeListParams,
  textFilter,
  type ListParamsConfig,
} from './list-params';

const STATUSES = ['active', 'inactive'] as const;

const filters = { status: enumFilter(STATUSES), city: textFilter, from: dateFilter };
const config: ListParamsConfig<typeof filters> = { filters };

const parse = (query: Record<string, string | string[]>) =>
  parseListParams(convertToParamMap(query), config);

describe('parseListParams', () => {
  it('falls back to the defaults for an empty URL', () => {
    expect(parse({})).toEqual({ page: 1, limit: DEFAULT_PAGE_SIZE, q: '' });
  });

  it('reads page, limit, search and filters', () => {
    expect(
      parse({
        page: '3',
        limit: '50',
        q: ' lisbon ',
        status: 'active',
        city: ' Porto ',
        from: '2026-10-12',
      }),
    ).toEqual({
      page: 3,
      limit: 50,
      q: 'lisbon',
      status: 'active',
      city: 'Porto',
      from: '2026-10-12',
    });
  });

  it.each(['abc', '0', '-2', '1.5', '2e3', ' 2', '', '99999999999999999999', 'NaN'])(
    'ignores the page %j',
    (page) => {
      expect(parse({ page }).page).toBe(1);
    },
  );

  it.each(['abc', '0', '-20', '10.5', ''])('uses the default limit for %j', (limit) => {
    expect(parse({ limit }).limit).toBe(DEFAULT_PAGE_SIZE);
  });

  it('lowers a limit above the maximum instead of sending it to the API', () => {
    expect(parse({ limit: '500' }).limit).toBe(MAX_PAGE_SIZE);
  });

  it('turns off a filter whose value is not valid', () => {
    const params = parse({ status: 'archived', city: '   ', from: '2026-02-31' });

    expect(params).toEqual({ page: 1, limit: DEFAULT_PAGE_SIZE, q: '' });
    expect('status' in params).toBe(false);
  });

  it('takes the first value of a repeated key', () => {
    expect(parse({ page: ['2', '5'], status: ['inactive', 'active'] })).toMatchObject({
      page: 2,
      status: 'inactive',
    });
  });

  it('uses the page size and the maximum the config names', () => {
    const custom = { defaultLimit: 10, maxLimit: 25 };

    expect(parseListParams(convertToParamMap({}), custom).limit).toBe(10);
    expect(parseListParams(convertToParamMap({ limit: '40' }), custom).limit).toBe(25);
  });

  it('does not fail on malformed percent escapes', () => {
    const source = { get: (name: string) => (name === 'q' ? '%E0%A4%A' : null) };

    expect(parseListParams(source).q).toBe('%E0%A4%A');
  });
});

describe('serializeListParams', () => {
  it('leaves out everything that equals its default', () => {
    expect(
      serializeListParams({ page: 1, limit: DEFAULT_PAGE_SIZE, q: '', status: undefined }, config),
    ).toEqual({ page: null, limit: null, q: null, status: null, city: null, from: null });
  });

  it('writes the values that differ', () => {
    expect(
      serializeListParams(
        { page: 2, limit: 50, q: ' desk ', status: 'active', city: 'Porto', from: '2026-10-12' },
        config,
      ),
    ).toEqual({
      page: '2',
      limit: '50',
      q: 'desk',
      status: 'active',
      city: 'Porto',
      from: '2026-10-12',
    });
  });

  it('drops values that cannot be written', () => {
    expect(
      serializeListParams(
        { page: Number.NaN, limit: -5, q: '  ', city: '  ', from: 'tomorrow' },
        config,
      ),
    ).toEqual({ page: null, limit: null, q: null, status: null, city: null, from: null });
  });

  it('round-trips through parse', () => {
    const state = parse({ page: '4', limit: '10', q: 'x', status: 'inactive', from: '2026-01-02' });
    const written = serializeListParams(state, config);
    const query = Object.fromEntries(
      Object.entries(written).filter(([, value]) => value !== null),
    ) as Record<string, string>;

    expect(parse(query)).toEqual(state);
  });

  it('handles a list without filters', () => {
    expect(serializeListParams({ page: 2 })).toEqual({ page: '2', limit: null, q: null });
  });
});

describe('filter codecs', () => {
  it('formats an enum member and rejects the rest', () => {
    const status = enumFilter(STATUSES);

    expect(status.format('active')).toBe('active');
    expect(status.format('nope' as 'active')).toBeUndefined();
  });

  it('accepts only real calendar dates', () => {
    expect(dateFilter.parse('2028-02-29')).toBe('2028-02-29');
    expect(dateFilter.parse('2026-02-29')).toBeUndefined();
    expect(dateFilter.parse('2026-2-9')).toBeUndefined();
    expect(dateFilter.format('2026-13-01')).toBeUndefined();
  });
});
