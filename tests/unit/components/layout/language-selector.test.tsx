import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import { LanguageSelector } from '@/components/layout/language-selector';

describe('LanguageSelector', () => {
  it('renders the globe icon and current locale code', () => {
    render(<LanguageSelector />);
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    // Default locale is 'en' (CSS uppercase class makes it display as EN)
    expect(button).toHaveTextContent('en');
  });

  it('shows dropdown with locale options when clicked', async () => {
    render(<LanguageSelector />);
    const button = screen.getByRole('button');
    await userEvent.click(button);

    // Dropdown should show all three languages
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('Português')).toBeInTheDocument();
    expect(screen.getByText('Español')).toBeInTheDocument();
  });

  it('highlights the current locale in the dropdown', async () => {
    render(<LanguageSelector />);
    const button = screen.getByRole('button');
    await userEvent.click(button);

    const englishOption = screen.getByText('English');
    expect(englishOption.className).toContain('font-bold');
    expect(englishOption.className).toContain('text-primary');
  });

  it('closes dropdown after selecting a locale', async () => {
    render(<LanguageSelector />);
    const button = screen.getByRole('button');
    await userEvent.click(button);

    // Click Portuguese
    await userEvent.click(screen.getByText('Português'));

    // Dropdown should be closed
    expect(screen.queryByText('English')).not.toBeInTheDocument();
    expect(screen.queryByText('Español')).not.toBeInTheDocument();

    // Button should now show updated locale (CSS uppercase, DOM is lowercase)
    expect(button).toHaveTextContent('pt');
  });

  it('closes dropdown when clicking outside', async () => {
    render(
      <div>
        <span data-testid="outside">Outside</span>
        <LanguageSelector />
      </div>,
    );
    const button = screen.getByRole('button');
    await userEvent.click(button);

    // Dropdown visible
    expect(screen.getByText('English')).toBeInTheDocument();

    // Click outside
    await userEvent.click(screen.getByTestId('outside'));

    // Dropdown closed
    expect(screen.queryByText('English')).not.toBeInTheDocument();
  });

  it('toggles dropdown open/close on repeated clicks', async () => {
    render(<LanguageSelector />);
    const button = screen.getByRole('button');

    // Open
    await userEvent.click(button);
    expect(screen.getByText('English')).toBeInTheDocument();

    // Close
    await userEvent.click(button);
    expect(screen.queryByText('English')).not.toBeInTheDocument();
  });
});
