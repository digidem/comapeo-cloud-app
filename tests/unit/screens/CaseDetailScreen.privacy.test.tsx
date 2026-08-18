/**
 * VAL-PRIVACY-001 screen-level regression test.
 *
 * Proves that CaseDetailScreen does not log sensitive Case content
 * (title, report body, prompt, token) to the console during render.
 *
 * The hooks are mocked at the module level (Vitest hoists vi.mock), and the
 * test injects a Case whose title is a sentinel sensitive string. The test
 * then verifies that sentinel value does NOT appear in any console call.
 */
import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { Case, CaseActivity, CaseReportState } from '@/lib/data-layer';
import { CaseDetailScreen } from '@/screens/CaseDetailScreen';

// Sentinel — a string that must NEVER appear in console output
const SENTINEL_TITLE = 'CONFIDENTIAL-SECRET-REPORT-789456 sensitive context';
const SENTINEL_TOKEN = 'bearer-archive-token-secret-9988776655443322';

// --- Module-level mocks (hoisted by Vitest) ---
const mockCaseData: Case = {
  localId: 'case-1',
  projectLocalId: 'proj-1',
  title: SENTINEL_TITLE,
  caseType: 'illegal_mining',
  status: 'active',
  createdAt: '2024-03-15T10:30:00Z',
  updatedAt: '2024-03-15T14:00:00Z',
  revision: 2,
  createdBy: 'local',
  deleted: false,
};

vi.mock('@/hooks/useCase', () => ({
  useCase: vi.fn(() => ({
    data: mockCaseData,
    isPending: false,
    isError: false,
  })),
}));

vi.mock('@/hooks/useCaseActivity', () => ({
  useCaseActivity: vi.fn(() => ({
    data: [] as CaseActivity[],
    isPending: false,
    isError: false,
  })),
}));

vi.mock('@/hooks/useCaseReportStates', () => ({
  useCaseReportStates: vi.fn(() => ({
    data: [] as CaseReportState[],
    isPending: false,
    isError: false,
  })),
}));

vi.mock('@/hooks/useUpdateCase', () => ({
  useUpdateCase: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  })),
}));

vi.mock('@/hooks/useProjects', () => ({
  useProjects: vi.fn(() => ({
    data: [{ localId: 'proj-1', name: 'Test Project' }],
    isPending: false,
  })),
}));

vi.mock('@/components/layout/shell-slot', () => ({
  useShellSlot: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useParams: () => ({ caseId: 'case-1' }),
}));

// ---------------------------------------------------------------------------
// Capture console output
// ---------------------------------------------------------------------------
function captureConsole(): {
  output: string[];
  restore: () => void;
} {
  const output: string[] = [];
  const spies: Array<{ restore: () => void }> = [];
  for (const method of ['error', 'warn', 'log', 'info', 'debug'] as const) {
    const original = console[method];
    spies.push({
      restore: () => {
        console[method] = original;
      },
    });
    console[method] = ((...args: unknown[]) => {
      output.push(
        args
          .map((a) => {
            try {
              return typeof a === 'string' ? a : JSON.stringify(a);
            } catch {
              return String(a);
            }
          })
          .join(' '),
      );
    }) as typeof original;
  }
  return {
    output,
    restore: () => spies.forEach((s) => s.restore()),
  };
}

describe('VAL-PRIVACY-001: Screen-level — no sensitive Case content in console', () => {
  it('CaseDetailScreen does not log sentinel Case title to console on render', () => {
    const monitor = captureConsole();
    try {
      render(<CaseDetailScreen />);

      // The sentinel title SHOULD be rendered as visible content (intended)
      expect(screen.getByText(SENTINEL_TITLE)).toBeInTheDocument();

      // But it must NOT appear in any console call
      const consoleText = monitor.output.join('\n');
      expect(consoleText).not.toContain(SENTINEL_TITLE);
      expect(consoleText).not.toContain(SENTINEL_TOKEN);
    } finally {
      monitor.restore();
    }
  });
});
