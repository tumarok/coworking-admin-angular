import { z } from 'zod';
import type { MockInstance } from 'vitest';
import { parseResponse } from './parse-response';

const schema = z.object({ id: z.string(), size: z.number() });

describe('parseResponse', () => {
  let logged: MockInstance<typeof console.error>;

  beforeEach(() => {
    logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockRestore();
  });

  it('returns the validated data without logging', () => {
    const parse = parseResponse(schema, 'GET /desks/1');

    expect(parse({ id: 'd1', size: 2 })).toEqual({ id: 'd1', size: 2 });
    expect(logged).not.toHaveBeenCalled();
  });

  it('returns the data as received when it breaks the contract, and says where', () => {
    const parse = parseResponse(schema, 'GET /desks/1');
    const received = { id: 'd1', size: 'big' };

    expect(parse(received)).toBe(received);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith('Contract mismatch in GET /desks/1', expect.any(Array));
  });
});
