import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useApiKey } from '../hooks/useApiKey';
import FlexSearch from 'flexsearch';
import { collection, writeBatch, doc, setDoc, deleteDoc, getDocs, onSnapshot, query } from "firebase/firestore";
import { useFirestoreConfig } from '../hooks/useFirestoreConfig';
import FirestoreConfigModal from '../components/FirestoreConfigModal';
import ApiKeyModal from '../components/ApiKeyModal';
import { Box, Typography, List, ListItem, ListItemAvatar, Avatar, ListItemText, IconButton, Paper, AppBar, Toolbar, Container } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

const SYNCED_VIDEOS_STORAGE_KEY = 'synced-videos';
const DEFAULT_GAS_SYNC_URL = 'https://script.google.com/macros/s/AKfycby_L7FzgKimnYJKK-f2_5DvdJLQrUyK2bB_HXl6ncBlQ3EmLI9Oaz3kB9sY_a8yhhap/exec';

interface Channel {
  id: string;
  name: string;
  thumbnail?: string;
}

export default function Admin() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const { apiKey, saveApiKey } = useApiKey();
  const { config, saveConfig, db } = useFirestoreConfig();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Channel[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

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

  // Load from Firestore
  useEffect(() => {
    if (!db) return;
    
    const q = query(collection(db, 'allowed_channels'));
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
  }, [db]);

  // Fetch missing channel details if needed
  useEffect(() => {
    if (!apiKey || channels.length === 0 || !db) return;
    
    // Channels that only have ID and no name yet (meaning they just got parsed from old format or added via ID)
    const channelsToFetch = channels.filter(c => c.name === c.id);
    if (channelsToFetch.length === 0) return;

    const fetchMissingDetails = async () => {
      const ids = channelsToFetch.slice(0, 50).map(c => c.id).join(',');
      try {
        const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${ids}&key=${apiKey}`);
        const data = await res.json();
        if (data.items) {
          const fetchedMap = new Map();
          data.items.forEach((item: any) => {
            fetchedMap.set(item.id, {
              id: item.id,
              name: item.snippet.title,
              thumbnail: item.snippet.thumbnails?.default?.url
            });
          });
          
          const batch = writeBatch(db);
          let updatedCount = 0;

          channelsToFetch.forEach(c => {
            if (fetchedMap.has(c.id)) {
              batch.set(doc(db, 'allowed_channels', c.id), fetchedMap.get(c.id));
              updatedCount++;
            } else {
              batch.set(doc(db, 'allowed_channels', c.id), { ...c, name: c.id + ' (Unknown)' });
              updatedCount++;
            }
          });

          if (updatedCount > 0) {
            await batch.commit();
          }
        }
      } catch (err) {
        console.error("Failed to fetch missing channel details", err);
      }
    };
    
    fetchMissingDetails();
  }, [channels, apiKey, db]);

  // Handle outside click for dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (searchQuery.trim().length < 3) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      if (!apiKey) return;
      setIsSearching(true);
      try {
        const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(searchQuery)}&key=${apiKey}&maxResults=10`);
        const data = await res.json();
        if (data.items) {
          const results = data.items.map((item: any) => ({
            id: item.snippet.channelId,
            name: item.snippet.channelTitle,
            thumbnail: item.snippet.thumbnails?.default?.url
          }));
          setSearchResults(results);
          setShowDropdown(true);
        }
      } catch (err) {
        console.error("Failed to search channels", err);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, apiKey]);

  const handleSelectChannel = async (channel: Channel) => {
    if (!channels.some(c => c.id === channel.id)) {
      if (db) {
        try {
          await setDoc(doc(db, 'allowed_channels', channel.id), channel);
        } catch (e) {
          console.error("Failed to add channel to Firestore", e);
        }
      }
    }
    setSearchQuery('');
    setShowDropdown(false);
  };

  const handleRemoveChannel = async (index: number) => {
    const channelToRemove = channels[index];
    if (db && channelToRemove) {
      try {
        await deleteDoc(doc(db, 'allowed_channels', channelToRemove.id));
      } catch (e) {
        console.error("Failed to remove channel from Firestore", e);
      }
    }
  };

  const rebuildLocalIndex = async (allVideos: any[]) => {
    setSyncStatus('Building local search index...');
    try {
      const doc = new FlexSearch.Document({
        document: {
          id: "videoId",
          index: ["title", "channelName"],
          store: true
        }
      });

      for (const video of allVideos) {
        doc.add(video);
      }

      const indexData: Record<string, any> = {};
      await doc.export((key, data) => {
        if (data) {
          indexData[key.toString()] = data;
        }
      });
      localStorage.setItem('flexsearch-index', JSON.stringify(indexData));
      localStorage.setItem(SYNCED_VIDEOS_STORAGE_KEY, JSON.stringify(allVideos));
    } catch (err) {
      console.error('Error building search index:', err);
    }
  };

  const handleServerSync = async () => {
    const syncUrl = config?.gasSyncUrl || DEFAULT_GAS_SYNC_URL;

    setIsSyncing(true);
    setSyncStatus('Triggering server-side sync...');

    try {
      await fetch(syncUrl, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({ 
          collectionName: config?.collectionName || 'videos',
          databaseId: config?.databaseId || '(default)'
        })
      });
      
      setSyncStatus('Server sync triggered. Waiting a few seconds before fetching updates...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      setSyncStatus('Fetching updated videos from Firestore...');
      if (!db || !config) throw new Error("Database not initialized");
      
      const videosCollection = collection(db, config.collectionName);
      const querySnapshot = await getDocs(videosCollection);
      const allVideos: any[] = [];
      querySnapshot.forEach((doc) => {
        allVideos.push(doc.data());
      });

      await rebuildLocalIndex(allVideos);
      setSyncStatus(`Sync complete! Fetched ${allVideos.length} videos from Firestore.`);
    } catch (error) {
      console.error("Error during server sync:", error);
      setSyncStatus("An error occurred during server-side sync.");
    } finally {
      setIsSyncing(false);
    }
  };

  if (!apiKey) {
    return <ApiKeyModal onSave={saveApiKey} />;
  }

  if (!config || !db) {
    return <FirestoreConfigModal onSave={saveConfig} />;
  }

  return (
    <Box sx={{ pb: 8 }}>
      <AppBar position="static" color="transparent" elevation={0}>
        <Toolbar>
          <IconButton edge="start" component={RouterLink} to="/" color="inherit" aria-label="back to search" sx={{ mr: 2 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h5" component="h1" fontWeight="bold">
            YouTube Offline
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Typography variant="h4" component="h2" gutterBottom>Admin - Allowed Channels</Typography>
      
      <div style={{ position: 'relative', marginBottom: '30px' }} ref={dropdownRef}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search for a channel to add (min 3 chars)..."
          style={{ 
            padding: '12px', 
            width: '100%', 
            fontSize: '16px',
            boxSizing: 'border-box',
            borderRadius: '4px',
            border: '1px solid #ccc'
          }}
        />
        {isSearching && <div style={{ position: 'absolute', right: '12px', top: '12px', color: '#666' }}>Searching...</div>}
        
        {showDropdown && searchResults.length > 0 && (
          <div style={{ 
            position: 'absolute', 
            top: '100%', 
            left: 0, 
            right: 0, 
            backgroundColor: 'white', 
            border: '1px solid #ccc', 
            borderTop: 'none',
            borderRadius: '0 0 4px 4px',
            zIndex: 10,
            maxHeight: '300px',
            overflowY: 'auto',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}>
            {searchResults.map(channel => (
              <div 
                key={channel.id}
                onClick={() => handleSelectChannel(channel)}
                style={{ 
                  padding: '10px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  cursor: 'pointer',
                  borderBottom: '1px solid #eee'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
              >
                {channel.thumbnail && (
                  <img src={channel.thumbnail} alt={channel.name} style={{ width: '40px', height: '40px', borderRadius: '50%', marginRight: '15px' }} />
                )}
                <div>
                  <div style={{ fontWeight: 'bold', color: '#333' }}>{channel.name}</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>ID: {channel.id}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {showDropdown && searchResults.length === 0 && !isSearching && searchQuery.length >= 3 && (
          <div style={{
            position: 'absolute', 
            top: '100%', 
            left: 0, 
            right: 0, 
            backgroundColor: 'white', 
            border: '1px solid #ccc',
            padding: '10px',
            color: '#666'
          }}>
            No channels found.
          </div>
        )}
      </div>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Saved Channels ({channels.length})</Typography>
        {channels.length === 0 ? (
          <Typography color="text.secondary">No channels saved yet. Search and add one above.</Typography>
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
