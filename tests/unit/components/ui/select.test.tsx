import { render, screen } from '@tests/mocks/test-utils';
import { userEvent } from '@tests/mocks/test-utils';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { Select } from '@/components/ui/select';

// Radix Select uses scrollIntoView internally which jsdom doesn't support
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('Select', () => {
  it('renders trigger with placeholder when no value', () => {
    render(
      <Select placeholder="Choose an option">
        <Select.Item value="a">Option A</Select.Item>
        <Select.Item value="b">Option B</Select.Item>
      </Select>,
    );
    expect(screen.getByText('Choose an option')).toBeInTheDocument();
  });

  it('renders trigger with selected value', () => {
    render(
      <Select value="a" onValueChange={() => {}}>
        <Select.Item value="a">Option A</Select.Item>
        <Select.Item value="b">Option B</Select.Item>
      </Select>,
    );
    expect(screen.getByText('Option A')).toBeInTheDocument();
  });

  it('dropdown items are present in the DOM', async () => {
    const user = userEvent.setup();
    render(
      <Select placeholder="Pick one">
        <Select.Item value="x">Item X</Select.Item>
        <Select.Item value="y">Item Y</Select.Item>
      </Select>,
    );
    await user.click(screen.getByRole('combobox'));
    expect(screen.getByRole('option', { name: 'Item X' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Item Y' })).toBeInTheDocument();
  });

  it('calls onValueChange when an item is selected', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Select placeholder="Pick one" onValueChange={handleChange}>
        <Select.Item value="a">Option A</Select.Item>
        <Select.Item value="b">Option B</Select.Item>
      </Select>,
    );
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Option B' }));
    expect(handleChange).toHaveBeenCalledWith('b');
  });

  it('disabled state', () => {
    render(
      <Select placeholder="Pick one" disabled>
        <Select.Item value="a">Option A</Select.Item>
      </Select>,
    );
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});
