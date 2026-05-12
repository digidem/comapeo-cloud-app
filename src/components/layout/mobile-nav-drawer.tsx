import * as Dialog from '@radix-ui/react-dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';

import type { ReactNode } from 'react';

import { Link } from '@tanstack/react-router';

interface MobileNavDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  navItems: Array<{ path: string; label: string; icon: ReactNode }>;
  activePath: string;
  secondaryContent?: ReactNode;
  onNavigate: () => void;
}

function MobileNavDrawer({
  open,
  onOpenChange,
  navItems,
  activePath,
  secondaryContent,
  onNavigate,
}: MobileNavDrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            transition: 'opacity 150ms ease-out',
          }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          style={{
            position: 'fixed',
            top: 0,
            bottom: 0,
            left: 0,
            width: '85vw',
            maxWidth: '24rem',
            zIndex: 50,
            transform: open ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          className="flex flex-col bg-surface-card shadow-elevated focus:outline-none"
        >
          {/* Visually hidden title for accessibility */}
          <Dialog.Title asChild>
            <VisuallyHidden.Root>Navigation Menu</VisuallyHidden.Root>
          </Dialog.Title>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-lg font-semibold text-text">
              CoMapeo Cloud
            </span>
            <Dialog.Close
              className="inline-flex h-11 w-11 items-center justify-center rounded-btn text-text-muted hover:text-text hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Close menu"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 15 15"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
                  fill="currentColor"
                  fillRule="evenodd"
                  clipRule="evenodd"
                />
              </svg>
            </Dialog.Close>
          </div>

          {/* Nav section */}
          <nav className="flex-1 overflow-y-auto px-2 py-2">
            {navItems.map((item) => {
              const isActive = activePath === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => onNavigate()}
                  className={`flex w-full items-center gap-3 rounded-btn px-3 py-3 text-sm font-medium ${
                    isActive
                      ? 'bg-primary-soft text-primary'
                      : 'text-text hover:bg-surface'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {/* Secondary content */}
            {secondaryContent !== undefined && (
              <>
                <div className="my-2 border-t border-border" />
                <div>{secondaryContent}</div>
              </>
            )}
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export { MobileNavDrawer };
export type { MobileNavDrawerProps };
