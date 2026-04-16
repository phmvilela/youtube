import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider } from '../auth/AuthContext';
import { SyncStatusProvider } from '../contexts/SyncStatusContext';
import { SearchCacheProvider } from '../contexts/SearchCacheContext';
import darkTheme from './theme';
import AppRoutes from './routes';

export default function App() {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <BrowserRouter>
        <AuthProvider>
          <SyncStatusProvider>
            <SearchCacheProvider>
              <AppRoutes />
            </SearchCacheProvider>
          </SyncStatusProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
