import { Routes, Route, Navigate } from 'react-router-dom';
import { CircularProgress, Box } from '@mui/material';
import { useAuth } from '../auth/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import Search from '../pages/Search';
import Watch from '../pages/Watch';
import KeyDebug from '../pages/KeyDebug';
import Admin from '../pages/Admin';
import Preferences from '../pages/Preferences';
import Login from '../pages/Login';
import AuthCallback from '../pages/AuthCallback';

export default function AppRoutes() {
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
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Search />} />
        <Route path="/watch/:id" element={<Watch />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/preferences" element={<Preferences />} />
      </Route>
    </Routes>
  );
}
