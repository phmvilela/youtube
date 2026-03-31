import { useState, useEffect } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { collection, doc, deleteDoc, onSnapshot, query } from "firebase/firestore";
import { getAuth } from 'firebase/auth';
import { db, appConfig } from '../config/firebase';
import { callGas } from '../lib/gasClient';
import { useAuth } from '../contexts/AuthContext';
import { Box, Typography, List, ListItem, ListItemAvatar, Avatar, ListItemText, IconButton, Paper, AppBar, Toolbar, Container } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import UserMenu from '../components/UserMenu';

interface Channel {
  id: string;
  name: string;
  thumbnail?: string;
}

export default function Admin() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();

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

  // Load from Firestore (user-scoped)
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'users', user.uid, 'allowed_channels'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedChannels: Channel[] = [];
      querySnapshot.forEach((doc) => {
        fetchedChannels.push(doc.data() as Channel);
      });
      setChannels(fetchedChannels);
    }, (error) => {
      console.error("Error listening to allowed_channels:", error);
    });

    return () => unsubscribe();
  }, [user]);

  const handleRemoveChannel = async (index: number) => {
    const channelToRemove = channels[index];
    if (channelToRemove && user) {
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'allowed_channels', channelToRemove.id));
      } catch (e) {
        console.error("Failed to remove channel from Firestore", e);
      }
    }
  };

  const handleServerSync = async () => {
    if (!user) return;
    setIsSyncing(true);
    setSyncStatus('Triggering server-side sync...');

    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not authenticated');

      const result = await callGas<{ success: boolean; syncedCount?: number }>(appConfig.gasSyncUrl, {
        action: 'sync',
        firebaseIdToken: idToken,
        collectionName: appConfig.collectionName,
        databaseId: appConfig.databaseId,
      });

      setSyncStatus(`Server sync complete. ${result.syncedCount ?? 0} videos synced.`);
    } catch (error) {
      console.error("Error during server sync:", error);
      setSyncStatus("An error occurred during server-side sync.");
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

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Saved Channels ({channels.length})</Typography>
        {channels.length === 0 ? (
          <Typography color="text.secondary">No channels saved yet.</Typography>
        ) : (
          <Paper variant="outlined">
            <List disablePadding>
              {channels.map((channel, index) => (
                <ListItem
                  key={index}
                  divider={index !== channels.length - 1}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      aria-label="delete"
                      onClick={() => handleRemoveChannel(index)}
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
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
              ))}
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
            disabled={isSyncing}
            style={{
              padding: '10px 16px',
              fontSize: '16px',
              background: isSyncing ? '#aaa' : '#28a745',
              color: 'white',
              border: 'none',
              cursor: isSyncing ? 'not-allowed' : 'pointer',
              borderRadius: '4px',
              fontWeight: 'bold'
            }}
          >
            {isSyncing ? 'Syncing...' : 'Sync Server Side (GAS)'}
          </button>
        </Box>

        {syncStatus && <div style={{
          marginTop: '15px',
          padding: '10px',
          backgroundColor: '#e8f4fd',
          borderLeft: '4px solid #007bff',
          color: '#0056b3'
        }}>{syncStatus}</div>}
      </div>
      </Container>
    </Box>
  );
}
