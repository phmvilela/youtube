import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { getAuth } from 'firebase/auth';
import { appConfig } from '../services/firebase';
import { callGas } from '../services/gasClient';
import { useAuth } from '../auth/AuthContext';
import {
  subscribeToActiveChannels, softDeleteChannel, subscribeToChannelSyncStatuses,
  type Channel, type ChannelSyncStatus,
} from '../services/firestore';
import {
  Box, Typography, List, ListItem, ListItemAvatar, Avatar, ListItemText,
  IconButton, Paper, AppBar, Toolbar, Container, LinearProgress,
  TextField, CircularProgress, ListItemButton, ClickAwayListener, Popper, Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import SyncIcon from '@mui/icons-material/Sync';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import UserMenu from '../components/UserMenu';
import { useSyncStatus } from '../contexts/SyncStatusContext';

/** Delay (ms) before triggering the real GAS sync after a channel is added. */
const SYNC_DELAY_MS = 5000;
const LS_KEY = 'pendingChannelSyncs';

export default function Admin() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const navigate = useNavigate();
  const { user, getAccessToken } = useAuth();
  const syncStatus = useSyncStatus();
  const isSyncActive = syncStatus.status === 'fetching_videos' || syncStatus.status === 'writing';

  // Channel search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Channel[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Per-channel sync state
  const [channelSyncStatuses, setChannelSyncStatuses] = useState<Record<string, ChannelSyncStatus>>({});
  const [pendingSyncs, setPendingSyncs] = useState<Set<string>>(new Set());
  const syncTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' && event.shiftKey) {
        event.preventDefault();
        navigate('/');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  // Subscribe to per-channel sync statuses from Firestore
  useEffect(() => {
    if (!user) return;
    return subscribeToChannelSyncStatuses(user.uid, setChannelSyncStatuses);
  }, [user]);

  // Trigger a per-channel sync after SYNC_DELAY_MS
  const triggerChannelSync = useCallback(async (channelId: string) => {
    if (!user) return;
    setPendingSyncs((prev) => { const next = new Set(prev); next.delete(channelId); return next; });
    // Remove from localStorage
    try {
      const stored = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      delete stored[channelId];
      localStorage.setItem(LS_KEY, JSON.stringify(stored));
    } catch { /* ignore */ }

    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) return;
      const accessToken = await getAccessToken();
      await callGas(appConfig.gasSyncUrl, {
        action: 'syncChannel',
        firebaseIdToken: idToken,
        accessToken,
        channelId,
        collectionName: appConfig.collectionName,
        databaseId: appConfig.databaseId,
      });
    } catch (err) {
      console.error('Per-channel sync failed for', channelId, err);
    }
  }, [user, getAccessToken]);

  // Schedule a sync for a newly added channel
  const scheduleChannelSync = useCallback((channelId: string) => {
    setPendingSyncs((prev) => new Set(prev).add(channelId));
    // Persist to localStorage
    try {
      const stored = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      stored[channelId] = Date.now();
      localStorage.setItem(LS_KEY, JSON.stringify(stored));
    } catch { /* ignore */ }

    syncTimers.current[channelId] = setTimeout(() => {
      delete syncTimers.current[channelId];
      triggerChannelSync(channelId);
    }, SYNC_DELAY_MS);
  }, [triggerChannelSync]);

  // On mount, restore pending syncs from localStorage
  useEffect(() => {
    try {
      const stored: Record<string, number> = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      const now = Date.now();
      for (const [channelId, timestamp] of Object.entries(stored)) {
        const elapsed = now - timestamp;
        if (elapsed >= SYNC_DELAY_MS) {
          // Overdue — trigger immediately (unless already syncing/complete)
          triggerChannelSync(channelId);
        } else {
          // Still waiting — set remaining timer
          setPendingSyncs((prev) => new Set(prev).add(channelId));
          syncTimers.current[channelId] = setTimeout(() => {
            delete syncTimers.current[channelId];
            triggerChannelSync(channelId);
          }, SYNC_DELAY_MS - elapsed);
        }
      }
    } catch { /* ignore */ }

    return () => {
      Object.values(syncTimers.current).forEach(clearTimeout);
    };
  }, [triggerChannelSync]);

  // Helper: get the effective sync indicator for a channel
  const getChannelSyncInfo = (channelId: string): { tooltip: string; icon: React.ReactNode } | null => {
    if (pendingSyncs.has(channelId)) {
      return {
        tooltip: 'Starting sync...',
        icon: <SyncIcon fontSize="small" sx={{ animation: 'spin 1.5s linear infinite', '@keyframes spin': { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } } }} color="info" />,
      };
    }
    const status = channelSyncStatuses[channelId];
    if (!status || status.status === 'idle') return null;

    if (status.status === 'fetching_videos') {
      return {
        tooltip: 'Starting sync...',
        icon: <SyncIcon fontSize="small" sx={{ animation: 'spin 1.5s linear infinite', '@keyframes spin': { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } } }} color="info" />,
      };
    }
    if (status.status === 'writing') {
      return {
        tooltip: `${status.synced} videos synced`,
        icon: <SyncIcon fontSize="small" sx={{ animation: 'spin 1.5s linear infinite', '@keyframes spin': { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } } }} color="info" />,
      };
    }
    if (status.status === 'complete') {
      return {
        tooltip: `${status.total} videos synced`,
        icon: <CheckCircleOutlineIcon fontSize="small" color="success" />,
      };
    }
    if (status.status === 'error') {
      return {
        tooltip: status.message || 'Sync failed',
        icon: <ErrorOutlineIcon fontSize="small" color="error" />,
      };
    }
    return null;
  };

  // Debounced channel search via GAS
  useEffect(() => {
    if (searchQuery.trim().length < 3) {
      setSearchResults([]);
      setDropdownOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const auth = getAuth();
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) return;

        const accessToken = await getAccessToken();
        const data = await callGas<{ channels: Channel[] }>(appConfig.gasSyncUrl, {
          action: 'searchChannels',
          firebaseIdToken: idToken,
          accessToken,
          query: searchQuery.trim(),
        });
        setSearchResults(data.channels || []);
        setDropdownOpen(true);
      } catch (err) {
        console.error('Channel search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleAddChannel = useCallback(async (channel: Channel) => {
    if (channels.some(c => c.id === channel.id)) return;

    setIsAdding(channel.id);
    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) return;

      const accessToken = await getAccessToken();
      await callGas(appConfig.gasSyncUrl, {
        action: 'addChannel',
        firebaseIdToken: idToken,
        accessToken,
        channel,
      });
      // onSnapshot will pick up the new channel automatically
      // Schedule per-channel sync after delay
      scheduleChannelSync(channel.id);
    } catch (err) {
      console.error('Failed to add channel:', err);
    } finally {
      setIsAdding(null);
      setSearchQuery('');
      setDropdownOpen(false);
    }
  }, [channels, scheduleChannelSync]);

  // Load from Firestore (user-scoped)
  useEffect(() => {
    if (!user) return;
    return subscribeToActiveChannels(
      user.uid,
      setChannels,
      (error) => console.error("Error listening to allowed_channels:", error),
    );
  }, [user]);

  const handleRemoveChannel = async (index: number) => {
    const channelToRemove = channels[index];
    if (channelToRemove && user) {
      try {
        await softDeleteChannel(user.uid, channelToRemove.id);
      } catch (e) {
        console.error("Failed to remove channel from Firestore", e);
      }
    }
  };

  // Resume syncing state if navigating back to a running sync
  useEffect(() => {
    if (isSyncActive) setIsSyncing(true);
    if (syncStatus.status === 'complete' || syncStatus.status === 'error') setIsSyncing(false);
  }, [syncStatus.status, isSyncActive]);

  const handleServerSync = async () => {
    if (!user) return;
    setIsSyncing(true);

    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not authenticated');

      const accessToken = await getAccessToken();
      await callGas<{ success: boolean; syncedCount?: number }>(appConfig.gasSyncUrl, {
        action: 'sync',
        firebaseIdToken: idToken,
        accessToken,
        collectionName: appConfig.collectionName,
        databaseId: appConfig.databaseId,
      });
    } catch (error) {
      console.error("Error during server sync:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Box sx={{ pb: 8 }}>
      <AppBar position="static" color="transparent" elevation={0}>
        <Toolbar>
          <IconButton edge="start" component={RouterLink} to="/" color="inherit" aria-label="back to search" sx={{ mr: 2 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h5" component="h1" fontWeight="bold" sx={{ flexGrow: 1 }}>
            YouTube Offline
          </Typography>
          <UserMenu />
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Typography variant="h4" component="h2" gutterBottom>Content Management - Allowed Channels</Typography>

      {/* Channel search */}
      <Box sx={{ mb: 4, position: 'relative' }}>
        <Typography variant="h6" sx={{ mb: 1 }}>Add Channel</Typography>
        <ClickAwayListener onClickAway={() => setDropdownOpen(false)}>
          <Box>
            <TextField
              inputRef={searchInputRef}
              fullWidth
              size="small"
              placeholder="Search YouTube channels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                  endAdornment: isSearching ? <CircularProgress size={20} /> : null,
                },
              }}
            />
            <Popper
              open={dropdownOpen && searchResults.length > 0}
              anchorEl={searchInputRef.current}
              placement="bottom-start"
              style={{ zIndex: 1300, width: searchInputRef.current?.offsetWidth }}
            >
              <Paper elevation={8} sx={{ maxHeight: 300, overflow: 'auto', mt: 0.5 }}>
                <List disablePadding>
                  {searchResults.map((result) => {
                    const alreadyAdded = channels.some(c => c.id === result.id);
                    return (
                      <ListItemButton
                        key={result.id}
                        disabled={alreadyAdded || isAdding === result.id}
                        onClick={() => handleAddChannel(result)}
                      >
                        <ListItemAvatar>
                          <Avatar src={result.thumbnail} alt={result.name}>
                            {result.name?.[0] ?? '?'}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={result.name}
                          secondary={alreadyAdded ? 'Already added' : result.id}
                          primaryTypographyProps={{ fontWeight: 'bold' }}
                        />
                        {!alreadyAdded && isAdding !== result.id && (
                          <AddIcon color="success" />
                        )}
                        {isAdding === result.id && <CircularProgress size={20} />}
                      </ListItemButton>
                    );
                  })}
                </List>
              </Paper>
            </Popper>
          </Box>
        </ClickAwayListener>
      </Box>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Saved Channels ({channels.length})</Typography>
        {channels.length === 0 ? (
          <Typography color="text.secondary">No channels saved yet.</Typography>
        ) : (
          <Paper variant="outlined">
            <List disablePadding>
              {channels.map((channel, index) => {
                const syncInfo = getChannelSyncInfo(channel.id);
                return (
                  <ListItem
                    key={channel.id}
                    divider={index !== channels.length - 1}
                    secondaryAction={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {syncInfo && (
                          <Tooltip title={syncInfo.tooltip} arrow>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              {syncInfo.icon}
                            </Box>
                          </Tooltip>
                        )}
                        <IconButton
                          edge="end"
                          aria-label="delete"
                          onClick={() => handleRemoveChannel(index)}
                          color="error"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Box>
                    }
                  >
                    <ListItemAvatar>
                      <Avatar src={channel.thumbnail} alt={channel.name}>
                        {channel.name ? channel.name[0] : '?'}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={channel.name}
                      primaryTypographyProps={{ fontWeight: 'bold' }}
                      secondary={channel.id}
                      secondaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
                    />
                  </ListItem>
                );
              })}
            </List>
          </Paper>
        )}
      </Box>

      <div style={{ marginTop: '30px', borderTop: '1px solid #ccc', paddingTop: '20px' }}>
        <h2>Sync Channel Content</h2>
        <p>Downloads metadata of recent uploads from configured channels for offline search.</p>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <button
            onClick={handleServerSync}
            disabled={isSyncing || isSyncActive}
            style={{
              padding: '10px 16px',
              fontSize: '16px',
              background: (isSyncing || isSyncActive) ? '#aaa' : '#28a745',
              color: 'white',
              border: 'none',
              cursor: (isSyncing || isSyncActive) ? 'not-allowed' : 'pointer',
              borderRadius: '4px',
              fontWeight: 'bold'
            }}
          >
            {(isSyncing || isSyncActive) ? 'Syncing...' : 'Sync Server Side (GAS)'}
          </button>
        </Box>

        {(isSyncActive || syncStatus.status === 'complete' || syncStatus.status === 'error') && (
          <Box sx={{
            mt: 2,
            p: 2,
            borderRadius: 1,
            bgcolor: syncStatus.status === 'error' ? 'error.dark' : 'background.paper',
            border: 1,
            borderColor: syncStatus.status === 'error' ? 'error.main' : 'divider',
          }}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {syncStatus.message}
            </Typography>
            {syncStatus.status === 'writing' && syncStatus.total > 0 && (
              <>
                <LinearProgress
                  variant="determinate"
                  value={(syncStatus.synced / syncStatus.total) * 100}
                  sx={{ height: 8, borderRadius: 1, mb: 0.5 }}
                />
                <Typography variant="caption" color="text.secondary">
                  {syncStatus.synced} / {syncStatus.total} videos
                </Typography>
              </>
            )}
            {syncStatus.status === 'fetching_videos' && (
              <LinearProgress sx={{ height: 8, borderRadius: 1 }} />
            )}
          </Box>
        )}
      </div>
      </Container>
    </Box>
  );
}
