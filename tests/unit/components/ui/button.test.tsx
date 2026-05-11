import { render, screen } from '@tests/mocks/test-utils';
import { userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('renders children text', () => {
    render(<Button>Click me</Button>);
    expect(
      screen.getByRole('button', { name: 'Click me' }),
    ).toBeInTheDocument();
  });

  it('renders primary variant with correct classes', () => {
    render(<Button variant="primary">Primary</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-primary');
    expect(btn.className).toContain('text-white');
  });

  it('renders secondary variant with correct classes', () => {
    render(<Button variant="secondary">Secondary</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-white');
    expect(btn.className).toContain('border');
    expect(btn.className).toContain('text-text');
  });

  it('renders ghost variant with correct classes', () => {
    render(<Button variant="ghost">Ghost</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-transparent');
  });

  it('renders danger variant with correct classes', () => {
    render(<Button variant="danger">Danger</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-error');
    expect(btn.className).toContain('text-white');
  });

  it('renders sm size with correct classes', () => {
    render(<Button size="sm">Small</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('px-3');
    expect(btn.className).toContain('py-1.5');
    expect(btn.className).toContain('text-sm');
  });

  it('renders md (default) size with correct classes', () => {
    render(<Button>Default</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('px-4');
    expect(btn.className).toContain('py-2');
    expect(btn.className).toContain('text-sm');
  });

  it('renders lg size with correct classes', () => {
    render(<Button size="lg">Large</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('px-6');
    expect(btn.className).toContain('py-3');
    expect(btn.className).toContain('text-base');
  });

  it('disabled state prevents clicks', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button disabled onClick={handleClick}>
        Disabled
      </Button>,
    );
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('loading state shows spinner and is aria-busy', () => {
    render(<Button loading>Loading</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    // Spinner is an SVG element
    const spinner = btn.querySelector('svg');
    expect(spinner).toBeInTheDocument();
  });

  it('click handler works', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={handleClick}>Click</Button>);
    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies additional className', () => {
    render(<Button className="extra-class">Custom</Button>);
    expect(screen.getByRole('button').className).toContain('extra-class');
  });

  it('renders with default type="button"', () => {
    render(<Button>Submit</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('renders with custom type', () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('sm size has min-h-[44px] class for touch target', () => {
    render(<Button size="sm">Small</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('min-h-[44px]');
  });

  it('md (default) size has min-h-[44px] class for touch target', () => {
    render(<Button>Default</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('min-h-[44px]');
  });

  it('lg size does NOT have min-h-[44px] class', () => {
    render(<Button size="lg">Large</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).not.toContain('min-h-[44px]');
  });
});
