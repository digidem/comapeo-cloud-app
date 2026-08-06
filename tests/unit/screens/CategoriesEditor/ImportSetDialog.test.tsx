import { fireEvent, render, screen, waitFor } from '@tests/mocks/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { categoriesDb } from '@/lib/categories-db';
import { ImportSetDialog } from '@/screens/CategoriesEditor/ImportSetDialog';

beforeEach(async () => {
  await categoriesDb.categorySets.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

function makeValidFileContent() {
  return JSON.stringify({
    metadata: { name: 'Test Import' },
    categories: {
      animal: {
        name: 'Animal',
        icon: 'icon-animal.png',
        color: '#FF0000',
        fields: ['animal-type'],
        appliesTo: ['point'],
        tags: { type: 'animal' },
      },
    },
    fields: {
      'animal-type': {
        tagKey: 'animal-type',
        type: 'selectOne',
        label: 'Animal Type',
        options: [
          { label: 'Dog', value: 'dog' },
          { label: 'Cat', value: 'cat' },
        ],
      },
    },
  });
}

function makeInvalidFileContent() {
  return JSON.stringify({
    categories: 'not-an-object',
    fields: {},
  });
}

function simulateFileSelect(content: string, fileName = 'test.comapeocat') {
  const file = new File([content], fileName, { type: 'application/json' });
  const input = screen.getByLabelText(/file/i) as HTMLInputElement;
  Object.defineProperty(input, 'files', {
    value: [file],
    configurable: true,
  });
  fireEvent.change(input);
}

describe('ImportSetDialog', () => {
  it('renders file input when open', () => {
    render(<ImportSetDialog open onClose={vi.fn()} />);
    expect(screen.getByLabelText(/file/i)).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<ImportSetDialog open={false} onClose={vi.fn()} />);
    expect(screen.queryByLabelText(/file/i)).toBeNull();
  });

  it('shows validation error for invalid JSON', async () => {
    render(<ImportSetDialog open onClose={vi.fn()} />);

    simulateFileSelect(makeInvalidFileContent());

    await waitFor(() => {
      expect(screen.getByText(/invalid/i)).toBeInTheDocument();
    });
  });

  it('shows validation error for malformed JSON', async () => {
    render(<ImportSetDialog open onClose={vi.fn()} />);

    simulateFileSelect('not json at all');

    await waitFor(() => {
      expect(screen.getByText(/invalid json/i)).toBeInTheDocument();
    });
  });

  it('shows success on valid import', async () => {
    render(<ImportSetDialog open onClose={vi.fn()} />);

    simulateFileSelect(makeValidFileContent());

    await waitFor(() => {
      expect(screen.getByText(/imported/i)).toBeInTheDocument();
    });
  });

  it('stores the set in the database on valid import', async () => {
    render(<ImportSetDialog open onClose={vi.fn()} />);

    simulateFileSelect(makeValidFileContent());

    await waitFor(async () => {
      const sets = await categoriesDb.categorySets.toArray();
      expect(sets).toHaveLength(1);
      expect(sets[0]!.name).toBe('Test Import');
    });
  });

  it('shows confirmation before replacing existing set', async () => {
    // Pre-populate with an existing set whose setId matches the file name
    const { importCategorySet } = await import('@/lib/categories-db');
    await importCategorySet('test-import', 'Original', {
      categories: {},
      fields: {},
    });

    render(<ImportSetDialog open onClose={vi.fn()} />);

    simulateFileSelect(makeValidFileContent(), 'test-import.comapeocat');

    // Should show confirmation prompt with Replace button
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /replace/i }),
      ).toBeInTheDocument();
    });
  });

  it('closes dialog after successful import', async () => {
    const onClose = vi.fn();
    render(<ImportSetDialog open onClose={onClose} />);

    simulateFileSelect(makeValidFileContent());

    await waitFor(
      () => {
        expect(onClose).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );
  });

  it('executes replace when user confirms replacement of existing set', async () => {
    // Pre-populate an existing set
    const { importCategorySet } = await import('@/lib/categories-db');
    await importCategorySet('test-replace', 'Original', {
      categories: {},
      fields: {},
    });

    render(<ImportSetDialog open onClose={vi.fn()} />);

    simulateFileSelect(makeValidFileContent(), 'test-replace.comapeocat');

    // Wait for Replace button to appear
    const replaceBtn = await screen.findByRole('button', { name: /replace/i });
    fireEvent.click(replaceBtn);

    // Should show success message
    await waitFor(() => {
      expect(screen.getByText(/imported/i)).toBeInTheDocument();
    });

    // Verify the set was actually replaced
    const sets = await categoriesDb.categorySets.toArray();
    expect(sets).toHaveLength(1);
    expect(sets[0]!.name).toBe('Test Import');
  });

  it('shows file read error when file.text() rejects', async () => {
    render(<ImportSetDialog open onClose={vi.fn()} />);

    const input = screen.getByLabelText(/file/i) as HTMLInputElement;
    // Create a File whose .text() method rejects
    const badFile = new File([''], 'bad.comapeocat', {
      type: 'application/json',
    });
    vi.spyOn(badFile, 'text').mockRejectedValue(new Error('Disk error'));
    Object.defineProperty(input, 'files', {
      value: [badFile],
      configurable: true,
    });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText(/failed to read file/i)).toBeInTheDocument();
    });
  });
});
