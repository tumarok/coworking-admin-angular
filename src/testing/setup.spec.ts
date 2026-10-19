import { getConfig } from '@testing-library/angular';

describe('the test setup', () => {
  it('lets Testing Library wait five seconds for something to appear', () => {
    expect(getConfig().dom.asyncUtilTimeout).toBe(5_000);
  });

  it('lets vi.waitFor wait longer than its own default second', async () => {
    const readyAt = Date.now() + 1_200;

    await vi.waitFor(() => {
      expect(Date.now()).toBeGreaterThanOrEqual(readyAt);
    });
  });

  it('keeps an explicit timeout of vi.waitFor', async () => {
    await expect(
      vi.waitFor(
        () => {
          throw new Error('never');
        },
        { timeout: 50 },
      ),
    ).rejects.toThrow('never');
  });
});
