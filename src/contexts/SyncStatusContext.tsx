import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from './AuthContext';
import { Snackbar, Alert } from '@mui/material';

export interface SyncStatus {
  status: 'idle' | 'fetching_videos' | 'writing' | 'complete' | 'error';
  total: number;
  synced: number;
  message: string;
  startedAt?: string;
}

const DEFAULT_STATUS: SyncStatus = {
  status: 'idle',
  total: 0,
  synced: 0,
  message: '',
};

const SyncStatusContext = createContext<SyncStatus>(DEFAULT_STATUS);

export function useSyncStatus() {
  return useContext(SyncStatusContext);
}

export function SyncStatusProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(DEFAULT_STATUS);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  useEffect(() => {
    if (!user) {
      setSyncStatus(DEFAULT_STATUS);
      return;
    }

    const statusRef = doc(db, 'users', user.uid, 'sync_status', 'current');
    const unsubscribe = onSnapshot(statusRef, (snapshot) => {
      if (!snapshot.exists()) {
        setSyncStatus(DEFAULT_STATUS);
        return;
      }

      const data = snapshot.data();
      const newStatus: SyncStatus = {
        status: data.status ?? 'idle',
        total: data.total ?? 0,
        synced: data.synced ?? 0,
        message: data.message ?? '',
        startedAt: data.startedAt,
      };

      setSyncStatus((prev) => {
        // Show snackbar when transitioning to complete or error
        if (prev.status !== 'idle' && prev.status !== newStatus.status) {
          if (newStatus.status === 'complete') {
            setSnackbar({ open: true, message: newStatus.message, severity: 'success' });
          } else if (newStatus.status === 'error') {
            setSnackbar({ open: true, message: newStatus.message || 'Sync failed', severity: 'error' });
          }
        }
        return newStatus;
      });
    }, (error) => {
      console.error('Error listening to sync status:', error);
    });

    return () => unsubscribe();
  }, [user]);

  return (
    <SyncStatusContext.Provider value={syncStatus}>
      {children}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </SyncStatusContext.Provider>
  );
}
