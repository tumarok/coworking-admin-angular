import { render } from '@testing-library/angular';
import { AppIcon } from './app-icon';
import { ICON_PATHS } from './icon-paths';

describe('AppIcon', () => {
  it('draws the named icon and hides it from assistive technology', async () => {
    const { container } = await render(AppIcon, { inputs: { name: 'menu' } });

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('viewBox', '0 -960 960 960');
    expect(container.querySelector('path')).toHaveAttribute('d', ICON_PATHS.menu);
  });

  it('draws another icon when the name changes', async () => {
    const { container, rerender } = await render(AppIcon, { inputs: { name: 'menu' } });

    await rerender({ inputs: { name: 'inbox' } });

    expect(container.querySelector('path')).toHaveAttribute('d', ICON_PATHS.inbox);
  });
});
