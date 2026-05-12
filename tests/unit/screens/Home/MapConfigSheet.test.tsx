import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { Select } from '@/components/ui/select';
import { MapConfigSheet } from '@/screens/Home/MapConfigSheet';

// Radix Select uses scrollIntoView internally which jsdom doesn't support
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('MapConfigSheet', () => {
  it('renders children when open', () => {
    render(
      <MapConfigSheet open={true} onOpenChange={() => {}} title="Settings">
        <div data-testid="sheet-child">Config content</div>
      </MapConfigSheet>,
    );
    expect(screen.getByTestId('sheet-child')).toBeInTheDocument();
    expect(screen.getByText('Config content')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <MapConfigSheet open={false} onOpenChange={() => {}} title="Settings">
        <div data-testid="sheet-child">Config content</div>
      </MapConfigSheet>,
    );
    expect(screen.queryByTestId('sheet-child')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('has a close button with accessible label', () => {
    render(
      <MapConfigSheet
        open={true}
        onOpenChange={() => {}}
        title="Settings"
        closeLabel="Close settings"
      >
        <div>Content</div>
      </MapConfigSheet>,
    );
    const closeBtn = screen.getByRole('button', {
      name: 'Close settings',
    });
    expect(closeBtn).toBeInTheDocument();
  });

  it('has a Dialog.Title for screen reader announcement', () => {
    render(
      <MapConfigSheet open={true} onOpenChange={() => {}} title="Map Settings">
        <div>Content</div>
      </MapConfigSheet>,
    );
    expect(
      screen.getByRole('dialog', { name: 'Map Settings' }),
    ).toBeInTheDocument();
  });

  it('has a drag-handle visual indicator at the top', () => {
    render(
      <MapConfigSheet open={true} onOpenChange={() => {}} title="Settings">
        <div>Content</div>
      </MapConfigSheet>,
    );
    const dragHandle = screen.getByTestId('drag-handle');
    expect(dragHandle).toBeInTheDocument();
  });

  it('has scrollable content area', () => {
    render(
      <MapConfigSheet open={true} onOpenChange={() => {}} title="Settings">
        <div>Content</div>
      </MapConfigSheet>,
    );
    const scrollable = screen.getByTestId('sheet-scrollable');
    expect(scrollable).toBeTruthy();
  });

  it('uses default close label when closeLabel is omitted', () => {
    render(
      <MapConfigSheet open={true} onOpenChange={() => {}} title="Settings">
        <div>Content</div>
      </MapConfigSheet>,
    );
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('renders Select dropdown options inside the Dialog content', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <MapConfigSheet open={true} onOpenChange={() => {}} title="Settings">
        <Select value="a" onValueChange={handleChange}>
          <Select.Item value="a">Option A</Select.Item>
          <Select.Item value="b">Option B</Select.Item>
        </Select>
      </MapConfigSheet>,
    );

    // Open the Select dropdown
    await user.click(screen.getByRole('combobox'));

    // Options should be present and interactable inside the Dialog
    expect(
      screen.getByRole('option', { name: 'Option A' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Option B' }),
    ).toBeInTheDocument();

    // Selecting an option should call onValueChange
    await user.click(screen.getByRole('option', { name: 'Option B' }));
    expect(handleChange).toHaveBeenCalledWith('b');
  });

  it('Select portal targets the internal container, not document.body', async () => {
    const user = userEvent.setup();

    render(
      <MapConfigSheet open={true} onOpenChange={() => {}} title="Settings">
        <Select placeholder="Pick one">
          <Select.Item value="x">Item X</Select.Item>
        </Select>
      </MapConfigSheet>,
    );

    await user.click(screen.getByRole('combobox'));

    // The dialog content element should contain the option
    const dialog = screen.getByRole('dialog');
    const options = dialog.querySelectorAll('[role="option"]');
    expect(options.length).toBe(1);
  });
});
