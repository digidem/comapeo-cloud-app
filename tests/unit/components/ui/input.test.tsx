import { render, screen } from '@tests/mocks/test-utils';
import { userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { createRef } from 'react';

import { Input } from '@/components/ui/input';

describe('Input', () => {
  it('renders with label', () => {
    render(<Input label="Email" />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('shows error message when error prop set', () => {
    render(<Input label="Email" error="Required field" />);
    expect(screen.getByText('Required field')).toBeInTheDocument();
  });

  it('error state adds red border class', () => {
    render(<Input label="Email" error="Required field" />);
    const input = screen.getByLabelText('Email');
    expect(input.className).toContain('border-error');
  });

  it('disabled state', () => {
    render(<Input label="Email" disabled />);
    expect(screen.getByLabelText('Email')).toBeDisabled();
  });

  it('value change triggers onChange', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();
    render(<Input label="Email" value="" onChange={handleChange} />);
    const input = screen.getByLabelText('Email');
    await user.type(input, 'a');
    expect(handleChange).toHaveBeenCalled();
  });

  it('renders with placeholder', () => {
    render(<Input label="Email" placeholder="Enter email" />);
    expect(screen.getByPlaceholderText('Enter email')).toBeInTheDocument();
  });

  it('renders with custom type', () => {
    render(<Input label="Password" type="password" />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
  });

  it('forwards ref to underlying input element', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} label="Test Label" />);

    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current).toBe(screen.getByLabelText('Test Label'));
  });

  it('ref can focus the input element', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} label="Focusable" />);

    ref.current?.focus();
    expect(ref.current).toHaveFocus();
  });
});
