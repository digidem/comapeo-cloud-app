import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { comapeoStateStorage } from '@/lib/comapeo-local-storage';

export type Locale = 'en' | 'pt' | 'es';

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: 'en',
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: 'comapeo-locale',
      storage: createJSONStorage(() => comapeoStateStorage),
    },
  ),
);
