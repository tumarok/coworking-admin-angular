import { render, screen } from '@testing-library/angular';
import { provideTestApp } from '@testing/test-providers';
import { NotFoundPage } from './not-found-page';

describe('NotFoundPage', () => {
  it('says the page does not exist and leads back to the dashboard', async () => {
    await render(NotFoundPage, { providers: provideTestApp() });

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(
      screen.getByText('The page you are looking for does not exist or has been moved.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the dashboard' })).toHaveAttribute(
      'href',
      '/',
    );
  });
});
