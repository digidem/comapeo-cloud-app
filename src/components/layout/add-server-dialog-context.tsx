import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';

import { AddArchiveServerDialog } from '@/screens/Home/AddArchiveServerDialog';

interface AddServerDialogContextValue {
  openAddServerDialog: () => void;
}

const AddServerDialogContext = createContext<AddServerDialogContextValue>({
  openAddServerDialog: () => {},
});

export function AddServerDialogProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const openAddServerDialog = useCallback(() => setIsOpen(true), []);
  const closeAddServerDialog = useCallback(() => setIsOpen(false), []);
  const value = useMemo(() => ({ openAddServerDialog }), [openAddServerDialog]);

  return (
    <AddServerDialogContext.Provider value={value}>
      {children}
      <AddArchiveServerDialog
        isOpen={isOpen}
        onClose={closeAddServerDialog}
        onAdded={closeAddServerDialog}
      />
    </AddServerDialogContext.Provider>
  );
}

export function useAddServerDialog() {
  return useContext(AddServerDialogContext);
}
