import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * The rules the suite holds the app to: WCAG 2.0 and 2.1, levels A and AA, and axe's best practices
 * (the app is clean on them today; axe is pinned by the lockfile, so a new rule cannot surprise CI).
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

/**
 * Waits for the animations that end (a dialog opening, a panel fading in) so that axe reads
 * the final colours, not the ones halfway. Animations that never end (a progress bar) are left.
 */
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const ending = document
      .getAnimations()
      .filter((animation) =>
        Number.isFinite(animation.effect?.getComputedTiming().endTime ?? Infinity),
      );
    await Promise.all(ending.map((animation) => animation.finished.catch(() => undefined)));
  });
}

/**
 * Fails when axe finds a violation on the page as it is now. The message lists each rule with
 * what it asks for and where it was broken, so the failure reads as a to-do list.
 */
export async function expectAccessible(page: Page): Promise<void> {
  await settle(page);
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const report = violations
    .map((violation) => {
      const where = violation.nodes.map((node) => `    ${node.target.join(' ')}`).join('\n');
      return `${violation.id} (${violation.impact ?? 'unrated'}): ${violation.help}\n${where}`;
    })
    .join('\n\n');
  expect(report, 'Accessibility violations').toBe('');
}
