import { AppProviders } from '@/app/providers';
import { useThemeClass } from '@/hooks/useThemeClass';

import './styles.css';

function App() {
  useThemeClass();
  return <AppProviders />;
}

export { App };
