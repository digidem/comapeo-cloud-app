import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { CreateProjectNavAction } from '@/components/shared/CreateProjectNavAction';

describe('CreateProjectNavAction', () => {
  it('renders the shared label and calls onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(<CreateProjectNavAction onClick={onClick} />);

    const button = screen.getByRole('button', { name: 'Create Project' });
    await user.click(button);

    expect(onClick).toHaveBeenCalledOnce();
  });
});
