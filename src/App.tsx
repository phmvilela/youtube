import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { CircularProgress, Box } from '@mui/material';
import { useFirestoreConfig } from './hooks/useFirestoreConfig';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import FirestoreConfigModal from './components/FirestoreConfigModal';
import Search from './pages/Search';
import Watch from './pages/Watch';
import KeyDebug from './pages/KeyDebug';
import Admin from './pages/Admin';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#ff0000', // YouTube red
    },
    background: {
      default: '#0f0f0f',
      paper: '#282828',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
        },
      },
    },
  },
});

function RequireAuth() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/debug" element={<KeyDebug />} />

      {/* Protected routes */}
      <Route element={<RequireAuth />}>
        <Route path="/" element={<Search />} />
        <Route path="/watch/:id" element={<Watch />} />
        <Route path="/admin" element={<Admin />} />
      </Route>
    </Routes>
  );
}

function App() {
  const { config, saveConfig } = useFirestoreConfig();

  // Config must be provided before anything else works
  if (!config) {
    return (
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <FirestoreConfigModal onSave={saveConfig} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <BrowserRouter>
        <AuthProvider config={config}>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
